import { paginate } from "@/lib/paging";
import type { DashboardApi } from "@/lib/api";
import type { Approval, CoinSummary, CoinTrail, Strategy, TradeEvent } from "@/lib/types";
import { pnlWindowHours } from "@/lib/pnl-report";
import { safeName, safeSymbol } from "@/lib/untrusted";
import { buildOverview, computeExitStats, coinSummaries, MOCK_NOW, recentEvents, trails } from "./data";
import * as store from "./store";
import * as trading from "./trading";

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
    const snap = store.snapshot(mode);
    // D4: every money/count field comes from the same store snapshot as /positions and /pnl.
    const positions = resetAt != null ? [] : snap.positions;
    const realized = resetAt != null ? 0 : snap.realizedSol;
    const inPositions = resetAt != null ? 0 : snap.inPositionsSol;
    const unrealized = resetAt != null ? 0 : snap.unrealizedSol;
    const start = mode === "practice" ? START_SOL : 3;
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
    const base = buildOverview(mode, store.listStrategies());
    return {
      ...base,
      realizedPnlSol: realized,
      unrealizedPnlSol: unrealized,
      inPositionsSol: inPositions,
      cashSol: Math.round((start + realized - inPositions) * 1e9) / 1e9,
      openPositions: positions.length,
      openPositionsCap: Math.max(base.openPositionsCap, positions.length),
      pendingApprovals: approvals.length,
      expiringSoon: approvals.filter((a) => a.expiresAt - now < 2 * 60_000).length,
    };
  },
  async listStrategies(mode) {
    const snap = store.snapshot(mode);
    const list = store.listStrategies()
      .filter((s) => s.mode === mode)
      .map((s) => {
        const rows = snap.closes.filter((t) => t.strategyId === s.id);
        return {
          ...s,
          openPositions: snap.positions.filter((p) => p.strategyId === s.id).length,
          realizedPnlSol: Math.round(rows.reduce((a, t) => a + (t.pnlSol ?? 0), 0) * 1e9) / 1e9,
          trades: rows.length,
          wins: rows.filter((t) => (t.pnlSol ?? 0) > 0).length,
          avgHoldSeconds: rows.length ? Math.round(rows.reduce((a, t) => a + (t.holdSeconds ?? 0), 0) / rows.length) : 0,
        };
      });
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
  async listCoinsPage(mode, o = {}) {
    const p = paginate(coinSummaries.filter((c) => c.mode === mode), `coins:${mode}:`, (s) => ({ t: s.lastEventAt, id: `${s.mint}:${s.strategyId}` }), { cursor: o.cursor ?? null, limit: o.limit ?? 50 });
    return { items: p.items.map(cleanCoin), nextCursor: p.next_cursor };
  },
  async listOpenPositions(mode) {
    return store.listOpenPositions(mode).map((p) => ({ ...p, symbol: safeSymbol(p.symbol) }));
  },
  async getCoinTrail(mint) {
    const t = trails.find((x) => x.coin.mint === mint);
    return t ? cleanTrail(t) : null;
  },
  async getExitStats(filter) {
    const rows = store.listClosedLedger().filter(
      (s) =>
        s.mode === filter.mode &&
        (!filter.strategyId || s.strategyId === filter.strategyId) &&
        (!filter.windowHours || s.closedAt >= MOCK_NOW - filter.windowHours * HOUR) &&
        // Practice reset archives the old epoch: exit stats start empty for the new one.
        (practiceResetAt(filter.mode) == null || s.closedAt >= practiceResetAt(filter.mode)!),
    );
    return computeExitStats(rows).filter((r) => r.count > 0);
  },
  /**
   * 0022 `GET /stats/pnl`. The seeded ledger uses the fixed mock clock (`MOCK_NOW`), not `Date.now()`,
   * so the window matches what the other mock screens show. `realized` is all-time, the window fields
   * only count whole exits inside the range — exactly the backend split.
   */
  async getPnlSummary(filter) {
    const window = filter.window ?? "7d";
    const hours = pnlWindowHours(window);
    const resetAt = practiceResetAt(filter.mode);
    // Backend 0022 scope: the portfolio snapshot (unrealized/realized/total) is per workspace+mode and
    // does NOT narrow with `strategy_id`; only the window numbers and the ledger do. Mirrored here so a
    // bot filter cannot silently turn a workspace total into a strategy total.
    const allRows = store.listClosedLedger().filter((t) => t.mode === filter.mode && (resetAt == null || t.closedAt >= resetAt));
    const rows = filter.strategyId ? allRows.filter((t) => t.strategyId === filter.strategyId) : allRows;
    const inWindow = hours == null ? rows : rows.filter((t) => t.closedAt >= MOCK_NOW - hours * HOUR);
    const sum = (xs: typeof rows) => Math.round(xs.reduce((a, r) => a + (r.pnlSol ?? 0), 0) * 1e9) / 1e9;
    // D4: unrealized comes from the same open-position snapshot /positions renders.
    const unrealized = resetAt != null ? 0 : store.snapshot(filter.mode).unrealizedSol;
    const realized = sum(allRows);
    const wins = inWindow.filter((r) => r.pnlSol > 0).length;
    return {
      mode: filter.mode,
      practiceEpoch: store.practiceState().epoch,
      window,
      from: hours == null ? null : MOCK_NOW - hours * HOUR,
      to: null,
      unrealizedPnlSol: unrealized,
      realizedPnlSol: realized,
      totalPnlSol: Math.round((realized + unrealized) * 1e9) / 1e9,
      realizedWindowSol: sum(inWindow),
      closedCount: inWindow.length,
      winCount: wins,
      winRatePct: inWindow.length ? Math.round((wins / inWindow.length) * 10000) / 100 : null,
      avgHoldSeconds: inWindow.length ? Math.round(inWindow.reduce((a, r) => a + r.holdSeconds, 0) / inWindow.length) : null,
      feesSol: Math.round(inWindow.reduce((a, r) => a + r.feesSol, 0) * 1e9) / 1e9,
      bestPnlSol: inWindow.length ? Math.max(...inWindow.map((r) => r.pnlSol)) : null,
      worstPnlSol: inWindow.length ? Math.min(...inWindow.map((r) => r.pnlSol)) : null,
      asOfSeq: null,
      ts: MOCK_NOW,
    };
  },

  /** 0022 `GET /positions?state=closed`: newest close first, realized locked at close. */
  async listClosedTrades(filter) {
    return (await mockApi.listClosedTradesPage({ ...filter, limit: filter.limit ?? 100 })).items;
  },
  async listClosedTradesPage(filter) {
    const hours = pnlWindowHours(filter.window ?? "7d");
    const resetAt = practiceResetAt(filter.mode);
    const rows = store.listClosedLedger().filter(
      (t) =>
        t.mode === filter.mode &&
        (!filter.strategyId || t.strategyId === filter.strategyId) &&
        (resetAt == null || t.closedAt >= resetAt) &&
        (hours == null || t.closedAt >= MOCK_NOW - hours * HOUR),
    );
    const p = paginate(rows, `positions:closed:${filter.mode}`, (t) => ({ t: t.closedAt, id: t.id }), { cursor: filter.cursor ?? null, limit: filter.limit ?? 50 });
    return {
      nextCursor: p.next_cursor,
      items: p.items.map((t) => ({
        id: t.id,
        positionKey: t.id,
        strategyId: t.strategyId,
        mode: t.mode,
        mint: t.mint,
        symbol: safeSymbol(t.symbol),
        logoHash: t.logoHash,
        solInSol: t.solInSol,
        solOutSol: t.solOutSol,
        feesSol: t.feesSol,
        pnlSol: t.pnlSol,
        pnlPct: t.pnlPct,
        holdSeconds: t.holdSeconds,
        exitReason: t.reason,
        openedAt: t.closedAt - t.holdSeconds * 1000,
        closedAt: t.closedAt,
      })),
    };
  },

  async listApprovals(mode) {
    return store.listApprovals(mode).map(cleanApproval);
  },
  async decideApproval(id, decision) {
    return store.decideApproval(id, decision);
  },
  async getTrading() {
    return trading.getTradingState();
  },
};
