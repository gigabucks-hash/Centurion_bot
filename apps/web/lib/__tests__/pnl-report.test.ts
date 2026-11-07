// Run: npm test  (Node ≥ 22.18 strips TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { closedTradeCounts, parsePnlWindow, pnlReport, pnlReportFromSummary, pnlWindowHours } from "../pnl-report.ts";

test("total PnL is realized + unrealized (never re-derived from positions)", () => {
  const r = pnlReport({ realized: 0.41, unrealized: -0.12, openPositions: 2, trades: 3, wins: 2 });
  assert.ok(r.total != null && Math.abs(r.total - 0.29) < 1e-9);
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

test("summary path: the server total wins and is never re-added", () => {
  const r = pnlReportFromSummary({ realizedPnlSol: 0.41, unrealizedPnlSol: -0.12, totalPnlSol: 0.28, closedCount: 3, winCount: 0, winRatePct: 0 }, 2);
  assert.equal(r.total, 0.28, "0.28 is the server's exact lamport sum, not 0.29");
  assert.equal(r.realized, 0.41);
  assert.equal(r.unrealized, -0.12);
  assert.equal(r.openPositions, 2);
  assert.equal(r.winRatePct, 0, "an explicit 0 % is kept (closed trades, no wins)");
});

test("summary path: an unreported value stays null (em dash), never an invented 0", () => {
  const r = pnlReportFromSummary({ realizedPnlSol: null, unrealizedPnlSol: null, totalPnlSol: null, closedCount: 0, winCount: 0, winRatePct: null }, 1);
  assert.equal(r.realized, null);
  assert.equal(r.unrealized, null);
  assert.equal(r.total, null);
  assert.equal(r.winRatePct, null);
  assert.equal(r.hasClosed, false);
});

test("summary path: a total is only summed from two reported parts", () => {
  const partial = pnlReportFromSummary({ realizedPnlSol: 0.4, unrealizedPnlSol: null, totalPnlSol: null, closedCount: 0, winCount: 0, winRatePct: null }, 0);
  assert.equal(partial.total, null, "one missing part must not be read as 0");
  const both = pnlReportFromSummary({ realizedPnlSol: 0.4, unrealizedPnlSol: -0.1, totalPnlSol: null, closedCount: 0, winCount: 0, winRatePct: null }, 0);
  assert.ok(both.total != null && Math.abs(both.total - 0.3) < 1e-9);
  const explicitZero = pnlReportFromSummary({ realizedPnlSol: 0, unrealizedPnlSol: 0, totalPnlSol: 0, closedCount: 0, winCount: 0, winRatePct: null }, 0);
  assert.equal(explicitZero.total, 0, "a reported 0 is a real flat result, not null");
});

test("summary path clamps a bad win rate / win count", () => {
  const r = pnlReportFromSummary({ realizedPnlSol: 0, unrealizedPnlSol: 0, totalPnlSol: 0, closedCount: 2, winCount: 9, winRatePct: 140 }, 0);
  assert.equal(r.wins, 2);
  assert.equal(r.winRatePct, 100);
});

test("report window parsing: default 7d, unknown → 7d, hours map", () => {
  assert.equal(parsePnlWindow(undefined), "7d");
  assert.equal(parsePnlWindow("1h"), "1h");
  assert.equal(parsePnlWindow("1y"), "7d");
  assert.equal(parsePnlWindow(["all"]), "all");
  assert.equal(pnlWindowHours("1h"), 1);
  assert.equal(pnlWindowHours("24h"), 24);
  assert.equal(pnlWindowHours("7d"), 168);
  assert.equal(pnlWindowHours("30d"), 720);
  assert.equal(pnlWindowHours("all"), null);
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

test("server summary keeps total exact and reports all-time vs range separately", async () => {
  const { mockApi } = await import("../mock/index.ts");
  const all = await mockApi.getPnlSummary({ mode: "practice", window: "all" });
  assert.ok(all.realizedPnlSol != null && all.unrealizedPnlSol != null && all.totalPnlSol != null);
  assert.equal(Math.round(all.totalPnlSol! * 1e9), Math.round(all.realizedPnlSol! * 1e9) + Math.round(all.unrealizedPnlSol! * 1e9));
  // `realized` is all-time (partial TPs included); the range value only counts whole exits inside it.
  assert.equal(all.realizedWindowSol, all.realizedPnlSol, "all = no cutoff");
  const day = await mockApi.getPnlSummary({ mode: "practice", window: "24h" });
  assert.ok(day.closedCount <= all.closedCount);
});

test("closed ledger pages by keyset: newest first, no duplicates, cursor ends", async () => {
  const { mockApi } = await import("../mock/index.ts");
  const first = await mockApi.listClosedTradesPage({ mode: "practice", window: "all", limit: 5 });
  assert.ok(first.items.length <= 5);
  for (let i = 1; i < first.items.length; i++) assert.ok(first.items[i - 1].closedAt >= first.items[i].closedAt);
  if (first.nextCursor) {
    const second = await mockApi.listClosedTradesPage({ mode: "practice", window: "all", limit: 5, cursor: first.nextCursor });
    const seen = new Set(first.items.map((r) => r.id));
    for (const r of second.items) assert.ok(!seen.has(r.id), "no row repeats across pages");
    assert.ok(second.items.every((r) => r.closedAt <= first.items[first.items.length - 1].closedAt));
  }
});

test("overview path: an unreported figure stays null (em dash) and never creates a total", () => {
  const r = pnlReport({ realized: null, unrealized: null, openPositions: null, trades: 0, wins: 0 });
  assert.equal(r.realized, null);
  assert.equal(r.unrealized, null);
  assert.equal(r.total, null, "two missing parts must not sum to 0");
  assert.equal(r.openPositions, null, "no overview snapshot yet is unknown, not 0 open");
  const partial = pnlReport({ realized: 0.4, unrealized: null, openPositions: 1, trades: 0, wins: 0 });
  assert.equal(partial.total, null, "one missing part must not be read as 0");
  const flat = pnlReport({ realized: 0, unrealized: 0, openPositions: 0, trades: 0, wins: 0 });
  assert.equal(flat.total, 0, "a reported 0 is a real flat result");
});

test("summary path: a missing open count stays unknown", () => {
  const r = pnlReportFromSummary({ realizedPnlSol: 0.1, unrealizedPnlSol: 0, totalPnlSol: 0.1, closedCount: 1, winCount: 1, winRatePct: 100 }, null);
  assert.equal(r.openPositions, null);
});

test("an invalid ledger cursor is a CURSOR_INVALID error the page can recover from", async () => {
  const { mockApi } = await import("../mock/index.ts");
  await assert.rejects(
    () => mockApi.listClosedTradesPage({ mode: "practice", window: "all", limit: 5, cursor: "not-a-uuid" }),
    (e: unknown) => (e as Error).message === "CURSOR_INVALID",
  );
});

test("a filter change drops the ledger cursor (keyset position is not filter-bound)", async () => {
  const { pnlFilterQuery } = await import("../pnl-report.ts");
  // Page 2 of 7d is an opaque (closed_at, id) position; switching range must start the new ledger at page 1,
  // otherwise the new range pages from the old position and silently skips its newest rows.
  assert.equal(pnlFilterQuery("window=7d&cursor=abc", "window", "30d"), "window=30d");
  assert.equal(pnlFilterQuery("window=7d&strategy=one&cursor=abc", "strategy", "two"), "window=7d&strategy=two");
  assert.equal(pnlFilterQuery("window=7d&strategy=one&cursor=abc", "strategy", ""), "window=7d");
  // A no-cursor URL is unchanged apart from the edited key (order kept, no stray `?`).
  assert.equal(pnlFilterQuery("window=7d", "window", "all"), "window=all");
});
