"""AI Knowledge-Base Chatbot API (FastAPI).

Public:  /api/health, /api/config, /api/chat (SSE stream), /api/handoff
Admin:   /api/admin/*  (Authorization: Bearer <ADMIN_TOKEN>)
"""
import hmac
import json
import logging
import re
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import anthropic
import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import db
from .config import settings
from .ingest import IngestError, extract_text, fetch_url, seed_knowledge, store_document
from .llm import stream_answer
from .rag import embed, retrieve

log = logging.getLogger("rag")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PHONE_RE = re.compile(r"^\+?[\d\s\-()]{7,20}$")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    await run_in_threadpool(embed, ["warm up"])  # load the embedding model once
    n = await run_in_threadpool(seed_knowledge, settings.knowledge_dir)
    if n:
        log.info("Seeded %d demo documents", n)
    yield


app = FastAPI(title="AI Knowledge-Base Chatbot", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")


# ---------------- helpers ----------------

_hits: dict[str, deque] = defaultdict(deque)


def client_ip(req: Request) -> str:
    return (req.headers.get("cf-connecting-ip") or req.headers.get("x-forwarded-for", "").split(",")[0]
            or (req.client.host if req.client else "?")).strip()


def rate_limit(req: Request, limit: int = 20, window: int = 300) -> None:
    q, now = _hits[client_ip(req)], time.time()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many messages, please wait a few minutes.")
    q.append(now)


def require_admin(authorization: str = Header(default="")) -> None:
    token = authorization.removeprefix("Bearer ").strip()
    if not settings.admin_token or not hmac.compare_digest(token, settings.admin_token):
        raise HTTPException(401, "Invalid admin token")


def sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ---------------- public API ----------------

@app.get("/api/health")
def health():
    with db.conn() as c:
        docs = c.execute("SELECT count(*) AS n FROM documents").fetchone()["n"]
    return {"ok": True, "documents": docs, "model": settings.model}


@app.get("/api/config")
def config():
    return {"business": settings.business_name}


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    conversation_id: uuid.UUID | None = None
    lang: str = "en"


@app.post("/api/chat")
async def chat(body: ChatIn, request: Request):
    rate_limit(request)
    lang = body.lang if body.lang in ("en", "ar", "tr") else "en"
    question = body.message.strip()

    def prepare():
        with db.conn() as c:
            conv = None
            if body.conversation_id:
                conv = c.execute("SELECT id FROM conversations WHERE id=%s", (body.conversation_id,)).fetchone()
            if not conv:
                conv = c.execute("INSERT INTO conversations (lang) VALUES (%s) RETURNING id", (lang,)).fetchone()
            hist = c.execute(
                "SELECT role, content FROM (SELECT role, content, id FROM messages WHERE conv_id=%s ORDER BY id DESC LIMIT 6) t ORDER BY id",
                (conv["id"],),
            ).fetchall()
        return str(conv["id"]), [dict(h) for h in hist], retrieve(question)

    conv_id, history, passages = await run_in_threadpool(prepare)
    sources = [{"n": i, "title": p["title"], "snippet": p["content"][:220]} for i, p in enumerate(passages, 1)]

    async def events():
        yield sse("meta", {"conversation_id": conv_id, "sources": sources})
        state, parts = {"handoff": False}, []
        try:
            async for delta in stream_answer(question, passages, history, lang, state):
                parts.append(delta)
                yield sse("delta", {"text": delta})
        except anthropic.APIError as e:
            log.warning("LLM error: %s", e)
            yield sse("error", {"message": "The assistant is temporarily unavailable. Please try again."})
            return
        answer = "".join(parts).strip()

        def save():
            with db.conn() as c:
                c.execute("INSERT INTO messages (conv_id, role, content) VALUES (%s,'user',%s)", (conv_id, question))
                c.execute(
                    "INSERT INTO messages (conv_id, role, content, sources, answered) VALUES (%s,'assistant',%s,%s,%s)",
                    (conv_id, answer, json.dumps(sources, ensure_ascii=False), not state["handoff"]),
                )
                c.execute("UPDATE conversations SET updated_at=now(), lang=%s WHERE id=%s", (lang, conv_id))

        await run_in_threadpool(save)
        yield sse("done", {"handoff": state["handoff"]})

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class HandoffIn(BaseModel):
    conversation_id: uuid.UUID | None = None
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=120)
    phone: str = Field(max_length=25)
    note: str = Field(default="", max_length=1000)
    lang: str = "en"


