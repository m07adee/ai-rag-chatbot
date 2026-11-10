"""Embeddings (local, multilingual, free) and hybrid retrieval (vector + keyword, fused with RRF)."""
from functools import lru_cache

import numpy as np

from .config import settings
from .db import conn


@lru_cache(maxsize=1)
def _model():
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=settings.embed_model, cache_dir="/app/models")


def embed(texts: list[str]) -> list[np.ndarray]:
    return [np.asarray(v, dtype=np.float32) for v in _model().embed(texts, batch_size=32)]


def retrieve(question: str, k: int | None = None) -> list[dict]:
    """Reciprocal-rank fusion of semantic search (pgvector) and keyword search (Postgres full text)."""
    k = k or settings.top_k
    qv = embed([question])[0]
    with conn() as c:
        vec = c.execute(
            """SELECT c.id, c.content, c.idx, d.title, d.source, 1 - (c.embedding <=> %s) AS score
               FROM chunks c JOIN documents d ON d.id = c.doc_id
               ORDER BY c.embedding <=> %s LIMIT 12""",
            (qv, qv),
        ).fetchall()
        kw = c.execute(
            """SELECT c.id, c.content, c.idx, d.title, d.source,
                      ts_rank(c.tsv, websearch_to_tsquery('simple', %s)) AS score
               FROM chunks c JOIN documents d ON d.id = c.doc_id
               WHERE c.tsv @@ websearch_to_tsquery('simple', %s)
               ORDER BY score DESC LIMIT 12""",
            (question, question),
        ).fetchall()

    fused: dict[int, dict] = {}
    for ranked in (vec, kw):
        for rank, row in enumerate(ranked):
            item = fused.setdefault(row["id"], {**row, "rrf": 0.0, "similarity": 0.0})
            item["rrf"] += 1 / (60 + rank)
    for row in vec:
        fused[row["id"]]["similarity"] = float(row["score"])
    best = sorted(fused.values(), key=lambda r: r["rrf"], reverse=True)[:k]
    return [
        {"id": r["id"], "title": r["title"], "source": r["source"], "content": r["content"],
         "similarity": round(r["similarity"], 3)}
        for r in best
    ]
