/**
 * Read-only discovery fetch. Calls only the allowlisted token-list URLs.
 * Never a swap, quote, order, or wallet endpoint. Callers cache and back off.
 */
import { bluechipUrl, mintUrl, newPoolsUrl, searchUrl, trendingUrl, allowedUrl } from "./hosts";
import { collectMints, enrichRows, hardenRow, parseGecko, parseJupiter } from "./parse";
import { selectRows } from "./query";
import { isSection, isWindow, type ExploreFeed, type ExploreSection, type ExploreWindow, type FeedError, type RawExplore, type RawPart } from "./types";

export const TTL_MS = 12_000;
export const MAX_BODY = 1_500_000;

interface Slot {
  at: number;
  next: number;
  fails: number;
  status: number;
  json: unknown | null;
}

export interface Net {
  fetch: typeof fetch;
  now: () => number;
  cache: Map<string, Slot>;
  inflight: Map<string, Promise<Slot>>;
}

const memory = new Map<string, Slot>();
const flights = new Map<string, Promise<Slot>>();

export function resolveNet(partial?: Partial<Net>): Net {
  return {
    fetch: partial?.fetch ?? fetch,
    now: partial?.now ?? Date.now,
    cache: partial?.cache ?? memory,
    inflight: partial?.inflight ?? flights,
  };
}

export interface GetJson {
  status: number;
  json: unknown | null;
  stale: boolean;
  kind: "ok" | "rate" | "unavailable";
}

function waitMs(fails: number): number {
  return Math.min(60_000, 5_000 * 2 ** Math.min(fails, 4));
}

async function pull(url: string, d: Net, prev: Slot | undefined): Promise<Slot> {
  const now = d.now();
  const fail = (status: number): Slot => {
    const fails = (prev?.fails ?? 0) + 1;
    const slot: Slot = {
      at: prev?.at ?? now,
      next: now + waitMs(fails),
      fails,
      status,
      json: prev?.json ?? null,
    };
    d.cache.set(url, slot);
    return slot;
  };
  try {
    const res = await d.fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json", "User-Agent": "CenturionTrade/explore" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status >= 300 && res.status < 400) return fail(res.status);
    if (res.status === 429) return fail(429);
    if (!res.ok) return fail(res.status);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("application/json")) return fail(res.status);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BODY) return fail(res.status);
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(buf));
    } catch {
      return fail(res.status);
    }
    const slot: Slot = { at: now, next: now, fails: 0, status: 200, json };
    d.cache.set(url, slot);
    return slot;
  } catch {
    return fail(0);
  }
}

export async function getJson(url: string, partial?: Partial<Net>): Promise<GetJson> {
  if (!allowedUrl(url)) return { status: 0, json: null, stale: false, kind: "unavailable" };
  const d = resolveNet(partial);
  const now = d.now();
  const hit = d.cache.get(url);
  if (hit && now < hit.next) {
    return {
      status: hit.status,
      json: hit.json,
      stale: hit.json != null,
      kind: hit.status === 429 ? "rate" : hit.json != null ? "ok" : "unavailable",
    };
  }
  if (hit && hit.json != null && hit.fails === 0 && now - hit.at < TTL_MS) {
    return { status: hit.status, json: hit.json, stale: false, kind: "ok" };
  }
  let job = d.inflight.get(url);
  if (!job) {
    job = pull(url, d, hit);
    d.inflight.set(url, job);
    void job.finally(() => {
      if (d.inflight.get(url) === job) d.inflight.delete(url);
    });
  }
  const slot = await job;
  const stale = slot.status !== 200 && slot.json != null;
  const kind: GetJson["kind"] = slot.status === 200 ? "ok" : slot.status === 429 ? "rate" : slot.json != null ? "ok" : "unavailable";
  return { status: slot.status, json: slot.json, stale, kind };
}

function emptyRaw(section: ExploreSection, window: ExploreWindow, now: number, error: FeedError | null, unsupported = false): RawExplore {
  return { section, window, fetchedAt: now, unsupported, error, stale: false, parts: [] };
}

export async function fetchRaw(section: string, window: string, partial?: Partial<Net>): Promise<RawExplore> {
  const d = resolveNet(partial);
  const now = d.now();
  if (!isSection(section) || !isWindow(window)) return emptyRaw("trending", "5m", now, "unavailable");
  if (section === "trending" && window === "1m") return emptyRaw(section, window, now, null, true);

  const parts: RawPart[] = [];
  let stale = false;
  let sawRate = false;
  let sawFail = false;

  const take = async (url: string | null, kind: RawPart["kind"]) => {
    if (!url) return;
    const got = await getJson(url, d);
    if (got.stale) stale = true;
    if (got.kind === "rate") sawRate = true;
    if (got.kind === "unavailable") sawFail = true;
    if (got.json != null) parts.push({ kind, json: got.json });
  };

  if (section === "trending") await take(trendingUrl(window), "jupiter");
  else if (section === "bluechip") await take(bluechipUrl(), "jupiter");
  else {
    await take(newPoolsUrl(1), "gecko");
    await take(newPoolsUrl(2), "gecko");
    const mints = [...new Set(parts.filter((p) => p.kind === "gecko").flatMap((p) => collectMints(p.json)))].slice(0, 40);
    await take(searchUrl(mints), "jupiter");
  }

  const error: FeedError | null = parts.length === 0 ? (sawRate ? "rate_limit" : "unavailable") : sawRate ? "rate_limit" : null;
  return {
    section,
    window,
    fetchedAt: now,
    unsupported: false,
    error,
    stale: parts.length > 0 && (stale || sawFail || sawRate),
    parts,
  };
}

