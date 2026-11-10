import { config, sql } from "@/server/db";
import { handler, json } from "@/server/http";

export const GET = handler(async () => {
  const [{ n }] = (await sql`SELECT count(*)::int AS n FROM documents`) as { n: number }[];
  return json({ ok: true, documents: n, model: config.model, edition: "vercel" });
});
