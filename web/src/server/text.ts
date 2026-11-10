/** Text extraction (PDF, DOCX, TXT/MD/CSV, web pages) and paragraph-aware chunking. */
import { UserError } from "./errors";

const CHUNK = 900;
const OVERLAP = 150;

export async function extractText(filename: string, data: Uint8Array): Promise<string> {
  const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  if (ext === ".pdf") {
    const { extractText: pdf, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(data);
    const { text } = await pdf(doc, { mergePages: true });
    return text;
  }
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    return value;
  }
  if ([".txt", ".md", ".csv"].includes(ext)) return new TextDecoder("utf-8").decode(data);
  throw new UserError(`Unsupported file type: ${ext || "unknown"} (use PDF, DOCX, TXT, MD or CSV)`);
}

export async function fetchPage(url: string): Promise<{ title: string; text: string }> {
  if (!/^https?:\/\//i.test(url)) throw new UserError("URL must start with http:// or https://");
  let html: string;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (RAG ingest bot)" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    html = await r.text();
  } catch (e) {
    throw new UserError(`Could not fetch the page: ${(e as Error).message}`);
  }
  const { parse } = await import("node-html-parser");
  const root = parse(html);
  root.querySelectorAll("script,style,noscript,nav,footer,header,svg,form").forEach((n) => n.remove());
  const title = (root.querySelector("title")?.text || url).trim().slice(0, 200);
  const main = root.querySelector("main") || root.querySelector("article") || root.querySelector("body") || root;
  return { title, text: main.structuredText };
}

function clean(t: string) {
  return t.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

export function chunkText(text: string): string[] {
  const paras = clean(text).split("\n\n").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  let heading = "";
  for (let p of paras) {
    if (p.startsWith("#")) heading = p.replace(/^#+\s*/, "");
    while (p.length > CHUNK) {
      const cut = Math.max(p.lastIndexOf(". ", CHUNK), p.lastIndexOf("\n", CHUNK), CHUNK / 2);
      out.push(p.slice(0, cut + 1).trim());
      p = p.slice(cut + 1).trim();
    }
    if (cur && cur.length + p.length + 2 > CHUNK) {
      out.push(cur.trim());
      const tail = cur.slice(-OVERLAP);
      cur = (heading && !p.startsWith("#") ? heading + "\n" : "") + tail.slice(tail.indexOf(" ") + 1) + "\n\n";
    }
    cur += p + "\n\n";
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((c) => c.length > 20);
}
