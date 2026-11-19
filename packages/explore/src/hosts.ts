/**
 * Public read-only hosts. Swap, quote, and order URLs are rejected even on these hosts.
 * Jupiter's free token list is lite-api.jup.ag (no API key). GeckoTerminal's public API
 * lists new pools. pump.fun's web API sits behind a browser challenge, so it is not called.
 */
import type { ExploreWindow } from "./types";
import { isMint } from "./sanitize";

export const JUPITER_HOST = "lite-api.jup.ag";
export const GECKO_HOST = "api.geckoterminal.com";

const HOSTS = new Set([JUPITER_HOST, GECKO_HOST]);

export function allowedUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.port) return false;
  if (!HOSTS.has(u.hostname)) return false;
  if (u.pathname.includes("..") || u.pathname.includes("//")) return false;
  if (/swap|order|quote|send|transfer/i.test(u.pathname)) return false;
  if (u.hostname === JUPITER_HOST) return u.pathname.startsWith("/tokens/v2/");
  return u.hostname === GECKO_HOST && u.pathname === "/api/v2/networks/solana/new_pools";
}

const JUPITER_INTERVAL: Partial<Record<ExploreWindow, string>> = {
  "5m": "5m",
  "1h": "1h",
  "6h": "6h",
  "24h": "24h",
};

function gate(url: string): string | null {
  return allowedUrl(url) ? url : null;
}

/** Ranked by trade volume. 1m is not a Jupiter interval. */
export function trendingUrl(window: ExploreWindow): string | null {
  const interval = JUPITER_INTERVAL[window];
  if (!interval) return null;
  return gate(`https://${JUPITER_HOST}/tokens/v2/toptraded/${interval}?limit=50`);
}

export function bluechipUrl(): string | null {
  return gate(`https://${JUPITER_HOST}/tokens/v2/toptraded/24h?limit=100`);
}

export function newPoolsUrl(page: 1 | 2): string | null {
  return gate(`https://${GECKO_HOST}/api/v2/networks/solana/new_pools?include=dex%2Cbase_token%2Cquote_token&page=${page}`);
}

export function searchUrl(mints: readonly string[]): string | null {
  const clean: string[] = [];
  for (const mint of mints) {
    if (!isMint(mint)) return null;
    if (!clean.includes(mint)) clean.push(mint);
    if (clean.length === 40) break;
  }
  if (!clean.length) return null;
  const u = new URL(`https://${JUPITER_HOST}/tokens/v2/search`);
  u.searchParams.set("query", clean.join(","));
  return gate(u.toString());
}

export function mintUrl(mint: string): string | null {
  return searchUrl([mint]);
}
