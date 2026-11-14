export const SECTIONS = ["trending", "graduated", "bluechip", "new"] as const;
export const WINDOWS = ["1m", "5m", "1h", "6h", "24h"] as const;

export type ExploreSection = (typeof SECTIONS)[number];
export type ExploreWindow = (typeof WINDOWS)[number];
export type FeedError = "rate_limit" | "unavailable";
export type FeedClass = "stock" | "lst";
export type SortKey = "symbol" | "age" | "liquidity" | "mcap" | "volume" | "txns" | "holders" | "change" | "top10";
export type SortDir = "asc" | "desc";

export interface ExploreRow {
  mint: string;
  symbol: string;
  name: string;
  /** Allowlisted https icon, or null. Never an arbitrary URL. */
  icon: string | null;
  createdAt: number | null;
  liquidityUsd: number | null;
  mcapUsd: number | null;
  volumeUsd: number | null;
  buys: number | null;
  sells: number | null;
  txns: number | null;
  holders: number | null;
  changePct: number | null;
  mintRenounced: boolean | null;
  freezeRenounced: boolean | null;
  /** Null when the free feed does not say. Never invented. */
  lpBurned: boolean | null;
  top10Pct: number | null;
  venue: string | null;
  /** Not rendered. Used only to keep stocks and LSTs out of Blue chip. */
  feedClass: FeedClass | null;
}

export interface ExploreFeed {
  section: ExploreSection;
  window: ExploreWindow;
  fetchedAt: number;
  stale: boolean;
  unsupported: boolean;
  error: FeedError | null;
  source: string;
  rows: ExploreRow[];
}

export interface RawPart {
  kind: "jupiter" | "gecko";
  json: unknown;
}

export interface RawExplore {
  section: ExploreSection;
  window: ExploreWindow;
  fetchedAt: number;
  unsupported: boolean;
  error: FeedError | null;
  stale: boolean;
  parts: RawPart[];
}

export function isSection(v: unknown): v is ExploreSection {
  return typeof v === "string" && (SECTIONS as readonly string[]).includes(v);
}

export function isWindow(v: unknown): v is ExploreWindow {
  return typeof v === "string" && (WINDOWS as readonly string[]).includes(v);
}

export const WINDOW_MS: Record<ExploreWindow, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};
