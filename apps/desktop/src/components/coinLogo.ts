/**
 * Coin-logo URL + per-session cache (COIN_LOGO §2). Pure module (unit-tested under node).
 * - Only the backend image proxy (`logo_origin`, from Rust) is ever requested; the URL is built here from
 *   {origin, mint, size, logo_hash}: never a URL taken from token metadata.
 * - Size: smallest proxy size ≥ px × dpr (dpr ≤ 2 on desktop), capped at 96 until Backend ships 128/192.
 * - Negative cache per mint+v (404/422/decode/timeout: no retry this session); network error: 1 retry.
 * - LRU of 200 entries.
 */
export const MOCK_ORIGIN = "https://logo.mock.invalid";
export const PROXY_SIZES = [48, 64, 96] as const; // contracts 1.1.6 lists 128/192 too; proxy rejects them today
export type AvatarPx = 20 | 24 | 32;

const HASH = /^[A-Za-z0-9_-]{8,128}$/;
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function proxySize(px: number, dpr: number): number {
  const want = px * Math.min(Math.max(dpr || 1, 1), 2);
  return PROXY_SIZES.find((s) => s >= want) ?? PROXY_SIZES[PROXY_SIZES.length - 1];
}

/** null → identicon without a request. */
export function logoSrc(origin: string | null | undefined, mint: string, hash: string | null | undefined, px: number, dpr = 1): string | null {
  if (!origin || !hash || !HASH.test(hash) || !MINT.test(mint)) return null;
  if (origin === MOCK_ORIGIN) return `/mock-logo/${encodeURIComponent(hash)}.webp`; // bundled, same origin
  if (!/^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(origin)) return null;
  return `${origin}/v1/img/coin/${mint}?s=${proxySize(px, dpr)}&v=${encodeURIComponent(hash)}`;
}

export type LogoStatus = "ok" | "failed" | "retry";
const CAP = 200;
const cache = new Map<string, LogoStatus>();
export const cacheKey = (mint: string, hash: string) => `${mint}:${hash}`;

export function logoStatus(key: string): LogoStatus | undefined {
  const v = cache.get(key);
  if (v !== undefined) {
    cache.delete(key);
    cache.set(key, v); // LRU touch
  }
  return v;
}

/** Record an outcome. `network` failures get one more try per session; anything else is final. */
export function recordLogo(key: string, outcome: "ok" | "failed" | "network"): LogoStatus {
  const prev = cache.get(key);
  // A network error earns one retry only if nothing definitive is known yet; "failed" is final.
  const next: LogoStatus = outcome === "ok" ? "ok" : outcome === "network" && prev === undefined ? "retry" : "failed";
  cache.delete(key);
  cache.set(key, next);
  while (cache.size > CAP) cache.delete(cache.keys().next().value as string);
  return next;
}

export const _cacheSizeForTests = () => cache.size;
