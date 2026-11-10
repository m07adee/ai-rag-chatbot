"""PostgreSQL + pgvector storage: documents, chunks, conversations, messages."""
from contextlib import contextmanager

from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

SCHEMA = f"""
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    source      TEXT NOT NULL,
    kind        TEXT NOT NULL,
    chunk_count INT  NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
    id        SERIAL PRIMARY KEY,
    doc_id    INT  NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    idx       INT  NOT NULL,
    content   TEXT NOT NULL,
    embedding vector({settings.embed_dim}) NOT NULL,
    tsv       tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv);

CREATE TABLE IF NOT EXISTS conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lang        TEXT NOT NULL DEFAULT 'en',
    handed_off  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    conv_id    UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    sources    JSONB NOT NULL DEFAULT '[]',
    answered   BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conv_id, id);
"""

pool: ConnectionPool | None = None


def _configure(conn):
    register_vector(conn)


def init_db() -> None:
    global pool
    # create the extension before pgvector types are registered on pooled connections
    import psycopg

    with psycopg.connect(settings.database_url, autocommit=True) as c:
        c.execute("CREATE EXTENSION IF NOT EXISTS vector")
    pool = ConnectionPool(settings.database_url, min_size=1, max_size=8, configure=_configure, open=True)
    with conn() as c:
        c.execute(SCHEMA)


@contextmanager
def conn():
    assert pool is not None, "init_db() not called"
    with pool.connection() as c:
        c.row_factory = dict_row
        yield c
