import { isMint, safeIcon, safeName, safeSymbol } from "./sanitize";
import type { ExploreRow, ExploreWindow, FeedClass } from "./types";

const MCAP_MAX = 1e15;
const PCT_MAX = 1e6;
const COUNT_MAX = 1e12;
const MIN_TS = Date.parse("2018-01-01T00:00:00Z");

/** Quote assets. A new pool's "token" is the other side. */
export const QUOTE_MINTS = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
]);

const VENUE: Record<string, string> = {
  pumpswap: "PumpSwap",
  raydium: "Raydium",
  "raydium-clmm": "Raydium",
  "pump-fun": "Pump.fun",
  meteora: "Meteora",
  "meteora-dbc": "Meteora",
  "meteora-damm-v2": "Meteora",
  "meteora-dlmm-pro": "Meteora",
  orca: "Orca",
  moonit: "Moonit",
  moonshot: "Moonshot",
};

const LAUNCHPAD: Record<string, string> = {
  "pump.fun": "Pump.fun",
  stonkfun: "Stonk.fun",
};

const VENUE_OK = new Set(Object.values(VENUE));

export function finite(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function nonNeg(v: unknown, max = MCAP_MAX): number | null {
  const n = finite(v);
  if (n == null || n < 0 || n > max) return null;
  return n;
}

export function countOf(v: unknown): number | null {
  const n = nonNeg(v, COUNT_MAX);
  return n == null ? null : Math.round(n);
}

export function timeMs(v: unknown, now: number): number | null {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t < MIN_TS || t > now + 86_400_000) return null;
  return t;
}

function flag(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function venueOf(v: unknown): string | null {
  return typeof v === "string" && VENUE_OK.has(v) ? v : null;
}

function feedClassOf(tags: unknown): FeedClass | null {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    if (tag === "stocks") return "stock";
    if (tag === "lst") return "lst";
  }
  return null;
}

export function hardenRow(input: unknown): ExploreRow | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Partial<ExploreRow>;
  if (!isMint(r.mint)) return null;
  const symbol = safeSymbol(r.symbol) || r.mint.slice(0, 4);
  const change = finite(r.changePct);
  const top = finite(r.top10Pct);
  const created = finite(r.createdAt);
  return {
    mint: r.mint,
    symbol,
    name: safeName(r.name),
    icon: safeIcon(r.icon),
    createdAt: created != null && created >= MIN_TS ? created : null,
    liquidityUsd: nonNeg(r.liquidityUsd),
    mcapUsd: nonNeg(r.mcapUsd),
    volumeUsd: nonNeg(r.volumeUsd),
    buys: countOf(r.buys),
    sells: countOf(r.sells),
    txns: countOf(r.txns),
    holders: countOf(r.holders),
    changePct: change != null && Math.abs(change) <= PCT_MAX ? change : null,
    mintRenounced: flag(r.mintRenounced),
    freezeRenounced: flag(r.freezeRenounced),
    lpBurned: flag(r.lpBurned),
    top10Pct: top != null && top >= 0 && top <= 100 ? top : null,
    venue: venueOf(r.venue),
    feedClass: r.feedClass === "stock" || r.feedClass === "lst" ? r.feedClass : null,
  };
}

function txns(buys: number | null, sells: number | null): number | null {
  if (buys == null && sells == null) return null;
  return (buys ?? 0) + (sells ?? 0);
}

const STAT_KEY: Partial<Record<ExploreWindow, string>> = {
  "5m": "stats5m",
  "1h": "stats1h",
  "6h": "stats6h",
  "24h": "stats24h",
};

function jupiterStats(token: Record<string, unknown>, window: ExploreWindow) {
  const key = STAT_KEY[window];
  const raw = key ? token[key] : null;
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!s) return { volumeUsd: null, buys: null, sells: null, changePct: null };
  const buyV = nonNeg(s.buyVolume);
  const sellV = nonNeg(s.sellVolume);
  const change = finite(s.priceChange);
  return {
    volumeUsd: buyV == null && sellV == null ? null : (buyV ?? 0) + (sellV ?? 0),
    buys: countOf(s.numBuys),
    sells: countOf(s.numSells),
    changePct: change != null && Math.abs(change) <= PCT_MAX ? change : null,
  };
}

