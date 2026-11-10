/** Shared helpers for route handlers: JSON errors, admin auth, best-effort rate limiting. */
import { timingSafeEqual } from "node:crypto";
import { config, ensureDb } from "./db";
import { UserError } from "./errors";

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export function clientIp(req: Request) {
  return (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "?").trim();
}

const hits = new Map<string, number[]>();
/** Per-instance sliding window (serverless instances are short-lived, so this is best-effort). */
export function rateLimit(req: Request, limit = 20, windowSec = 300) {
  const key = `${clientIp(req)}:${limit}`;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowSec * 1000);
  if (list.length >= limit) throw new UserError("Too many messages, please wait a few minutes.", 429);
  list.push(now);
  hits.set(key, list);
}

export function requireAdmin(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(config.adminToken);
  if (!config.adminToken || a.length !== b.length || !timingSafeEqual(a, b)) throw new UserError("Invalid admin token", 401);
}

/** Wraps a handler: ensures the DB is ready and turns errors into JSON responses. */
export function handler<A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) {
  return async (req: Request, ...args: A) => {
    try {
      await ensureDb();
      return await fn(req, ...args);
    } catch (e) {
      if (e instanceof UserError) return json({ detail: e.message }, e.status);
      console.error(e);
      return json({ detail: "Server error" }, 500);
    }
  };
}