@app.post("/api/handoff")
async def handoff(body: HandoffIn, request: Request):
    rate_limit(request, limit=5, window=600)
    if not EMAIL_RE.match(body.email.strip()):
        raise HTTPException(422, "Invalid email")
    if not PHONE_RE.match(body.phone.strip()):
        raise HTTPException(422, "Invalid phone number")

    transcript = ""
    if body.conversation_id:
        with db.conn() as c:
            rows = c.execute(
                "SELECT role, content FROM messages WHERE conv_id=%s ORDER BY id DESC LIMIT 8", (body.conversation_id,)
            ).fetchall()
            c.execute("UPDATE conversations SET handed_off=true WHERE id=%s", (body.conversation_id,))
        transcript = "\n".join(f"{'Visitor' if r['role'] == 'user' else 'Bot'}: {r['content'][:300]}" for r in reversed(rows))

    message = (f"[Website chatbot hand-off — {settings.business_name}]\n"
               f"Visitor note: {body.note.strip() or '(none)'}\n\nRecent chat:\n{transcript or '(no messages)'}")[:2900]
    if not settings.lead_webhook_url:
        raise HTTPException(503, "Hand-off is not configured")
    payload = {"name": body.name.strip(), "email": body.email.strip(), "phone": body.phone.strip(),
               "company": "", "budget": "Not sure yet", "type": "Chatbot hand-off", "message": message,
               "lang": body.lang if body.lang in ("en", "ar", "tr") else "en", "website": ""}
    try:
        async with httpx.AsyncClient(timeout=60) as h:
            r = await h.post(settings.lead_webhook_url, json=payload)
        r.raise_for_status()
    except httpx.HTTPError as e:
        log.warning("Hand-off webhook failed: %s", e)
        raise HTTPException(502, "Could not reach the team right now, please try again.")
    return {"ok": True}


# ---------------- admin API ----------------

admin = [Depends(require_admin)]


@app.get("/api/admin/stats", dependencies=admin)
def stats():
    with db.conn() as c:
        row = c.execute("""SELECT
            (SELECT count(*) FROM documents) AS documents,
            (SELECT count(*) FROM chunks) AS chunks,
            (SELECT count(*) FROM conversations) AS conversations,
            (SELECT count(*) FROM messages WHERE role='user') AS questions,
            (SELECT count(*) FROM messages WHERE role='assistant' AND NOT answered) AS unanswered,
            (SELECT count(*) FROM conversations WHERE handed_off) AS handoffs""").fetchone()
        unanswered = c.execute("""SELECT u.content AS question, a.created_at
            FROM messages a JOIN LATERAL (SELECT content FROM messages u WHERE u.conv_id=a.conv_id AND u.role='user'
                 AND u.id < a.id ORDER BY u.id DESC LIMIT 1) u ON true
            WHERE a.role='assistant' AND NOT a.answered ORDER BY a.id DESC LIMIT 10""").fetchall()
    return {**row, "recent_unanswered": unanswered}


@app.get("/api/admin/documents", dependencies=admin)
def list_documents():
    with db.conn() as c:
        return c.execute("SELECT * FROM documents ORDER BY id DESC").fetchall()


@app.post("/api/admin/documents", dependencies=admin)
async def upload_document(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB")
    try:
        text = await run_in_threadpool(extract_text, file.filename or "file", data)
        title = re.sub(r"\.[a-z0-9]+$", "", file.filename or "Document", flags=re.I)
        return await run_in_threadpool(store_document, title, file.filename or "upload",
                                       (file.filename or "").rsplit(".", 1)[-1].lower(), text)
    except IngestError as e:
        raise HTTPException(422, str(e))


class UrlIn(BaseModel):
    url: str = Field(max_length=500)


@app.post("/api/admin/documents/url", dependencies=admin)
async def add_url(body: UrlIn):
    try:
        title, text = await run_in_threadpool(fetch_url, body.url.strip())
        return await run_in_threadpool(store_document, title, body.url.strip(), "url", text)
    except IngestError as e:
        raise HTTPException(422, str(e))


@app.delete("/api/admin/documents/{doc_id}", dependencies=admin)
def delete_document(doc_id: int):
    with db.conn() as c:
        if not c.execute("DELETE FROM documents WHERE id=%s RETURNING id", (doc_id,)).fetchone():
            raise HTTPException(404, "Document not found")
    return {"ok": True}


@app.get("/api/admin/conversations", dependencies=admin)
def conversations(limit: int = 30):
    with db.conn() as c:
        convs = c.execute("""SELECT c.id, c.lang, c.handed_off, c.created_at, c.updated_at, count(m.id) AS messages
            FROM conversations c LEFT JOIN messages m ON m.conv_id=c.id
            GROUP BY c.id ORDER BY c.updated_at DESC LIMIT %s""", (min(limit, 100),)).fetchall()
        for conv in convs:
            conv["transcript"] = c.execute(
                "SELECT role, content, answered, created_at FROM messages WHERE conv_id=%s ORDER BY id", (conv["id"],)
            ).fetchall()
    return convs
