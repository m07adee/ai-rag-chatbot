import { sql } from "@/server/db";
import { UserError } from "@/server/errors";
import { handler, json, requireAdmin } from "@/server/http";

export const DELETE = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  requireAdmin(req);
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new UserError("Invalid id", 400);
  const rows = (await sql`DELETE FROM documents WHERE id=${id} RETURNING id`) as unknown[];
  if (!rows.length) throw new UserError("Document not found", 404);
  return json({ ok: true });
});
