"use client";
import { useEffect, useState } from "react";
import { T, type Lang } from "./i18n";

function store(k: string, v?: string) {
  try {
    if (v !== undefined) localStorage.setItem(k, v);
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

/** Language from ?lang= → saved choice → browser language; keeps <html lang/dir> in sync. */
export function useLang() {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("lang");
    const nav = (navigator.language || "en").slice(0, 2);
    const pick = [q, store("lang"), nav].find((x) => x && x in T) as Lang | undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only prefs, read after hydration (static export)
    if (pick) setLang(pick);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    store("lang", lang);
  }, [lang]);
  return [lang, setLang, T[lang]] as const;
}
