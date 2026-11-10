import { sql } from "@/server/db";
import { handler, json, requireAdmin } from "@/server/http";

export const GET = handler(async (req: Request) => {
  requireAdmin(req);
  return json(await sql`SELECT id, name, email, phone, note, lang, transcript, created_at FROM leads ORDER BY id DESC LIMIT 100`);
});