export function emptyFeed(section: ExploreSection, window: ExploreWindow, error: FeedError | null = "unavailable"): ExploreFeed {
  return { section, window, fetchedAt: Date.now(), stale: false, unsupported: false, error, source: "Jupiter", rows: [] };
}

const SOURCES = new Set(["Jupiter", "GeckoTerminal", "Jupiter, GeckoTerminal"]);

export function feedFromRaw(input: unknown): ExploreFeed {
  if (!input || typeof input !== "object") return emptyFeed("trending", "5m");
  const raw = input as Partial<RawExplore>;
  const section = isSection(raw.section) ? raw.section : "trending";
  const window = isWindow(raw.window) ? raw.window : "5m";
  const fetchedAt = typeof raw.fetchedAt === "number" && Number.isFinite(raw.fetchedAt) ? raw.fetchedAt : Date.now();
  const error = raw.error === "rate_limit" || raw.error === "unavailable" ? raw.error : null;
  if (raw.unsupported === true) {
    return { section, window, fetchedAt, stale: false, unsupported: true, error: null, source: "Jupiter", rows: [] };
  }
  const parts = Array.isArray(raw.parts)
    ? raw.parts.filter((p): p is RawPart => !!p && (p.kind === "jupiter" || p.kind === "gecko")).slice(0, 8)
    : [];
  const jupiter = parts.filter((p) => p.kind === "jupiter");
  const gecko = parts.filter((p) => p.kind === "gecko");
  let rows = [];
  if (section === "trending" || section === "bluechip") {
    for (const part of jupiter) rows.push(...parseJupiter(part.json, window, fetchedAt));
  } else {
    for (const part of gecko) rows.push(...parseGecko(part.json, window, section === "graduated", fetchedAt));
    for (const part of jupiter) rows = enrichRows(rows, part.json, window, fetchedAt);
  }
  rows = selectRows(section, window, rows, fetchedAt);
  const source = gecko.length && jupiter.length ? "Jupiter, GeckoTerminal" : gecko.length ? "GeckoTerminal" : "Jupiter";
  return { section, window, fetchedAt, stale: raw.stale === true, unsupported: false, error: rows.length ? error : error, source, rows };
}

/** Re-check a feed that already went through the parser (the web response, or a replay). */
export function coerceFeed(input: unknown): ExploreFeed {
  if (!input || typeof input !== "object") return emptyFeed("trending", "5m");
  const o = input as Partial<ExploreFeed> & { parts?: unknown };
  if (Array.isArray(o.parts)) return feedFromRaw(input);
  const section = isSection(o.section) ? o.section : "trending";
  const window = isWindow(o.window) ? o.window : "5m";
  const rows = Array.isArray(o.rows) ? o.rows.flatMap((row) => { const h = hardenRow(row); return h ? [h] : []; }).slice(0, 100) : [];
  const source = typeof o.source === "string" && SOURCES.has(o.source) ? o.source : "Jupiter";
  return {
    section,
    window,
    fetchedAt: typeof o.fetchedAt === "number" && Number.isFinite(o.fetchedAt) ? o.fetchedAt : Date.now(),
    stale: o.stale === true,
    unsupported: o.unsupported === true,
    error: o.error === "rate_limit" || o.error === "unavailable" ? o.error : null,
    source,
    rows: o.unsupported ? [] : selectRows(section, window, rows, typeof o.fetchedAt === "number" ? o.fetchedAt : Date.now()),
  };
}

export async function loadExplore(section: string, window: string, partial?: Partial<Net>): Promise<ExploreFeed> {
  return feedFromRaw(await fetchRaw(section, window, partial));
}

export async function loadMint(mint: string, partial?: Partial<Net>): Promise<ExploreFeed> {
  const d = resolveNet(partial);
  const url = mintUrl(mint);
  if (!url) return emptyFeed("trending", "24h");
  const got = await getJson(url, d);
  const raw: RawExplore = {
    section: "trending",
    window: "24h",
    fetchedAt: d.now(),
    unsupported: false,
    error: got.json == null ? (got.kind === "rate" ? "rate_limit" : "unavailable") : null,
    stale: got.stale,
    parts: got.json == null ? [] : [{ kind: "jupiter", json: got.json }],
  };
  const feed = feedFromRaw(raw);
  return { ...feed, rows: feed.rows.filter((r) => r.mint === mint).slice(0, 1) };
}
