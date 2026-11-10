import { storeDocument } from "@/server/db";
import { handler, json, requireAdmin } from "@/server/http";
import { fetchPage } from "@/server/text";

export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  requireAdmin(req);
  const { url = "" } = await req.json().catch(() => ({}));
  const clean = String(url).trim().slice(0, 500);
  const page = await fetchPage(clean);
  return json(await storeDocument(page.title, clean, "url", page.text));
});
