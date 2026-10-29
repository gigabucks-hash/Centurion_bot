import type { DashboardApi } from "@/lib/api";
import type { Approval, CoinSummary, CoinTrail, Strategy, TradeEvent } from "@/lib/types";
import { safeName, safeSymbol } from "@/lib/untrusted";
import { buildOverview, computeExitStats, coinSummaries, exitSamples, MOCK_NOW, recentEvents, trails } from "./data";
import * as store from "./store";

const HOUR = 3_600_000;
const START_SOL = Number(BigInt(store.PRACTICE_START_LAMPORTS) / 1_000_000_000n);

/** Practice epoch started by POST /practice/reset (null = the seeded epoch 1). Everything before it is archived. */
function practiceResetAt(mode: "practice" | "real"): number | null {
  return mode === "practice" ? store.practiceState().lastResetAt : null;
}

/** Untrusted coin text is cleaned at the data edge (lib/untrusted.ts), before any component sees it. */
const cleanEvent = (e: TradeEvent): TradeEvent => (e.symbol == null ? e : { ...e, symbol: safeSymbol(e.symbol) });
const cleanCoin = (c: CoinSummary): CoinSummary => ({ ...c, symbol: safeSymbol(c.symbol) });
const cleanTrail = (t: CoinTrail): CoinTrail => ({ ...t, coin: { ...t.coin, untrusted: { symbol: safeSymbol(t.coin.untrusted.symbol), name: safeName(t.coin.untrusted.name) } }, events: t.events.map(cleanEvent) });
const cleanApproval = (a: Approval): Approval => (a.symbol == null ? a : { ...a, symbol: safeSymbol(a.symbol) });

/** After a practice reset the new epoch starts flat: no PnL, no open positions, cash = 30 paper SOL. */
function freshEpoch(s: Strategy): Strategy {
  return { ...s, openPositions: 0, realizedPnlSol: 0, unrealizedPnlSol: 0, trades: 0, wins: 0, maxDrawdownPct: 0, avgHoldSeconds: 0, pnlSpark: [0, 0] };
}

/** Mock implementation of the dashboard data-access interface. */
export const mockApi: DashboardApi = {
  async getOverview(mode) {
    const approvals = store.listApprovals(mode).filter((a) => a.status === "pending");
    const now = Date.now();
    const resetAt = practiceResetAt(mode);
    if (resetAt != null) {
      const base = buildOverview(mode, store.listStrategies().map(freshEpoch));
      return {
        ...base,
        startingCashSol: START_SOL,
        cashSol: START_SOL,
        inPositionsSol: 0,
        realizedPnlSol: 0,
        unrealizedPnlSol: 0,
        openPositions: 0,
        drawdownPct: 0,
        equityCurve: [{ t: resetAt, equitySol: START_SOL }, { t: Math.max(now, resetAt + 60_000), equitySol: START_SOL }],
        alerts: [],
        updatedAt: now,
        pendingApprovals: approvals.length,
        expiringSoon: approvals.filter((a) => a.expiresAt - now < 2 * 60_000).length,
      };
    }
    return {
      ...buildOverview(mode, store.listStrategies()),
      pendingApprovals: approvals.length,
      expiringSoon: approvals.filter((a) => a.expiresAt - now < 2 * 60_000).length,
    };
  },
  async listStrategies(mode) {
    const list = store.listStrategies().filter((s) => s.mode === mode);
    return practiceResetAt(mode) != null ? list.map(freshEpoch) : list;
  },
  async getStrategy(id) {
    return store.getStrategy(id);
  },
  async publishStrategy(id, settings) {
    return store.publishStrategy(id, settings);
  },
  async listRecentEvents(mode, limit = 50) {
    const ids = new Set(store.listStrategies().filter((s) => s.mode === mode).map((s) => s.id));
    return recentEvents.filter((e) => e.strategyId && ids.has(e.strategyId)).slice(0, limit).map(cleanEvent);
  },
  async listCoins(mode) {
    return coinSummaries.filter((c) => c.mode === mode).map(cleanCoin);
  },
  async getCoinTrail(mint) {
    const t = trails.find((x) => x.coin.mint === mint);
    return t ? cleanTrail(t) : null;
  },
  async getExitStats(filter) {
    const rows = exitSamples.filter(
      (s) =>
        s.mode === filter.mode &&
        (!filter.strategyId || s.strategyId === filter.strategyId) &&
        (!filter.windowHours || s.closedAt >= MOCK_NOW - filter.windowHours * HOUR) &&
        // Practice reset archives the old epoch: exit stats start empty for the new one.
        (practiceResetAt(filter.mode) == null || s.closedAt >= practiceResetAt(filter.mode)!),
    );
    return computeExitStats(rows).filter((r) => r.count > 0);
  },
  async listApprovals(mode) {
    return store.listApprovals(mode).map(cleanApproval);
  },
  async decideApproval(id, decision) {
    return store.decideApproval(id, decision);
  },
};
