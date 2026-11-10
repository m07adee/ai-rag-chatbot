"use client";
import { useRef, useState } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import StaggerText from "@/components/ui/staggerText";
import { LiquidButton } from "@/components/ui/liquid-button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { FaqAccordion } from "@/components/ui/faq-accordion";
import { ChatWidget } from "@/components/ChatWidget";
import { LangSwitch } from "@/components/LangSwitch";
import { useLang } from "@/lib/useLang";

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] } }),
};

function Stat({ value, label, i }: { value: number; label: string; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} variants={rise} custom={i} initial="hidden" whileInView="show" viewport={{ once: true }} className="rounded-2xl bg-white/80 p-5 text-center shadow-sm ring-1 ring-slate-200/70">
      <div dir="ltr" className="flex items-center justify-center text-3xl font-bold text-teal-700 sm:text-4xl">
        <AnimatedNumber value={seen ? value : 0} />
        {value >= 1000 || value === 15 ? <span>+</span> : null}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </motion.div>
  );
}

export default function Home() {
  const [lang, setLang, t] = useLang();
  const [openSignal, setOpenSignal] = useState(0);
  const isAr = lang === "ar";

  return (
    <div className="min-h-screen bg-[#f6fbfb] text-slate-800" style={{ fontFamily: isAr ? "var(--font-cairo), sans-serif" : "var(--font-inter), sans-serif" }}>
      {/* soft static background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(60rem_40rem_at_85%_-10%,rgba(45,212,191,.18),transparent_60%),radial-gradient(50rem_35rem_at_-10%_10%,rgba(56,189,248,.14),transparent_60%)]" />

      <div className="relative bg-slate-900 px-4 py-2 text-center text-xs text-white/80">{t.demo}</div>

      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a href="#" className="flex items-center gap-2 text-lg font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white">✦</span>
            <span dir="ltr">Lumina <span className="text-teal-600">Dental</span></span>
          </a>
          <nav className="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#services" className="hover:text-teal-700">{t.nav.services}</a>
            <a href="#faq" className="hover:text-teal-700">{t.nav.faq}</a>
            <a href="#contact" className="hover:text-teal-700">{t.nav.contact}</a>
          </nav>
          <LangSwitch lang={lang} onChange={setLang} />
        </div>
      </header>

      <main className="relative">
        {/* hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 md:grid-cols-[1.15fr_1fr] md:pt-20">
          <div>
            <motion.span variants={rise} initial="hidden" animate="show" className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> {t.heroBadge}
            </motion.span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.15] tracking-tight text-slate-900 sm:text-5xl">
              <StaggerText key={lang}>{t.heroTitle}</StaggerText>
            </h1>
            <motion.p variants={rise} custom={2} initial="hidden" animate="show" className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              {t.heroSub}
            </motion.p>
            <motion.div variants={rise} custom={3} initial="hidden" animate="show" className="mt-8 flex flex-wrap items-center gap-3">
              <LiquidButton size="lg" variant="default" fillColor="#0d9488" textColor="#0f766e" activeTextColor="#ffffff" borderColor="#0d9488" onClick={() => setOpenSignal((n) => n + 1)}>
                💬 {t.heroCta}
              </LiquidButton>
              <a href="#services" className="rounded-full px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-white hover:shadow-sm">
                {t.heroCta2} →
              </a>
            </motion.div>
          </div>

          {/* hero visual: mock chat preview */}
          <motion.div initial={{ opacity: 0, y: 30, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }} className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-teal-200/60 to-sky-200/50 blur-2xl" />
            <div className="rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-full bg-teal-100">🦷</span>{t.chat.title}</div>
              <div className="space-y-3 text-sm">
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }} className="ms-auto w-fit max-w-[80%] rounded-2xl rounded-ee-md bg-teal-600 px-4 py-2 text-white">
                  {t.chat.suggestions[0]}
                </motion.div>
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 }} className="w-fit max-w-[88%] rounded-2xl rounded-es-md bg-slate-100 px-4 py-2 text-slate-700">
                  {isAr ? "التبييض في العيادة (Philips Zoom) بسعر " : lang === "tr" ? "Klinikte beyazlatma (Philips Zoom) " : "In-office whitening (Philips Zoom) is "}
                  <b>$250</b>
                  {isAr ? "، جلسة واحدة مدتها 90 دقيقة " : lang === "tr" ? ", tek 90 dakikalık seans " : ", one 90-minute session "}
                  <span className="cite">1</span>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.9 }} className="flex gap-1.5 text-[11px] text-slate-500">
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">📄 Services and Prices</span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* stats */}
        <section className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 pb-16 md:grid-cols-4">
          {t.stats.map((s, i) => <Stat key={i} i={i} value={s.value} label={s.label} />)}
        </section>

        {/* services */}
        <section id="services" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-20">
          <h2 className="mb-8 text-3xl font-bold text-slate-900"><StaggerText key={`s-${lang}`}>{t.servicesTitle}</StaggerText></h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.services.map((s, i) => (
              <motion.div key={i} variants={rise} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} whileHover={{ y: -6 }} className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80 transition-shadow hover:shadow-xl hover:shadow-teal-900/5">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-teal-50 text-2xl transition-transform group-hover:scale-110 group-hover:-rotate-6">{s.icon}</div>
                <h3 className="text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* faq */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 pb-20">
          <FaqAccordion key={lang} title={t.faqTitle} items={t.faq.map((f) => ({ question: f.q, answer: f.a }))} className="faq-light" />
          <motion.div variants={rise} initial="hidden" whileInView="show" viewport={{ once: true }} className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 p-6 text-center text-white sm:flex-row sm:text-start">
            <p className="flex-1">{t.faqHint}</p>
            <button type="button" onClick={() => setOpenSignal((n) => n + 1)} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-teal-700 shadow transition hover:-translate-y-0.5">
              💬 {t.heroCta}
            </button>
          </motion.div>
        </section>

        {/* contact */}
        <section id="contact" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-24">
          <motion.div variants={rise} initial="hidden" whileInView="show" viewport={{ once: true }} className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">{t.contactTitle}</h2>
            <ul className="mt-4 space-y-2 text-slate-600">
              {t.contactLines.map((l, i) => <li key={i} className="flex gap-2"><span>{["📍", "🕘", "📞"][i]}</span><span>{l}</span></li>)}
            </ul>
          </motion.div>
        </section>
      </main>

      <footer className="relative border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">{t.footer}</footer>

      <ChatWidget lang={lang} t={t.chat} openSignal={openSignal} />
    </div>
  );
}
