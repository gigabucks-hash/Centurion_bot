// Per-strategy Real gate fields on strategy reads (contracts 1.1.6, StrategyRealGateFields).
// Real is gated off in this phase: every strategy is real_locked with reason needs_owner_approval. Nothing here
// enables, routes to or simulates a live path; it only reports paper progress against owner-set thresholds.
import type { Tx } from "./db.ts";

export type RealLockedReason = "needs_owner_approval" | "gate_not_met" | "policy" | "other";
export interface RealGateConfig { realGateMinPaperDays: number | null; realGateMinPaperTrades: number | null }

const DAY_MS = 86_400_000;

/** Whole days since the strategy's first practice buy (0 when none or in the future). */
export function paperDaysDone(firstBuyAt: unknown, nowMs: number): number {
  if (typeof firstBuyAt !== "string") return 0;
  const t = Date.parse(firstBuyAt);
  if (!Number.isFinite(t) || t > nowMs) return 0;
  return Math.floor((nowMs - t) / DAY_MS);
}

/** Adds real_locked, real_locked_reason, paper_progress to strategy wires (one query for all of them). */
export async function withRealGate<W extends Record<string, unknown>>(
  c: Tx, cfg: RealGateConfig, ws: string, wires: W[], nowMs = Date.now(),
): Promise<Array<W & Record<string, unknown>>> {
  if (wires.length === 0) return [];
  const ids = wires.map((w) => String(w.id));
  const q = await c.query<{ id: string; n: number }>(
    `select strategy_id::text as id, count(*)::int as n from public.positions
      where workspace_id = $1 and strategy_id = any($2::uuid[]) and mode = 'practice' and status = 'closed'
      group by strategy_id`,
    [ws, ids],
  );
  const trades = new Map(q.rows.map((r) => [r.id, r.n]));
  return wires.map((w) => ({
    ...w,
    real_locked: true,
    real_locked_reason: "needs_owner_approval" as RealLockedReason,
    paper_progress: {
      days_done: paperDaysDone(w.first_buy_at, nowMs),
      days_required: cfg.realGateMinPaperDays,
      trades_done: trades.get(String(w.id)) ?? 0,
      trades_required: cfg.realGateMinPaperTrades,
    },
  }));
}
