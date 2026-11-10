"""Turn files and web pages into clean text chunks, embed them and store them."""
import io
import re
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

from .db import conn
from .rag import embed

CHUNK_CHARS = 900
OVERLAP_CHARS = 150


class IngestError(ValueError):
    pass


# ---------- text extraction ----------

def extract_text(filename: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((p.extract_text() or "") for p in reader.pages)
    if ext == ".docx":
        from docx import Document

        doc = Document(io.BytesIO(data))
        return "\n\n".join(p.text for p in doc.paragraphs)
    if ext in (".txt", ".md", ".csv"):
        for enc in ("utf-8", "utf-16", "cp1256", "latin-1"):
            try:
                return data.decode(enc)
            except UnicodeDecodeError:
                continue
    raise IngestError(f"Unsupported file type: {ext or 'unknown'} (use PDF, DOCX, TXT, MD or CSV)")


def fetch_url(url: str) -> tuple[str, str]:
    if not re.match(r"^https?://", url):
        raise IngestError("URL must start with http:// or https://")
    try:
        r = httpx.get(url, timeout=20, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 (RAG ingest bot)"})
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise IngestError(f"Could not fetch the page: {e}") from e
    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "svg", "form"]):
        tag.decompose()
    title = (soup.title.string or url).strip() if soup.title else url
    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = main.get_text("\n")
    return title[:200], text


# ---------- chunking ----------

def clean(text: str) -> str:
    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


def chunk(text: str) -> list[str]:
    """Paragraph-aware chunks of ~CHUNK_CHARS with a small overlap; markdown headings stay attached."""
    paras = [p.strip() for p in clean(text).split("\n\n") if p.strip()]
    chunks, cur, heading = [], "", ""
    for p in paras:
        if p.startswith("#"):
            heading = p.lstrip("# ").strip()
        while len(p) > CHUNK_CHARS:  # very long paragraph: hard split on sentence-ish boundary
            cut = max(p.rfind(". ", 0, CHUNK_CHARS), p.rfind("\n", 0, CHUNK_CHARS), CHUNK_CHARS // 2)
            chunks.append(p[: cut + 1].strip())
            p = p[cut + 1 :].strip()
        if len(cur) + len(p) + 2 > CHUNK_CHARS and cur:
            chunks.append(cur.strip())
            tail = cur[-OVERLAP_CHARS:]
            cur = (f"{heading}\n" if heading and not p.startswith("#") else "") + tail[tail.find(" ") + 1 :] + "\n\n"
        cur += p + "\n\n"
    if cur.strip():
        chunks.append(cur.strip())
    return [c for c in chunks if len(c) > 20]


# ---------- storage ----------

def store_document(title: str, source: str, kind: str, text: str) -> dict:
    pieces = chunk(text)
    if not pieces:
        raise IngestError("No readable text found in this document")
    vectors = embed(pieces)
    with conn() as c:
        doc = c.execute(
            "INSERT INTO documents (title, source, kind, chunk_count) VALUES (%s,%s,%s,%s) RETURNING *",
            (title[:200], source[:500], kind, len(pieces)),
        ).fetchone()
        with c.cursor() as cur:
            cur.executemany(
                "INSERT INTO chunks (doc_id, idx, content, embedding) VALUES (%s,%s,%s,%s)",
                [(doc["id"], i, t, v) for i, (t, v) in enumerate(zip(pieces, vectors))],
            )
    return doc


def seed_knowledge(folder: str) -> int:
    """Load bundled demo knowledge on first start (only when the knowledge base is empty)."""
    with conn() as c:
        if c.execute("SELECT count(*) AS n FROM documents").fetchone()["n"]:
            return 0
    count = 0
    for path in sorted(Path(folder).glob("*")):
        if path.suffix.lower() in (".md", ".txt", ".pdf", ".docx"):
            text = extract_text(path.name, path.read_bytes())
            title = next((l.lstrip("# ").strip() for l in text.splitlines() if l.startswith("# ")), path.stem)
            store_document(title, path.name, path.suffix.lstrip(".").lower(), text)
            count += 1
    return count