function jupiterAudit(token: Record<string, unknown>) {
  const raw = token.audit;
  const a = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const top = a ? finite(a.topHoldersPercentage) : null;
  return {
    mintRenounced: a ? flag(a.mintAuthorityDisabled) : null,
    freezeRenounced: a ? flag(a.freezeAuthorityDisabled) : null,
    top10Pct: top != null && top >= 0 && top <= 100 ? top : null,
  };
}

/** Jupiter token-list array. Drops rows whose mint is not base58. */
export function parseJupiter(json: unknown, window: ExploreWindow, now: number): ExploreRow[] {
  if (!Array.isArray(json)) return [];
  const out: ExploreRow[] = [];
  for (const item of json.slice(0, 120)) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const pool = t.firstPool && typeof t.firstPool === "object" ? (t.firstPool as Record<string, unknown>) : null;
    const created = timeMs(pool?.createdAt, now) ?? timeMs(t.createdAt, now);
    const stats = jupiterStats(t, window);
    const audit = jupiterAudit(t);
    const launch = typeof t.launchpad === "string" ? LAUNCHPAD[t.launchpad] ?? null : null;
    const row = hardenRow({
      mint: t.id,
      symbol: t.symbol,
      name: t.name,
      icon: t.icon,
      createdAt: created,
      liquidityUsd: nonNeg(t.liquidity),
      mcapUsd: nonNeg(t.mcap) ?? nonNeg(t.fdv),
      holders: countOf(t.holderCount),
      venue: launch,
      feedClass: feedClassOf(t.tags),
      lpBurned: null,
      ...stats,
      ...audit,
      txns: txns(stats.buys, stats.sells),
    });
    if (row) out.push(row);
  }
  return out;
}

interface GeckoToken {
  address: string;
  name: unknown;
  symbol: unknown;
}

function geckoTokens(json: Record<string, unknown>): Map<string, GeckoToken> {
  const map = new Map<string, GeckoToken>();
  const included = Array.isArray(json.included) ? json.included : [];
  for (const item of included) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (o.type !== "token" || typeof o.id !== "string") continue;
    const attr = o.attributes && typeof o.attributes === "object" ? (o.attributes as Record<string, unknown>) : null;
    const address = attr && typeof attr.address === "string" ? attr.address : "";
    if (!isMint(address)) continue;
    map.set(o.id, { address, name: attr?.name, symbol: attr?.symbol });
  }
  return map;
}

