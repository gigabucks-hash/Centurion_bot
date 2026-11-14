import { QUOTE_MINTS } from "./parse";
import type { ExploreRow, ExploreSection, ExploreWindow, SortDir, SortKey } from "./types";
import { WINDOW_MS } from "./types";

export const BLUE_MIN_MCAP = 10_000_000;
export const BLUE_MIN_LIQ = 250_000;
export const BLUE_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const MAJORS = new Set([
  "SOL", "USDC", "USDT", "USD1", "JUP", "RAY", "ORCA", "JTO", "PYTH", "JLP",
  "MSOL", "JITOSOL", "BSOL", "INF", "WETH", "WBTC", "PYUSD", "EURC",
]);

export function isBlueChip(row: ExploreRow, now: number): boolean {
  if (row.feedClass) return false;
  if (QUOTE_MINTS.has(row.mint)) return false;
  if (MAJORS.has(row.symbol.toUpperCase())) return false;
  if (row.mcapUsd == null || row.mcapUsd < BLUE_MIN_MCAP) return false;
  if (row.liquidityUsd == null || row.liquidityUsd < BLUE_MIN_LIQ) return false;
  if (row.createdAt == null || now - row.createdAt < BLUE_MIN_AGE_MS) return false;
  return true;
}

export function defaultSort(section: ExploreSection): { sort: SortKey; dir: SortDir } {
  if (section === "trending") return { sort: "volume", dir: "desc" };
  if (section === "bluechip") return { sort: "mcap", dir: "desc" };
  return { sort: "age", dir: "asc" };
}

export interface ExploreQuery {
  minLiq: number | null;
  minMcap: number | null;
  /** Maximum age in minutes. Null means no extra cap. */
  maxAgeMin: number | null;
  sort: SortKey;
  dir: SortDir;
  now: number;
}

function field(row: ExploreRow, key: SortKey, now: number): number | string | null {
  switch (key) {
    case "symbol":
      return row.symbol.toLowerCase();
    case "age":
      return row.createdAt == null ? null : now - row.createdAt;
    case "liquidity":
      return row.liquidityUsd;
    case "mcap":
      return row.mcapUsd;
    case "volume":
      return row.volumeUsd;
    case "txns":
      return row.txns;
    case "holders":
      return row.holders;
    case "change":
      return row.changePct;
    case "top10":
      return row.top10Pct;
    default:
      return null;
  }
}

/** Client filters and sort. Nulls sort last. Does not buy, and does not drop safety fields. */
export function applyExploreQuery(rows: readonly ExploreRow[], q: ExploreQuery): ExploreRow[] {
  const minLiq = q.minLiq != null && q.minLiq > 0 ? q.minLiq : null;
  const minMcap = q.minMcap != null && q.minMcap > 0 ? q.minMcap : null;
  const maxAge = q.maxAgeMin != null && q.maxAgeMin > 0 ? q.maxAgeMin * 60_000 : null;
  const filtered = rows.filter((r) => {
    if (minLiq != null && (r.liquidityUsd == null || r.liquidityUsd < minLiq)) return false;
    if (minMcap != null && (r.mcapUsd == null || r.mcapUsd < minMcap)) return false;
    if (maxAge != null && (r.createdAt == null || q.now - r.createdAt > maxAge)) return false;
    return true;
  });
  const dir = q.dir === "asc" ? 1 : -1;
  return filtered.slice().sort((a, b) => {
    const av = field(a, q.sort, q.now);
    const bv = field(b, q.sort, q.now);
    if (av == null && bv == null) return a.mint < b.mint ? -1 : a.mint > b.mint ? 1 : 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.mint < b.mint ? -1 : a.mint > b.mint ? 1 : 0;
  });
}

function dedupe(rows: ExploreRow[]): ExploreRow[] {
  const map = new Map<string, ExploreRow>();
  for (const row of rows) {
    const prev = map.get(row.mint);
    if (!prev || (row.createdAt ?? 0) > (prev.createdAt ?? 0)) map.set(row.mint, row);
  }
  return [...map.values()];
}

export function selectRows(section: ExploreSection, window: ExploreWindow, rows: ExploreRow[], now: number): ExploreRow[] {
  let out = dedupe(rows);
  if (section === "bluechip") out = out.filter((r) => isBlueChip(r, now));
  if (section === "new" || section === "graduated") {
    const max = WINDOW_MS[window];
    out = out.filter((r) => r.createdAt != null && now - r.createdAt <= max && r.createdAt <= now + 60_000);
  }
  const sort = defaultSort(section);
  return applyExploreQuery(out, { minLiq: null, minMcap: null, maxAgeMin: null, ...sort, now }).slice(0, 100);
}
