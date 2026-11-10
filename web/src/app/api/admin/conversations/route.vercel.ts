import { sql } from "@/server/db";
import { handler, json, requireAdmin } from "@/server/http";

export const GET = handler(async (req: Request) => {
  requireAdmin(req);
  const convs = (await sql`SELECT c.id, c.lang, c.handed_off, c.created_at, c.updated_at, count(m.id)::int AS messages
      FROM conversations c LEFT JOIN messages m ON m.conv_id=c.id
      GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 30`) as Record<string, unknown>[];
  const ids = convs.map((c) => c.id as string);
  const msgs = ids.length
    ? ((await sql`SELECT conv_id, role, content, answered, created_at FROM messages
                  WHERE conv_id = ANY(${ids}::uuid[]) ORDER BY id`) as Record<string, unknown>[])
    : [];
  return json(convs.map((c) => ({ ...c, transcript: msgs.filter((m) => m.conv_id === c.id) })));
});
