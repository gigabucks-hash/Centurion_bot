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

/**
 * A filter change (mode/strategy/range) restarts the ledger at its first page. The keyset cursor is an
 * opaque `(closed_at, id)` position and is NOT bound to the filter that produced it, so keeping it would
 * page the new filter from the old position and silently skip that filter's newest rows.
 */
export function pnlFilterQuery(current: string, key: string, value: string): string {
  const q = new URLSearchParams(current);
  if (value) q.set(key, value);
  else q.delete(key);
  q.delete("cursor");
  return q.toString();
}

export interface PnlReportInput {
  /** WorkspaceOverview.realizedPnlSol (per mode). null = not reported. */
  realized: number | null;
  /** WorkspaceOverview.unrealizedPnlSol (per mode). null = not reported. */
  unrealized: number | null;
  /** WorkspaceOverview.openPositions (per mode). null = no snapshot yet. */
  openPositions: number | null;
  /** Closed trades from the same mode's strategies (sum of `trades`). */
  trades: number;
  /** Wins from the same mode's strategies (sum of `wins`). */
  wins: number;
}

export interface PnlReportView {
  /** null = the server did not report the figure; the card shows an em dash, never an invented 0. */
  realized: number | null;
  /** null = no mark-to-market (e.g. an unmarked open remainder); shown as an em dash. */
  unrealized: number | null;
  /** null = neither the server total nor both parts are known, so the total is not reported. */
  total: number | null;
  /** null = the overview has no open-count snapshot yet; the hint prints an em dash. */
  openPositions: number | null;
  trades: number;
  wins: number;
  /** null = no closed trade yet, so there is no win rate (never 0 %). */
  winRatePct: number | null;
  hasClosed: boolean;
}

export function pnlReport(i: PnlReportInput): PnlReportView {
  const openPositions = i.openPositions == null ? null : Math.max(0, Math.trunc(i.openPositions));
  const trades = Math.max(0, Math.trunc(i.trades || 0));
  // A server that reports more wins than trades must not print >100 %.
  const wins = Math.min(trades, Math.max(0, Math.trunc(i.wins || 0)));
  // An unknown part leaves the total unknown: summing a missing figure would invent money.
  const realized = i.realized ?? null;
  const unrealized = i.unrealized ?? null;
  return {
    realized,
    unrealized,
    total: realized != null && unrealized != null ? realized + unrealized : null,
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
 *
 * A null money field means "not reported" (no data yet, or a legacy server), so it stays null and the
 * card prints an em dash. Turning it into 0 would state a flat result the server never sent.
 */
export function pnlReportFromSummary(s: PnlSummaryInput, openPositions: number | null = 0): PnlReportView {
  const realized = s.realizedPnlSol ?? null;
  const unrealized = s.unrealizedPnlSol ?? null;
  const trades = Math.max(0, Math.trunc(s.closedCount || 0));
  const wins = Math.min(trades, Math.max(0, Math.trunc(s.winCount || 0)));
  const winRatePct =
    s.winRatePct != null && Number.isFinite(s.winRatePct)
      ? Math.min(100, Math.max(0, s.winRatePct))
      : trades > 0 ? (wins / trades) * 100 : null;
  return {
    realized,
    unrealized,
    // The server's lamport total wins when present; otherwise sum only two reported parts.
    total: s.totalPnlSol ?? (realized != null && unrealized != null ? realized + unrealized : null),
    openPositions: openPositions == null ? null : Math.max(0, Math.trunc(openPositions || 0)),
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