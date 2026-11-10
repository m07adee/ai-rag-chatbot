"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { sendHandoff, streamChat, type Source } from "@/lib/api";
import type { Dict, Lang } from "@/lib/i18n";

type Msg = { id: number; role: "user" | "bot"; text: string; sources?: Source[]; handoff?: boolean; pending?: boolean; error?: boolean };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s\-()]{7,20}$/;
let nextId = 1;

function ss(k: string, v?: string | null) {
  try {
    if (v === null) sessionStorage.removeItem(k);
    else if (v !== undefined) sessionStorage.setItem(k, v);
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

/** Tiny safe markdown: **bold**, "- " bullets, and [n] citation chips (no HTML injection). */
function RichText({ text, sources }: { text: string; sources?: Source[] }) {
  const inline = (line: string, key: string) =>
    line.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key + i}>{part.slice(2, -2)}</strong>;
      const m = /^\[(\d+)\]$/.exec(part);
      if (m) {
        const s = sources?.find((x) => x.n === Number(m[1]));
        return (
          <span key={key + i} title={s ? `${s.title}: ${s.snippet}…` : undefined} className="cite">
            {m[1]}
          </span>
        );
      }
      return <Fragment key={key + i}>{part}</Fragment>;
    });
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l)))
          return (
            <ul key={bi} className="my-1 list-disc ps-5">
              {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""), `${bi}-${li}-`)}</li>)}
            </ul>
          );
        return (
          <p key={bi} className="my-1">
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ""), `${bi}-${li}-`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

export function ChatPanel({ lang, t, onClose }: { lang: Lang; t: Dict["chat"]; onClose?: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [form, setForm] = useState<"closed" | "open" | "sending" | "sent">("closed");
  const [formErr, setFormErr] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setConvId(ss("conv")), []);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, form]);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? fn(m) : m)));

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { id: nextId++, role: "user", text: question }, { id: nextId++, role: "bot", text: "", pending: true }]);
    try {
      await streamChat(
        { message: question, lang, conversation_id: convId },
        {
          onMeta: (m) => {
            setConvId(m.conversation_id);
            ss("conv", m.conversation_id);
            patchLast((x) => ({ ...x, sources: m.sources }));
          },
          onDelta: (d) => patchLast((x) => ({ ...x, text: x.text + d, pending: false })),
          onDone: (d) => {
            patchLast((x) => ({ ...x, pending: false, handoff: d.handoff }));
            if (d.handoff) setForm((f) => (f === "sent" ? f : "open"));
          },
          onError: () => patchLast((x) => ({ ...x, pending: false, error: true, text: t.error })),
        },
      );
    } catch (e) {
      patchLast((x) => ({ ...x, pending: false, error: true, text: (e as Error).message.includes("Too many") ? (e as Error).message : t.error }));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function submitHandoff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if ((d.name || "").trim().length < 2 || !EMAIL.test((d.email || "").trim()) || !PHONE.test((d.phone || "").trim())) {
      setFormErr(t.invalid);
      return;
    }
    setFormErr("");
    setForm("sending");
    try {
      await sendHandoff({ ...d, lang, conversation_id: convId });
      setForm("sent");
    } catch {
      setForm("open");
      setFormErr(t.error);
    }
  }

  function reset() {
    setMsgs([]);
    setConvId(null);
    ss("conv", null);
    setForm("closed");
  }

  const cited = (m: Msg) => {
    const nums = new Set([...m.text.matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1])));
    const seen = new Set<string>();
    return (m.sources || []).filter((s) => nums.has(s.n) && !seen.has(s.title) && seen.add(s.title));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-teal-600 to-cyan-600 px-4 py-3 text-white">
        <div className="relative grid h-10 w-10 place-items-center rounded-full bg-white/20 text-xl">
          🦷
          <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-teal-600 bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{t.title}</div>
          <div className="truncate text-xs text-white/80">{t.status}</div>
        </div>
        {msgs.length > 0 && (
          <button onClick={reset} className="rounded-full px-2.5 py-1 text-xs text-white/85 hover:bg-white/15" type="button">
            {t.reset}
          </button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label={t.close} className="grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-white/15" type="button">
            ✕
          </button>
        )}
      </div>

      {/* messages */}
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bubble-bot">
          {t.hello}
        </motion.div>
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {t.suggestions.map((s, i) => (
              <motion.button
                key={s}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => ask(s)}
                className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-[13px] text-teal-700 shadow-sm hover:border-teal-400"
              >
                {s}
              </motion.button>
            ))}
          </div>
        )}
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.div
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              className={m.role === "user" ? "bubble-user" : `bubble-bot ${m.error ? "!border-red-200 !bg-red-50 !text-red-700" : ""}`}
            >
              {m.pending ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="typing"><i /><i /><i /></span>
                  <span className="text-xs">{t.thinking}</span>
                </div>
              ) : m.role === "user" ? (
                m.text
              ) : (
                <>
                  <RichText text={m.text} sources={m.sources} />
                  {cited(m).length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                      <span>{t.sources}:</span>
                      {cited(m).map((s) => (
                        <span key={s.n} title={s.snippet} className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">
                          📄 {s.title}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* human hand-off */}
        <AnimatePresence>
          {form !== "closed" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
              {form === "sent" ? (
                <p className="text-sm font-medium text-emerald-700">{t.handoffDone}</p>
              ) : (
                <form onSubmit={submitHandoff} className="space-y-2" noValidate>
                  <p className="mb-1 text-sm font-semibold text-slate-800">{t.handoffTitle}</p>
                  <input name="name" placeholder={t.name} maxLength={80} autoComplete="name" className="chat-input" />
                  <input name="email" type="email" placeholder={t.email} maxLength={120} autoComplete="email" dir="ltr" className="chat-input" />
                  <input name="phone" type="tel" placeholder={t.phone} maxLength={25} autoComplete="tel" dir="ltr" className="chat-input" />
                  <textarea name="note" placeholder={t.note} maxLength={1000} rows={2} className="chat-input resize-none" />
                  {formErr && <p className="text-xs text-red-600">{formErr}</p>}
                  <div className="flex gap-2 pt-1">
                    <button disabled={form === "sending"} className="flex-1 rounded-xl bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60" type="submit">
                      {form === "sending" ? "…" : t.submit}
                    </button>
                    <button type="button" onClick={() => setForm("closed")} className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
                      {t.cancel}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="border-t border-slate-200 bg-white p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder={t.placeholder}
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[15px] outline-none transition focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-100"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            disabled={busy || !input.trim()}
            type="submit"
            aria-label={t.send}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md transition disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </motion.button>
        </div>
        {form === "closed" && msgs.length > 0 && (
          <button type="button" onClick={() => setForm("open")} className="mt-2 text-xs font-medium text-teal-700 hover:underline">
            🙋 {t.human}
          </button>
        )}
      </form>
    </div>
  );
}
