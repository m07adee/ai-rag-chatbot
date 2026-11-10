export type Source = { n: number; title: string; snippet: string };

type Handlers = {
  onMeta: (m: { conversation_id: string; sources: Source[] }) => void;
  onDelta: (text: string) => void;
  onDone: (d: { handoff: boolean }) => void;
  onError: (message: string) => void;
};

/** POST /api/chat and parse the Server-Sent Events stream. */
export async function streamChat(body: { message: string; lang: string; conversation_id?: string | null }, h: Handlers) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      const d = JSON.parse(data);
      if (event === "meta") h.onMeta(d);
      else if (event === "delta") h.onDelta(d.text);
      else if (event === "done") h.onDone(d);
      else if (event === "error") h.onError(d.message);
    }
  }
}

export async function sendHandoff(body: Record<string, string | null>) {
  const res = await fetch("/api/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail || `HTTP ${res.status}`);
}

/** Admin API helper (token kept in sessionStorage by the admin page). */
export async function adminFetch<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail;
    throw Object.assign(new Error(typeof detail === "string" ? detail : `HTTP ${res.status}`), { status: res.status });
  }
  return res.json();
}
