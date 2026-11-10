"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { KineticTextLoader } from "@/components/ui/kinetic-text-loader";
import { adminFetch } from "@/lib/api";

type Stats = { documents: number; chunks: number; conversations: number; questions: number; unanswered: number; handoffs: number; recent_unanswered: { question: string; created_at: string }[] };
type Doc = { id: number; title: string; source: string; kind: string; chunk_count: number; created_at: string };
type Conv = { id: string; lang: string; handed_off: boolean; updated_at: string; messages: number; transcript: { role: string; content: string; answered: boolean }[] };

const fmt = (d: string) => new Date(d).toLocaleString();

export default function Admin() {
  const [token, setToken] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [tab, setTab] = useState<"docs" | "chats">("docs");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [openConv, setOpenConv] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is browser-only (static export)
      setToken(sessionStorage.getItem("admin-token"));
    } catch {}
  }, []);

  const load = useCallback(async (tk: string) => {
    try {
      const [s, d, c] = await Promise.all([
        adminFetch<Stats>("/stats", tk),
        adminFetch<Doc[]>("/documents", tk),
        adminFetch<Conv[]>("/conversations", tk),
      ]);
      setStats(s);
      setDocs(d);
      setConvs(c);
    } catch (e) {
      if ((e as { status?: number }).status === 401) logout();
      else flash(false, (e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch dashboard data when signed in
    if (token) load(token);
  }, [token, load]);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }
  function logout() {
    try {
      sessionStorage.removeItem("admin-token");
    } catch {}
    setToken(null);
    setStats(null);
  }

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const tk = String(new FormData(e.currentTarget).get("token") || "").trim();
    try {
      await adminFetch("/stats", tk);
      try {
        sessionStorage.setItem("admin-token", tk);
      } catch {}
      setToken(tk);
    } catch {
      flash(false, "Wrong admin token");
    }
  }

  async function upload(files: FileList | null) {
    if (!token || !files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const d = await adminFetch<Doc>("/documents", token, { method: "POST", body: fd });
        flash(true, `Added "${d.title}" (${d.chunk_count} chunks)`);
      } catch (e) {
        flash(false, `${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    load(token);
  }

  async function addUrl(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const form = e.currentTarget;
    const url = String(new FormData(form).get("url") || "").trim();
    if (!url) return;
    setBusy(true);
    try {
      const d = await adminFetch<Doc>("/documents/url", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      flash(true, `Imported "${d.title}" (${d.chunk_count} chunks)`);
      form.reset();
      load(token);
    } catch (err) {
      flash(false, (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: Doc) {
    if (!token || !confirm(`Delete "${d.title}" from the knowledge base?`)) return;
    try {
      await adminFetch(`/documents/${d.id}`, token, { method: "DELETE" });
      flash(true, `Deleted "${d.title}"`);
      load(token);
    } catch (e) {
      flash(false, (e as Error).message);
    }
  }

  if (!token)
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-white">
        <motion.form onSubmit={login} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-xl">🔐</div>
          <h1 className="text-xl font-bold">Knowledge-base admin</h1>
          <p className="mb-5 mt-1 text-sm text-white/50">Enter the ADMIN_TOKEN from your .env file.</p>
          <input name="token" type="password" autoFocus className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-teal-400" placeholder="Admin token" />
          <button className="mt-4 w-full rounded-xl bg-teal-500 py-3 font-semibold text-slate-950 transition hover:bg-teal-400" type="submit">Sign in</button>
          {msg && <p className="mt-3 text-sm text-red-400">{msg.text}</p>}
        </motion.form>
      </div>
    );

  const cards = stats
    ? [
        ["Documents", stats.documents, "📚"],
        ["Chunks", stats.chunks, "🧩"],
        ["Conversations", stats.conversations, "💬"],
        ["Questions", stats.questions, "❓"],
        ["Needed a human", stats.unanswered, "⚠️"],
        ["Hand-offs", stats.handoffs, "🙋"],
      ] as const
    : [];

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-bold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600">✦</span>Chatbot admin</div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/5 hover:text-white">View site ↗</Link>
            <button onClick={() => token && load(token)} className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/5 hover:text-white" type="button">↻ Refresh</button>
            <button onClick={logout} className="rounded-lg px-3 py-1.5 text-white/60 hover:bg-white/5 hover:text-white" type="button">Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {!stats ? (
          <div className="grid place-items-center py-24"><KineticTextLoader text="Loading" className="text-white" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {cards.map(([label, value, icon], i) => (
                <motion.div key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                  <div className="text-xs text-white/50">{icon} {label}</div>
                  <div className="mt-2 text-2xl font-bold"><AnimatedNumber value={value} /></div>
                </motion.div>
              ))}
            </div>

            {stats.recent_unanswered.length > 0 && (
              <section className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[.06] p-5">
                <h2 className="mb-3 font-semibold text-amber-200">⚠️ Questions handed to a human — add missing info to the knowledge base</h2>
                <ul className="space-y-1.5 text-sm text-white/80">
                  {stats.recent_unanswered.map((q, i) => <li key={i} className="flex justify-between gap-4"><span>“{q.question}”</span><span className="shrink-0 text-white/40">{fmt(q.created_at)}</span></li>)}
                </ul>
              </section>
            )}

            <div className="mt-8 flex gap-2">
              {(["docs", "chats"] as const).map((k) => (
                <button key={k} onClick={() => setTab(k)} type="button" className={`relative rounded-xl px-4 py-2 text-sm font-semibold ${tab === k ? "text-white" : "text-white/50 hover:text-white"}`}>
                  {tab === k && <motion.span layoutId="tab" className="absolute inset-0 rounded-xl bg-white/10" />}
                  <span className="relative">{k === "docs" ? `📚 Knowledge base (${docs.length})` : `💬 Conversations (${convs.length})`}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {tab === "docs" ? (
                <motion.section key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                      onDragLeave={() => setDrag(false)}
                      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
                      onClick={() => fileRef.current?.click()}
                      className={`grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? "border-teal-400 bg-teal-400/10" : "border-white/15 hover:border-white/30"}`}
                    >
                      <div className="text-3xl">{busy ? "⏳" : "📤"}</div>
                      <p className="mt-2 font-semibold">{busy ? "Processing…" : "Drop files or click to upload"}</p>
                      <p className="text-xs text-white/45">PDF, DOCX, TXT, MD, CSV · max 10 MB</p>
                      <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
                    </div>
                    <form onSubmit={addUrl} className="flex flex-col justify-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-6">
                      <p className="font-semibold">🌐 Import a web page</p>
                      <input name="url" type="url" placeholder="https://example.com/faq" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-teal-400" />
                      <button disabled={busy} className="rounded-xl bg-teal-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-teal-400 disabled:opacity-50" type="submit">Import</button>
                    </form>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-sm">
                      <thead className="bg-white/[.04] text-start text-xs uppercase text-white/45">
                        <tr><th className="px-4 py-3 text-start">Title</th><th className="px-4 py-3 text-start">Source</th><th className="px-4 py-3">Chunks</th><th className="px-4 py-3 text-start">Added</th><th /></tr>
                      </thead>
                      <tbody>
                        {docs.map((d) => (
                          <tr key={d.id} className="border-t border-white/5 hover:bg-white/[.03]">
                            <td className="px-4 py-3 font-medium">{d.title}</td>
                            <td className="max-w-[240px] truncate px-4 py-3 text-white/50"><span className="me-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase">{d.kind}</span>{d.source}</td>
                            <td className="px-4 py-3 text-center">{d.chunk_count}</td>
                            <td className="px-4 py-3 text-white/50">{fmt(d.created_at)}</td>
                            <td className="px-4 py-3 text-end"><button onClick={() => remove(d)} className="rounded-lg px-2 py-1 text-red-300 hover:bg-red-500/10" type="button">Delete</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.section>
              ) : (
                <motion.section key="chats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-2">
                  {convs.length === 0 && <p className="py-10 text-center text-white/40">No conversations yet.</p>}
                  {convs.map((c) => (
                    <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[.03]">
                      <button type="button" onClick={() => setOpenConv(openConv === c.id ? null : c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase">{c.lang}</span>
                        <span className="flex-1 truncate">{c.transcript.find((m) => m.role === "user")?.content || "—"}</span>
                        {c.handed_off && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">hand-off</span>}
                        <span className="text-xs text-white/40">{c.messages} msgs · {fmt(c.updated_at)}</span>
                        <span className={`transition ${openConv === c.id ? "rotate-180" : ""}`}>▾</span>
                      </button>
                      <AnimatePresence>
                        {openConv === c.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="space-y-2 border-t border-white/10 px-4 py-3 text-sm">
                              {c.transcript.map((m, i) => (
                                <div key={i} className={m.role === "user" ? "text-teal-200" : `text-white/75 ${m.answered ? "" : "italic text-amber-200/80"}`}>
                                  <b>{m.role === "user" ? "Visitor" : "Bot"}:</b> <span className="whitespace-pre-line">{m.content}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </motion.section>
              )}
            </AnimatePresence>
          </>
        )}
      </main>

      <AnimatePresence>
        {msg && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className={`fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90vw] rounded-xl px-4 py-2.5 text-sm font-medium shadow-xl ${msg.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}>
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
