import { sql, storeDocument } from "@/server/db";
import { UserError } from "@/server/errors";
import { handler, json, requireAdmin } from "@/server/http";
import { extractText } from "@/server/text";

export const maxDuration = 60;
const MAX_MB = 4; // Vercel request bodies are limited to 4.5 MB

export const GET = handler(async (req: Request) => {
  requireAdmin(req);
  return json(await sql`SELECT * FROM documents ORDER BY id DESC`);
});

export const POST = handler(async (req: Request) => {
  requireAdmin(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new UserError("No file uploaded");
  if (file.size > MAX_MB * 1024 * 1024) throw new UserError(`File is larger than ${MAX_MB} MB`, 413);
  const text = await extractText(file.name, new Uint8Array(await file.arrayBuffer()));
  const title = file.name.replace(/\.[a-z0-9]+$/i, "");
  return json(await storeDocument(title, file.name, (file.name.split(".").pop() || "").toLowerCase(), text));
});
