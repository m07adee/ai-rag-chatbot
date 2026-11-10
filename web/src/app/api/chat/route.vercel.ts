import { sql } from "@/server/db";
import { UserError } from "@/server/errors";
import { handler, rateLimit } from "@/server/http";
import { gate, OFF_TOPIC_REPLY, retrieve, streamAnswer } from "@/server/llm";

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Turn = { role: "user" | "assistant"; content: string };

export const POST = handler(async (req: Request) => {
  rateLimit(req);
  const body = await req.json().catch(() => ({}));
  const question = String(body.message || "").trim();
  if (!question || question.length > 1000) throw new UserError("Message must be 1-1000 characters");
  const lang: string = ["en", "ar", "tr"].includes(body.lang) ? body.lang : "en";

  let convId: string | null = UUID.test(body.conversation_id || "") ? body.conversation_id : null;
  if (convId && !((await sql`SELECT 1 FROM conversations WHERE id=${convId}`) as unknown[]).length) convId = null;
  if (!convId) {
    const [row] = (await sql`INSERT INTO conversations (lang) VALUES (${lang}) RETURNING id`) as { id: string }[];
    convId = row.id;
  }

  const history = (await sql`SELECT role, content FROM (SELECT role, content, id FROM messages WHERE conv_id=${convId}
      ORDER BY id DESC LIMIT 6) t ORDER BY id`) as Turn[];
  const lastBot = [...history].reverse().find((m) => m.role === "assistant")?.content || "";

  const { inScope, query } = await gate(question, lastBot);
  const passages = inScope ? await retrieve(question, query) : [];
  const sources = passages.map((p, i) => ({ n: i + 1, title: p.title, snippet: p.content.slice(0, 220) }));

  const enc = new TextEncoder();
  const sse = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const stream = new ReadableStream({
    async start(ctrl) {
      ctrl.enqueue(sse("meta", { conversation_id: convId, sources }));
      const state = { handoff: false, blocked: false };
      let answer = "";
      try {
        if (!inScope) {
          answer = OFF_TOPIC_REPLY[lang];
          ctrl.enqueue(sse("delta", { text: answer }));
        } else {
          for await (const d of streamAnswer(question, passages, history, lang, state)) {
            answer += d;
            ctrl.enqueue(sse("delta", { text: d }));
          }
          if (state.blocked) {
            // the model drifted into writing code: replace the whole reply
            answer = OFF_TOPIC_REPLY[lang];
            state.handoff = false;
            ctrl.enqueue(sse("replace", { text: answer }));
          }
        }
        answer = answer.trim();
        await sql`INSERT INTO messages (conv_id, role, content) VALUES (${convId}, 'user', ${question})`;
        await sql`INSERT INTO messages (conv_id, role, content, sources, answered)
                  VALUES (${convId}, 'assistant', ${answer}, ${JSON.stringify(sources)}, ${!state.handoff})`;
        await sql`UPDATE conversations SET updated_at=now(), lang=${lang} WHERE id=${convId}`;
        ctrl.enqueue(sse("done", { handoff: state.handoff }));
      } catch (e) {
        console.error(e);
        ctrl.enqueue(sse("error", { message: "The assistant is temporarily unavailable. Please try again." }));
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
});
