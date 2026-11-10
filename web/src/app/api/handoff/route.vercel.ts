import { config, sql } from "@/server/db";
import { UserError } from "@/server/errors";
import { handler, json, rateLimit } from "@/server/http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saves the visitor's contact request as a lead (admin "Leads" tab); optionally forwards it to a webhook. */
export const POST = handler(async (req: Request) => {
  rateLimit(req, 5, 600);
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim();
  const phone = String(b.phone || "").trim();
  const note = String(b.note || "").trim().slice(0, 1000);
  const lang = ["en", "ar", "tr"].includes(b.lang) ? b.lang : "en";
  if (name.length < 2 || name.length > 80) throw new UserError("Invalid name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) throw new UserError("Invalid email");
  if (!/^\+?[\d\s\-()]{7,20}$/.test(phone)) throw new UserError("Invalid phone number");
  const convId = UUID.test(b.conversation_id || "") ? b.conversation_id : null;

  let transcript = "";
  if (convId) {
    const rows = (await sql`SELECT role, content FROM messages WHERE conv_id=${convId} ORDER BY id DESC LIMIT 8`) as {
      role: string;
      content: string;
    }[];
    transcript = rows.reverse().map((r) => `${r.role === "user" ? "Visitor" : "Bot"}: ${r.content.slice(0, 300)}`).join("\n");
    await sql`UPDATE conversations SET handed_off=true WHERE id=${convId}`;
  }
  await sql`INSERT INTO leads (conv_id, name, email, phone, note, lang, transcript)
            VALUES (${convId}, ${name}, ${email}, ${phone}, ${note}, ${lang}, ${transcript})`;

  if (config.leadWebhook) {
    const message = `[Website chatbot hand-off - ${config.business}]\nVisitor note: ${note || "(none)"}\n\nRecent chat:\n${transcript || "(no messages)"}`.slice(0, 2900);
    await fetch(config.leadWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, company: "", budget: "Not sure yet", type: "Chatbot hand-off", message, lang, website: "" }),
      signal: AbortSignal.timeout(15000),
    }).catch((e) => console.error("lead webhook failed", e));
  }
  return json({ ok: true });
});
