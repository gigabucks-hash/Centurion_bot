/**
 * GeckoTerminal free OHLCV. No API key. Callers must go through getJson so the
 * 12s cache, in-flight coalescing, and 429 backoff apply. Pool addresses are
 * remembered longer than a single candle refresh.
 */
import { geckoPath } from "./hosts";
import { getJson, type Net } from "./load";
import { isMint, safeText } from "./sanitize";

export const GECKO = "https://api.geckoterminal.com";
export const WSOL = "So11111111111111111111111111111111111111112";
export const POOL_TTL_MS = 10 * 60_000;

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
export type CandleQuote = "usd" | "sol";

const FRAME: Record<Timeframe, { frame: "minute" | "hour" | "day"; aggregate: number }> = {
  "1m": { frame: "minute", aggregate: 1 },
  "5m": { frame: "minute", aggregate: 5 },
  "15m": { frame: "minute", aggregate: 15 },
  "1h": { frame: "hour", aggregate: 1 },
  "4h": { frame: "hour", aggregate: 4 },
  "1d": { frame: "day", aggregate: 1 },
};

export function isTimeframe(v: string): v is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(v);
}

export interface PoolPick {
  address: string;
  base: string;
  quote: string;
  /** Pool name from GeckoTerminal, plain text, e.g. "BONK / SOL". */
  pair: string;
  reserveUsd: number;
  volumeUsd: number;
}

export const VISIBLE_BARS = 120;

const SUB = "₀₁₂₃₄₅₆₇₈₉";

/** Axis label. Large prices keep two decimals. Tiny prices use a subscript zero count: 0.0₅5123. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs >= 100) return sign + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1) return sign + abs.toLocaleString("en-US", { maximumSignificantDigits: 4 });
  const exp = Math.floor(Math.log10(abs));
  const zeros = -exp - 1;
  if (zeros >= 3) {
    const mantissa = (abs / 10 ** exp).toPrecision(4).replace(".", "").replace(/0+$/, "");
    const sub = String(zeros).split("").map((d) => SUB[Number(d)] ?? "").join("");
    return `${sign}0.0${sub}${mantissa}`;
  }
  return sign + abs.toPrecision(4);
}

/** About 120 bars on a wide chart. A narrow pane shows fewer so each candle stays about 8px. */
export function visibleRange(count: number, width = 960): { from: number; to: number } {
  const fit = Math.max(40, Math.min(VISIBLE_BARS, Math.floor(width / 8)));
  const to = Math.max(count, 1);
  return { from: Math.max(0, to - fit), to };
}

export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketChart {
  ok: boolean;
  reason: "ok" | "rate" | "unavailable";
  candles: MarketCandle[];
  pool: string | null;
  pair: string | null;
  /** Which side of the pool is the mint, when the other side is SOL. */
  solSide: "base" | "quote" | null;
  currency: CandleQuote;
  attribution: string | null;
}

const poolCache = new Map<string, { at: number; pool: PoolPick }>();

export function rememberPool(mint: string, pool: PoolPick, now: number): void {
  poolCache.set(mint, { at: now, pool });
}

export function cachedPool(mint: string, now: number): PoolPick | null {
  const hit = poolCache.get(mint);
  if (!hit || now - hit.at > POOL_TTL_MS) return null;
  return hit.pool;
}

export function clearPoolCache(): void {
  poolCache.clear();
}

function gate(url: string): string | null {
  return geckoPath(new URL(url).pathname) ? url : null;
}

export function poolsUrl(mint: string): string | null {
  if (!isMint(mint)) return null;
  return gate(`${GECKO}/api/v2/networks/solana/tokens/${mint}/pools?page=1`);
}

export function ohlcvUrl(pool: string, tf: Timeframe, quote: CandleQuote, side: "base" | "quote"): string | null {
  if (!isMint(pool)) return null;
  const spec = FRAME[tf];
  const q = new URLSearchParams({
    aggregate: String(spec.aggregate),
    limit: "300",
    currency: quote === "sol" ? "token" : "usd",
  });
  if (quote === "sol") q.set("token", side);
  return gate(`${GECKO}/api/v2/networks/solana/pools/${pool}/ohlcv/${spec.frame}?${q}`);
}

