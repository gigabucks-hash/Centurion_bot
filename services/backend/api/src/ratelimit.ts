// Fixed-window rate limits, in memory (per API instance). Keys combine route + IP / user / address.
// Over the limit -> 429 RATE_LIMITED {retry_after_s, limit, window_s} + Retry-After (set by sendError).
import type { IncomingMessage } from "node:http";
import { ApiError } from "./errors.ts";

export class RateLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  private lastSweep = 0;
  private readonly now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Count one hit for `key`; throws RATE_LIMITED when more than `max` in the current `windowS` window. */
  hit(key: string, max: number, windowS: number): void {
    const t = this.now();
    this.sweep(t);
    const w = windowS * 1000;
    const e = this.hits.get(key);
    if (!e || t - e.start >= w) {
      this.hits.set(key, { start: t, n: 1 });
      return;
    }
    e.n += 1;
    if (e.n > max) {
      const retry = Math.max(1, Math.ceil((e.start + w - t) / 1000));
      throw new ApiError("RATE_LIMITED", { retry_after_s: retry, limit: max, window_s: windowS });
    }
  }

  private sweep(t: number): void {
    if (t - this.lastSweep < 60_000 || this.hits.size < 10_000) return;
    this.lastSweep = t;
    for (const [k, e] of this.hits) if (t - e.start > 3_600_000) this.hits.delete(k);
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
