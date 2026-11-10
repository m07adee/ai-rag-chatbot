import { sql } from "@/server/db";
import { handler, json, requireAdmin } from "@/server/http";

export const GET = handler(async (req: Request) => {
  requireAdmin(req);
  const [row] = (await sql`SELECT
      (SELECT count(*)::int FROM documents) AS documents,
      (SELECT count(*)::int FROM chunks) AS chunks,
      (SELECT count(*)::int FROM conversations) AS conversations,
      (SELECT count(*)::int FROM messages WHERE role='user') AS questions,
      (SELECT count(*)::int FROM messages WHERE role='assistant' AND NOT answered) AS unanswered,
      (SELECT count(*)::int FROM leads) AS handoffs`) as Record<string, number>[];
  const recent = await sql`SELECT u.content AS question, a.created_at FROM messages a
      JOIN LATERAL (SELECT content FROM messages u WHERE u.conv_id=a.conv_id AND u.role='user' AND u.id < a.id
                    ORDER BY u.id DESC LIMIT 1) u ON true
      WHERE a.role='assistant' AND NOT a.answered ORDER BY a.id DESC LIMIT 10`;
  return json({ ...row, recent_unanswered: recent });
});