function relId(pool: Record<string, unknown>, name: string): string | null {
  const rel = pool.relationships;
  if (!rel || typeof rel !== "object") return null;
  const edge = (rel as Record<string, unknown>)[name];
  if (!edge || typeof edge !== "object") return null;
  const data = (edge as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return null;
  const id = (data as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

const GECKO_STAT: Partial<Record<ExploreWindow, string>> = {
  "5m": "m5",
  "1h": "h1",
  "6h": "h6",
  "24h": "h24",
};

function geckoBucket(attr: Record<string, unknown>, field: string, window: ExploreWindow): Record<string, unknown> | null {
  const key = GECKO_STAT[window];
  const bag = attr[field];
  if (!key || !bag || typeof bag !== "object") return null;
  const row = (bag as Record<string, unknown>)[key];
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

function graduatedPool(dex: string | null, mint: string): boolean {
  if (dex === "pumpswap") return true;
  return (dex === "raydium" || dex === "raydium-clmm") && mint.endsWith("pump");
}

/** GeckoTerminal new-pool document. `graduated` keeps PumpSwap and Raydium migrations of pump.fun mints. */
export function parseGecko(json: unknown, window: ExploreWindow, graduated: boolean, now: number): ExploreRow[] {
  if (!json || typeof json !== "object") return [];
  const doc = json as Record<string, unknown>;
  const tokens = geckoTokens(doc);
  const pools = Array.isArray(doc.data) ? doc.data : [];
  const out: ExploreRow[] = [];
  for (const pool of pools.slice(0, 30)) {
    if (!pool || typeof pool !== "object") continue;
    const p = pool as Record<string, unknown>;
    const attr = p.attributes && typeof p.attributes === "object" ? (p.attributes as Record<string, unknown>) : null;
    if (!attr) continue;
    const dex = relId(p, "dex");
    const base = tokens.get(relId(p, "base_token") ?? "");
    const quote = tokens.get(relId(p, "quote_token") ?? "");
    const token = base && !QUOTE_MINTS.has(base.address) ? base : quote && !QUOTE_MINTS.has(quote.address) ? quote : null;
    if (!token) continue;
    if (graduated && !graduatedPool(dex, token.address)) continue;
    const txn = geckoBucket(attr, "transactions", window);
    const changeBag = attr.price_change_percentage;
    const changeKey = GECKO_STAT[window];
    const changeRaw = changeBag && typeof changeBag === "object" && changeKey ? (changeBag as Record<string, unknown>)[changeKey] : null;
    const change = finite(changeRaw);
    const volBag = attr.volume_usd;
    const volRaw = volBag && typeof volBag === "object" && changeKey ? (volBag as Record<string, unknown>)[changeKey] : null;
    const buys = txn ? countOf(txn.buys) : null;
    const sells = txn ? countOf(txn.sells) : null;
    const row = hardenRow({
      mint: token.address,
      symbol: token.symbol,
      name: token.name,
      icon: null,
      createdAt: timeMs(attr.pool_created_at, now),
      liquidityUsd: nonNeg(attr.reserve_in_usd),
      mcapUsd: nonNeg(attr.market_cap_usd) ?? nonNeg(attr.fdv_usd),
      volumeUsd: nonNeg(volRaw),
      buys,
      sells,
      txns: txns(buys, sells),
      holders: null,
      changePct: change != null && Math.abs(change) <= PCT_MAX ? change : null,
      mintRenounced: null,
      freezeRenounced: null,
      lpBurned: null,
      top10Pct: null,
      venue: dex ? VENUE[dex] ?? null : null,
      feedClass: null,
    });
    if (row) out.push(row);
  }
  return out;
}

/** Copy safety, holders, and a safe icon from a Jupiter search onto pool rows. Pool prices stay. */
export function enrichRows(rows: ExploreRow[], jupiterJson: unknown, window: ExploreWindow, now: number): ExploreRow[] {
  const extra = new Map(parseJupiter(jupiterJson, window, now).map((r) => [r.mint, r]));
  return rows.map((row) => {
    const j = extra.get(row.mint);
    if (!j) return row;
    return hardenRow({
      ...row,
      symbol: row.symbol || j.symbol,
      name: row.name || j.name,
      icon: row.icon ?? j.icon,
      holders: j.holders ?? row.holders,
      mintRenounced: j.mintRenounced,
      freezeRenounced: j.freezeRenounced,
      top10Pct: j.top10Pct,
      mcapUsd: row.mcapUsd ?? j.mcapUsd,
      liquidityUsd: row.liquidityUsd ?? j.liquidityUsd,
      feedClass: j.feedClass ?? row.feedClass,
      venue: row.venue ?? j.venue,
    }) ?? row;
  });
}

export function collectMints(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const out: string[] = [];
  const included = (json as Record<string, unknown>).included;
  if (!Array.isArray(included)) return out;
  for (const item of included) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (o.type !== "token") continue;
    const attr = o.attributes && typeof o.attributes === "object" ? (o.attributes as Record<string, unknown>) : null;
    const address = attr && typeof attr.address === "string" ? attr.address : "";
    if (!isMint(address) || out.includes(address)) continue;
    out.push(address);
    if (out.length === 40) break;
  }
  return out;
}
