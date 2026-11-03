/**
 * Server clock. Countdowns use `server_now` from the last response / realtime clock message, never the
 * device clock alone (EVENTS_SCHEMA §1): skew = server_now − local receive time, now() = Date.now() + skew.
 */
import { remainingMs, skewFrom } from "@centurion/i18n/format";

let skewMs = 0;

/** Call with every `server_now` (ISO string) received from REST, SSE or the realtime clock channel. */
export function observeServerNow(serverNow: string | undefined | null, receivedAt = Date.now()): void {
  if (!serverNow) return;
  const sk = skewFrom(serverNow, receivedAt);
  if (Number.isFinite(sk)) skewMs = sk;
}

export function serverNow(): number {
  return Date.now() + skewMs;
}

export function clockSkewMs(): number {
  return skewMs;
}

/**
 * i18n 0.4.3 countdown rule: remaining = exp − server_now, i.e. `remainingMs(exp, skewFrom(server_now))`.
 * Callers then format with `formatCountdown()`; `mm_ss` is never passed in as a var.
 */
export function remainingUntil(exp: number | string, localNowMs = Date.now()): number {
  const iso = typeof exp === "number" ? new Date(exp).toISOString() : exp;
  return remainingMs(iso, skewMs, localNowMs);
}
