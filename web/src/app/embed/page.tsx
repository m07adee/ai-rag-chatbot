"use client";
import { ChatPanel } from "@/components/ChatPanel";
import { useLang } from "@/lib/useLang";

/** Chat-only page, loaded inside an iframe by /widget.js on any external website. */
export default function Embed() {
  const [lang, , t] = useLang();
  const close = () => window.parent?.postMessage({ type: "lumina-chat:close" }, "*");
  return (
    <div className="h-dvh" style={{ fontFamily: lang === "ar" ? "var(--font-cairo), sans-serif" : "var(--font-inter), sans-serif" }}>
      <ChatPanel lang={lang} t={t.chat} onClose={close} />
    </div>
  );
}
