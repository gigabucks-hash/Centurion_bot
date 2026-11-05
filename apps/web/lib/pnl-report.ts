/**
 * PnL report aggregation (no re-derivation of money):
 * realized comes from the overview's closed-trade ledger, unrealized from the open remainder's
 * mark-to-market. Total is their sum — exactly what the equity hero moves by.
 *
 * Deliberately pure and hook-free so it runs on the server and in `node --test`.
 */
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