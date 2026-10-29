// Rate limits: fixed windows keyed by route + IP / user / address. Over the limit -> 429 RATE_LIMITED
// {retry_after_s, limit, window_s} + Retry-After (set by sendError).
// Stores: in memory (one instance) or Postgres (`rate_limit_hit`, shared across instances).
import type { IncomingMessage } from "node:http";
import { ApiError } from "./errors.ts";
import { asService, type Db } from "./db.ts";

export interface Limiter {
  /** Count one hit for `key`; rejects with RATE_LIMITED when over `max` in the current `windowS` window. */
  hit(key: string, max: number, windowS: number): Promise<void>;
  /** Count one hit for `key` and return the count in the current window (never throws for being over). */
  count(key: string, windowS: number): Promise<Count>;
}

export interface Count {
  n: number;
  retryAfterS: number;
}

const limited = (retry: number, max: number, windowS: number) =>
  new ApiError("RATE_LIMITED", { retry_after_s: retry, limit: max, window_s: windowS });

export class RateLimiter implements Limiter {
  private hits = new Map<string, { start: number; n: number }>();
  private lastSweep = 0;
  private readonly now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async hit(key: string, max: number, windowS: number): Promise<void> {
    const c = await this.count(key, windowS);
    if (c.n > max) throw limited(c.retryAfterS, max, windowS);
  }

  async count(key: string, windowS: number): Promise<Count> {
    const t = this.now();
    this.sweep(t);
    const w = windowS * 1000;
    let e = this.hits.get(key);
    if (!e || t - e.start >= w) {
      e = { start: t, n: 0 };
      this.hits.set(key, e);
    }
    e.n += 1;
    return { n: e.n, retryAfterS: Math.max(1, Math.ceil((e.start + w - t) / 1000)) };
  }

  private sweep(t: number): void {
    if (t - this.lastSweep < 60_000 || this.hits.size < 10_000) return;
    this.lastSweep = t;
    for (const [k, e] of this.hits) if (t - e.start > 3_600_000) this.hits.delete(k);
  }
}

/** Shared counters in Postgres. Fails open (logs) if the DB is unreachable so limits never take the API down. */
export class PgRateLimiter implements Limiter {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  async hit(key: string, max: number, windowS: number): Promise<void> {
    let retry = 0;
    try {
      retry = await asService(this.db, async (c) =>
        (await c.query<{ r: number }>("select public.rate_limit_hit($1, $2, $3) as r", [key.slice(0, 200), max, windowS])).rows[0]!.r);
    } catch (e) {
      console.error("rate limit store unavailable:", e instanceof Error ? e.message : e);
      return;
    }
    if (retry > 0) throw limited(retry, max, windowS);
  }

  async count(key: string, windowS: number): Promise<Count> {
    try {
      const r = await asService(this.db, async (c) =>
        (await c.query<{ r: { n: number; retry_after_s: number } }>("select public.rate_limit_count($1, $2) as r", [key.slice(0, 200), windowS])).rows[0]!.r);
      return { n: r.n, retryAfterS: r.retry_after_s };
    } catch (e) {
      console.error("rate limit store unavailable:", e instanceof Error ? e.message : e);
      return { n: 0, retryAfterS: 1 };
    }
  }
}

/** Client IP: the socket address, or the first X-Forwarded-For hop only when TRUST_PROXY=true. */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}
