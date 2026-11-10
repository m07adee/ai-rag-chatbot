"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChatPanel } from "./ChatPanel";
import type { Dict, Lang } from "@/lib/i18n";

/** Floating launcher + animated chat window. `openSignal` lets page CTAs open it. */
export function ChatWidget({ lang, t, openSignal }: { lang: Lang; t: Dict["chat"]; openSignal: number }) {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [lastSignal, setLastSignal] = useState(openSignal);
  if (openSignal !== lastSignal) {
    // a page CTA asked to open the chat (React "adjust state on prop change" pattern)
    setLastSignal(openSignal);
    setOpen(true);
  }
  useEffect(() => {
    const id = setTimeout(() => setNudge(true), 2500);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:end-6">
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{ transformOrigin: "bottom right" }}
            className="h-[min(640px,calc(100dvh-110px))] w-[min(400px,calc(100vw-32px))] overflow-hidden rounded-3xl border border-slate-200 shadow-[0_24px_70px_-12px_rgba(15,23,42,.35)]"
          >
            <ChatPanel lang={lang} t={t} onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3">
        <AnimatePresence>
          {!open && nudge && (
            <motion.button
              type="button"
              onClick={() => setOpen(true)}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="hidden rounded-2xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 sm:block"
            >
              {t.open} 👋
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          type="button"
          aria-label={open ? t.close : t.open}
          onClick={() => setOpen((o) => !o)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-2xl text-white shadow-[0_10px_30px_-6px_rgba(13,148,136,.7)]"
        >
          {!open && <span className="pulse-ring" />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={open ? "x" : "chat"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
              {open ? "✕" : "💬"}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
