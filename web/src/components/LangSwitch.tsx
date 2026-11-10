"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LANGS, type Lang } from "@/lib/i18n";

/** Segmented language switch with a spring pill; keeps LTR order so it doesn't jump in RTL. */
export function LangSwitch({ lang, onChange, dark = false }: { lang: Lang; onChange: (l: Lang) => void; dark?: boolean }) {
  const refs = useRef<Partial<Record<Lang, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });

  const measure = useCallback(() => {
    const el = refs.current[lang];
    if (el) setPill((p) => ({ x: el.offsetLeft, w: el.offsetWidth, ready: p.ready || el.offsetWidth > 0 }));
  }, [lang]);
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div
      dir="ltr"
      role="radiogroup"
      aria-label="Language"
      className={`relative flex rounded-full border p-1 ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white/80 shadow-sm"}`}
    >
      <motion.span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-0 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 shadow-[0_4px_14px_-4px_rgba(20,184,166,.7)]"
        initial={false}
        animate={{ x: pill.x, width: pill.w, opacity: pill.ready ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }}
      />
      {LANGS.map((l) => {
        const on = lang === l.id;
        return (
          <motion.button
            key={l.id}
            ref={(el) => {
              refs.current[l.id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(l.id)}
            whileTap={{ scale: 0.92 }}
            className={`relative z-10 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              on ? "text-white" : dark ? "text-white/60 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {l.label}
          </motion.button>
        );
      })}
    </div>
  );
}
