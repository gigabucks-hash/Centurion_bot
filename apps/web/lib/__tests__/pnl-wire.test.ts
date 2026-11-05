// Run: npm test  (Node ≥ 22.18 strips TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PnlSummary as PnlSummaryWire, PositionWire } from "@centurion/contracts/wire";
import { closedTradeFromWire, pnlSummaryFromWire } from "../contracts.ts";

test("PnL summary: lamport strings decode once, null portfolio stays null", () => {
  const s = pnlSummaryFromWire({
    mode: "practice", practice_epoch: 1, window: "7d", from: "2026-11-01T00:00:00.000Z", to: null,
    unrealized_pnl_lamports: "-120000000", realized_pnl_lamports: "410000000", total_pnl_lamports: "290000000",
    realized_pnl_window_lamports: "-50000000", closed_count: 3, win_count: 2, win_rate_pct: 66.67,
    avg_hold_s: 420, fees_lamports: "12500000", best_pnl_lamports: "100000000", worst_pnl_lamports: "-70000000",
    as_of_seq: "42", ts: "2026-11-05T01:00:00.000Z",
  } as PnlSummaryWire);
  assert.equal(s.unrealizedPnlSol, -0.12);
  assert.equal(s.realizedPnlSol, 0.41);
  assert.equal(s.totalPnlSol, 0.29);
  assert.equal(s.realizedWindowSol, -0.05);
  assert.equal(s.closedCount, 3);
  assert.equal(s.winRatePct, 66.67);
  assert.equal(s.avgHoldSeconds, 420);
  assert.equal(s.feesSol, 0.0125);
  assert.equal(s.bestPnlSol, 0.1);
  assert.equal(s.worstPnlSol, -0.07);
  assert.equal(s.from, Date.parse("2026-11-01T00:00:00.000Z"));
  assert.equal(s.ts, Date.parse("2026-11-05T01:00:00.000Z"));

  const empty = pnlSummaryFromWire({
    mode: "practice", practice_epoch: null, window: "all", from: null, to: null,
    unrealized_pnl_lamports: null, realized_pnl_lamports: null, total_pnl_lamports: null,
    realized_pnl_window_lamports: "0", closed_count: 0, win_count: 0, win_rate_pct: null, avg_hold_s: null,
    fees_lamports: "0", best_pnl_lamports: null, worst_pnl_lamports: null, as_of_seq: null, ts: null,
  } as PnlSummaryWire);
  assert.equal(empty.realizedPnlSol, null, "missing snapshot ≠ 0");
  assert.equal(empty.unrealizedPnlSol, null);
  assert.equal(empty.totalPnlSol, null);
  assert.equal(empty.winRatePct, null, "no fake 0 %");
  assert.equal(empty.ts, null);
});

test("closed trade: realized PnL comes from pnl_lamports, not from the prices", () => {
  const t = closedTradeFromWire({
    id: "p1", position_key: "pick.1", strategy_id: "str_001", mint: "MockMint111", mode: "practice",
    status: "closed", rev: 3, practice_epoch: 1, sol_in_lamports: "250000000", sol_out_lamports: "300000000",
    fees_lamports: "6250000", pnl_lamports: "50000000", pnl_pct: 20, hold_seconds: 360,
    exit_reason: "profit_target", opened_at: "2026-11-05T00:00:00.000Z", closed_at: "2026-11-05T00:06:00.000Z",
    logo_hash: null,
  } as unknown as PositionWire);
  assert.equal(t.pnlSol, 0.05, "uses the server value");
  assert.equal(t.pnlPct, 20);
  assert.equal(t.solInSol, 0.25);
  assert.equal(t.solOutSol, 0.3);
  assert.equal(t.holdSeconds, 360);
  assert.equal(t.exitReason, "profit_target");
  assert.equal(t.closedAt, Date.parse("2026-11-05T00:06:00.000Z"));
  assert.equal(t.openedAt, Date.parse("2026-11-05T00:00:00.000Z"));
  assert.equal(t.symbol, null, "symbol is joined from the coin list, never invented here");
});