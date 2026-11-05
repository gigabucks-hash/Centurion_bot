// Run: npm test  (Node ≥ 22.18 strips TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { closedTradeCounts, pnlReport } from "../pnl-report.ts";

test("total PnL is realized + unrealized (never re-derived from positions)", () => {
  const r = pnlReport({ realized: 0.41, unrealized: -0.12, openPositions: 2, trades: 3, wins: 2 });
  assert.ok(Math.abs(r.total - 0.29) < 1e-9);
  assert.equal(r.hasClosed, true);
  assert.ok(Math.abs(r.winRatePct! - 66.6666666) < 1e-3);
});

test("no closed trade → no win rate (null, never 0 %)", () => {
  const r = pnlReport({ realized: 0, unrealized: 0.5, openPositions: 1, trades: 0, wins: 0 });
  assert.equal(r.winRatePct, null);
  assert.equal(r.hasClosed, false);
  assert.equal(r.total, 0.5);
});

test("wins above trades are clamped; negative counts become zero", () => {
  const r = pnlReport({ realized: -1, unrealized: 0, openPositions: -3, trades: 2, wins: 9 });
  assert.equal(r.wins, 2);
  assert.equal(r.winRatePct, 100);
  assert.equal(r.openPositions, 0);
  assert.equal(r.total, -1);
});

test("closed-trade counts stay inside one mode and skip drafts", () => {
  const strategies = [
    { mode: "practice", status: "running", trades: 4, wins: 3 },
    { mode: "practice", status: "draft", trades: 0, wins: 0 },
    { mode: "real", status: "running", trades: 7, wins: 1 },
  ];
  assert.deepEqual(closedTradeCounts(strategies, "practice"), { trades: 4, wins: 3 });
  assert.deepEqual(closedTradeCounts(strategies, "real"), { trades: 7, wins: 1 });
});