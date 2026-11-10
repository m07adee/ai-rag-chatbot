/** Serverless Postgres (Neon) access + one-time schema creation and demo seeding. */
import { neon } from "@neondatabase/serverless";
import { SEED_DOCS } from "./knowledge";
import { chunkText } from "./text";
import { UserError } from "./errors";

export { UserError };

export const config = {
  apiKey: process.env.ANTHROPIC_API_KEY || "",
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  model: process.env.CLAUDE_MODEL || "claude-haiku-5-5",
  adminToken: process.env.ADMIN_TOKEN || "",
  business: process.env.BUSINESS_NAME || "Lumina Dental Studio",
  leadWebhook: process.env.LEAD_WEBHOOK_URL || "",
};

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const sql = neon(url);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS documents (
     id SERIAL PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL,
     chunk_count INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS chunks (
     id SERIAL PRIMARY KEY, doc_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     idx INT NOT NULL, content TEXT NOT NULL,
     tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED)`,
  `CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv)`,
  `CREATE TABLE IF NOT EXISTS conversations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lang TEXT NOT NULL DEFAULT 'en',
     handed_off BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS messages (
     id SERIAL PRIMARY KEY, conv_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL,
     sources JSONB NOT NULL DEFAULT '[]', answered BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conv_id, id)`,
  `CREATE TABLE IF NOT EXISTS leads (
     id SERIAL PRIMARY KEY, conv_id UUID, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'en', transcript TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
];

let ready: Promise<void> | null = null;

/** Create tables once per server instance and seed the demo knowledge base if it is empty. */
export function ensureDb(): Promise<void> {
  if (!url) return Promise.reject(new Error("DATABASE_URL is not configured"));
  ready ??= (async () => {
    for (const stmt of SCHEMA) await sql.query(stmt);
    const [{ n }] = (await sql`SELECT count(*)::int AS n FROM documents`) as { n: number }[];
    if (n === 0) {
      for (const d of SEED_DOCS) {
        const title = /^# (.+)$/m.exec(d.text)?.[1]?.trim() || d.source;
        await storeDocument(title, d.source, "md", d.text);
      }
    }
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function storeDocument(title: string, source: string, kind: string, text: string) {
  const pieces = chunkText(text);
  if (!pieces.length) throw new UserError("No readable text found in this document");
  const [doc] = (await sql`INSERT INTO documents (title, source, kind, chunk_count)
    VALUES (${title.slice(0, 200)}, ${source.slice(0, 500)}, ${kind}, ${pieces.length}) RETURNING *`) as Record<string, unknown>[];
  await sql.query(
    "INSERT INTO chunks (doc_id, idx, content) SELECT $1, i - 1, c FROM unnest($2::text[]) WITH ORDINALITY AS t(c, i)",
    [doc.id, pieces],
  );
  return doc;
}
