/**
 * PnL report aggregation (no re-derivation of money):
 * realized comes from the overview's closed-trade ledger, unrealized from the open remainder's
 * mark-to-market. Total is their sum — exactly what the equity hero moves by.
 *
 * Deliberately pure and hook-free so it runs on the server and in `node --test`.
 */
export const PNL_WINDOWS = ["1h", "24h", "7d", "30d", "all"] as const;

/** Range → hours for the mock's seeded clock; `all` = no cutoff. */
export function pnlWindowHours(w: string | null | undefined): number | null {
  switch (w ?? "7d") {
    case "1h": return 1;
    case "24h": return 24;
    case "7d": return 168;
    case "30d": return 720;
    case "all": return null;
    default: return 168;
  }
}

/** A `?window=` query value → the report enum (unknown/missing → 7d, the report default). */
export function parsePnlWindow(v: unknown): (typeof PNL_WINDOWS)[number] {
  const s = Array.isArray(v) ? v[0] : v;
  return (PNL_WINDOWS as readonly string[]).includes(String(s)) ? (s as (typeof PNL_WINDOWS)[number]) : "7d";
}

export interface PnlReportInput {
  /** WorkspaceOverview.realizedPnlSol (per mode). */
  realized: number;
  /** WorkspaceOverview.unrealizedPnlSol (per mode). */
  unrealized: number;
  /** WorkspaceOverview.openPositions (per mode). */
  openPositions: number;
  /** Closed trades from the same mode's strategies (sum of `trades`). */
  trades: number;
  /** Wins from the same mode's strategies (sum of `wins`). */
  wins: number;
}

export interface PnlReportView {
  realized: number;
  unrealized: number;
  total: number;
  openPositions: number;
  trades: number;
  wins: number;
  /** null = no closed trade yet, so there is no win rate (never 0 %). */
  winRatePct: number | null;
  hasClosed: boolean;
}

export function pnlReport(i: PnlReportInput): PnlReportView {
  const openPositions = Math.max(0, Math.trunc(i.openPositions || 0));
  const trades = Math.max(0, Math.trunc(i.trades || 0));
  // A server that reports more wins than trades must not print >100 %.
  const wins = Math.min(trades, Math.max(0, Math.trunc(i.wins || 0)));
  return {
    realized: i.realized || 0,
    unrealized: i.unrealized || 0,
    total: (i.realized || 0) + (i.unrealized || 0),
    openPositions,
    trades,
    wins,
    winRatePct: trades > 0 ? (wins / trades) * 100 : null,
    hasClosed: trades > 0,
  };
}

export interface PnlSummaryInput {
  realizedPnlSol: number | null;
  unrealizedPnlSol: number | null;
  totalPnlSol: number | null;
  closedCount: number;
  winCount: number;
  winRatePct: number | null;
}

/**
 * Card view from the server's `GET /stats/pnl`: the server's total and win rate win, because they
 * cover partial take-profits on open positions that the strategy counters do not. `openPositions`
 * still comes from the overview (the summary carries no open count).
 */
export function pnlReportFromSummary(s: PnlSummaryInput, openPositions = 0): PnlReportView {
  const realized = s.realizedPnlSol ?? 0;
  const unrealized = s.unrealizedPnlSol ?? 0;
  const trades = Math.max(0, Math.trunc(s.closedCount || 0));
  const wins = Math.min(trades, Math.max(0, Math.trunc(s.winCount || 0)));
  const winRatePct =
    s.winRatePct != null && Number.isFinite(s.winRatePct)
      ? Math.min(100, Math.max(0, s.winRatePct))
      : trades > 0 ? (wins / trades) * 100 : null;
  return {
    realized,
    unrealized,
    total: s.totalPnlSol ?? realized + unrealized,
    openPositions: Math.max(0, Math.trunc(openPositions || 0)),
    trades,
    wins,
    winRatePct,
    hasClosed: trades > 0,
  };
}

/**
 * Lamport-exact equality for two SOL display values (`realized` vs `realizedWindow`). Float division can
 * leave dust (0.30000000000000004), and a 1-lamport difference must not be rounded away as "equal".
 */
export function sameLamports(a: number, b: number): boolean {
  return Math.round(a * 1e9) === Math.round(b * 1e9);
}

/** Count closed trades / wins for one mode, skipping drafts (they never traded). */
export function closedTradeCounts(strategies: readonly { mode: string; status: string; trades: number; wins: number }[], mode: string) {
  let trades = 0;
  let wins = 0;
  for (const s of strategies) {
    if (s.mode !== mode || s.status === "draft") continue;
    trades += s.trades;
    wins += s.wins;
  }
  return { trades, wins };
}