export function attributionUrl(pool: string): string | null {
  if (!isMint(pool)) return null;
  return `https://www.geckoterminal.com/solana/pools/${pool}`;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function mintOf(id: unknown): string {
  if (typeof id !== "string") return "";
  const raw = id.startsWith("solana_") ? id.slice("solana_".length) : id;
  return isMint(raw) ? raw : "";
}

/** Highest reserve, then 24h volume. Ignores pools that are not this mint. */
export function pickPool(json: unknown, mint: string): PoolPick | null {
  const rows = (json as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return null;
  let best: PoolPick | null = null;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as {
      attributes?: { address?: unknown; name?: unknown; reserve_in_usd?: unknown; volume_usd?: { h24?: unknown } };
      relationships?: { base_token?: { data?: { id?: unknown } }; quote_token?: { data?: { id?: unknown } } };
    };
    const address = rec.attributes?.address;
    if (!isMint(address)) continue;
    const base = mintOf(rec.relationships?.base_token?.data?.id);
    const quote = mintOf(rec.relationships?.quote_token?.data?.id);
    if (base !== mint && quote !== mint) continue;
    const pool: PoolPick = {
      address,
      base,
      quote,
      pair: safeText(rec.attributes?.name, 48),
      reserveUsd: num(rec.attributes?.reserve_in_usd),
      volumeUsd: num(rec.attributes?.volume_usd?.h24),
    };
    if (!best || pool.reserveUsd > best.reserveUsd || (pool.reserveUsd === best.reserveUsd && pool.volumeUsd > best.volumeUsd)) {
      best = pool;
    }
  }
  return best;
}

export function solSide(pool: PoolPick, mint: string): "base" | "quote" | null {
  if (pool.base === mint && pool.quote === WSOL) return "base";
  if (pool.quote === mint && pool.base === WSOL) return "quote";
  return null;
}

/** Newest-first Gecko rows become an ascending candle series. Bad rows are dropped. */
export function parseOhlcv(json: unknown): MarketCandle[] {
  const list = (json as { data?: { attributes?: { ohlcv_list?: unknown } } })?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [];
  const byTime = new Map<number, MarketCandle>();
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = Math.trunc(num(row[0]));
    const open = num(row[1]);
    const high = num(row[2]);
    const low = num(row[3]);
    const close = num(row[4]);
    const volume = num(row[5]);
    if (time <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    if (!byTime.has(time)) byTime.set(time, { time, open, high, low, close, volume });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export async function loadMarketCandles(mint: string, tf: Timeframe, quote: CandleQuote, partial?: Partial<Net>): Promise<MarketChart> {
  const empty = (reason: MarketChart["reason"]): MarketChart => ({
    ok: false, reason, candles: [], pool: null, pair: null, solSide: null, currency: "usd", attribution: null,
  });
  if (!isMint(mint) || !isTimeframe(tf)) return empty("unavailable");
  const net: Partial<Net> = partial ?? {};
  const now = (net.now ?? Date.now)();
  let pool = cachedPool(mint, now);
  let rate = false;
  if (!pool) {
    const url = poolsUrl(mint);
    if (!url) return empty("unavailable");
    const got = await getJson(url, net);
    if (got.kind === "rate") rate = true;
    pool = got.json ? pickPool(got.json, mint) : null;
    if (pool) rememberPool(mint, pool, now);
  }
  if (!pool) return empty(rate ? "rate" : "unavailable");
  const side = solSide(pool, mint);
  const currency: CandleQuote = quote === "sol" && side ? "sol" : "usd";
  const barsUrl = ohlcvUrl(pool.address, tf, currency, side ?? "base");
  if (!barsUrl) return empty("unavailable");
  const bars = await getJson(barsUrl, net);
  if (bars.kind === "rate") rate = true;
  const candles = bars.json ? parseOhlcv(bars.json) : [];
  if (candles.length === 0) {
    return { ...empty(rate ? "rate" : "unavailable"), pool: pool.address, pair: pool.pair || null, solSide: side, attribution: attributionUrl(pool.address) };
  }
  return {
    ok: true,
    reason: "ok",
    candles,
    pool: pool.address,
    pair: pool.pair || null,
    solSide: side,
    currency,
    attribution: attributionUrl(pool.address),
  };
}
