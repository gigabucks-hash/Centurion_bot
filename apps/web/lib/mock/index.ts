import type { DashboardApi } from "@/lib/api";
import { buildOverview, computeExitStats, coinSummaries, exitSamples, MOCK_NOW, recentEvents, trails } from "./data";
import * as store from "./store";

const HOUR = 3_600_000;

/** Mock implementation of the dashboard data-access interface. */
export const mockApi: DashboardApi = {
  async getOverview(mode) {
    const approvals = store.listApprovals(mode).filter((a) => a.status === "pending");
    const now = Date.now();
    return {
      ...buildOverview(mode, store.listStrategies()),
      pendingApprovals: approvals.length,
      expiringSoon: approvals.filter((a) => a.expiresAt - now < 2 * 60_000).length,
    };
  },
  async listStrategies(mode) {
    return store.listStrategies().filter((s) => s.mode === mode);
  },
  async getStrategy(id) {
    return store.getStrategy(id);
  },
  async publishStrategy(id, settings) {
    return store.publishStrategy(id, settings);
  },
  async listRecentEvents(mode, limit = 50) {
    const ids = new Set(store.listStrategies().filter((s) => s.mode === mode).map((s) => s.id));
    return recentEvents.filter((e) => e.strategyId && ids.has(e.strategyId)).slice(0, limit);
  },
  async listCoins(mode) {
    return coinSummaries.filter((c) => c.mode === mode);
  },
  async getCoinTrail(mint) {
    return trails.find((t) => t.coin.mint === mint) ?? null;
  },
  async getExitStats(filter) {
    const rows = exitSamples.filter(
      (s) =>
        s.mode === filter.mode &&
        (!filter.strategyId || s.strategyId === filter.strategyId) &&
        (!filter.windowHours || s.closedAt >= MOCK_NOW - filter.windowHours * HOUR),
    );
    return computeExitStats(rows).filter((r) => r.count > 0);
  },
  async listApprovals(mode) {
    return store.listApprovals(mode);
  },
  async decideApproval(id, decision) {
    return store.decideApproval(id, decision);
  },
};
