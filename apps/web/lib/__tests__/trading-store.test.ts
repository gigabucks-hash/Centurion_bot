import { test } from "node:test";
import assert from "node:assert/strict";

// Workspace trading state (Stop buying): optimistic rev + wire mapping.
test("pause sets state and bumps rev; resume clears it", async () => {
  const { getTradingState, pauseBuys, resumeBuys } = await import("../mock/trading.ts");
  const ws = "ws_test_pause_resume";
  const before = getTradingState(ws);
  assert.equal(before.buysPaused, false);
  assert.equal(before.agentTradeEnabled, true);

  const paused = pauseBuys(before.rev, ws);
  assert.equal(paused.buysPaused, true);
  assert.equal(paused.buysPausedVia, "web");
  assert.equal(typeof paused.buysPausedAt, "number");
  // Workspace Stop gates new buys only; it never flips the separate agent switch (same as the API).
  assert.equal(paused.agentTradeEnabled, true);
  assert.equal(paused.rev, before.rev + 1);

  const resumed = resumeBuys(paused.rev, ws);
  assert.equal(resumed.buysPaused, false);
  assert.equal(resumed.buysPausedVia, null);
  assert.equal(resumed.buysPausedAt, null);
  assert.equal(resumed.agentTradeEnabled, true);
  assert.equal(resumed.rev, before.rev + 2);
  // The module-level state is the source for the mock API read.
  assert.deepEqual(getTradingState(ws), resumed);
});

test("stale rev throws VERSION_CONFLICT and leaves state untouched", async () => {
  const { getTradingState, pauseBuys, resumeBuys } = await import("../mock/trading.ts");
  const { WireError } = await import("../mock/store.ts");
  const ws = "ws_test_conflict";
  const start = getTradingState(ws);
  pauseBuys(start.rev, ws);

  assert.throws(
    () => pauseBuys(start.rev, ws),
    (e: unknown) => e instanceof WireError && e.code === "VERSION_CONFLICT",
  );
  assert.throws(
    () => resumeBuys(start.rev, ws),
    (e: unknown) => e instanceof WireError && e.code === "VERSION_CONFLICT",
  );
  assert.equal(getTradingState(ws).buysPaused, true);
  assert.equal(getTradingState(ws).rev, start.rev + 1);
});

test("repeating the same intent at the current rev is a no-op (idempotent-ish)", async () => {
  const { getTradingState, pauseBuys, resumeBuys } = await import("../mock/trading.ts");
  const ws = "ws_test_idem";
  const start = getTradingState(ws);
  const paused = pauseBuys(start.rev, ws);
  const again = pauseBuys(paused.rev, ws);
  assert.equal(again.rev, paused.rev);
  assert.equal(again.buysPausedAt, paused.buysPausedAt);
  const resumed = resumeBuys(again.rev, ws);
  const resumedAgain = resumeBuys(resumed.rev, ws);
  assert.equal(resumedAgain.rev, resumed.rev);
  assert.equal(resumedAgain.buysPaused, false);
});

test("wire mapping round-trips snake_case, null-safe buys_paused_at", async () => {
  const { tradingToWire, getTradingState, pauseBuys } = await import("../mock/trading.ts");
  const { tradingFromWire } = await import("../trading.ts");
  const ws = "ws_test_wire";
  const paused = pauseBuys(getTradingState(ws).rev, ws);
  const wire = tradingToWire(paused);
  assert.equal(wire.buys_paused, true);
  assert.equal(wire.buys_paused_via, "web");
  assert.equal(wire.agent_trade_enabled, true, "Stop buying does not disable the agent");
  assert.equal(typeof wire.buys_paused_at, "string");
  assert.equal(tradingFromWire(wire).buysPausedAt, Date.parse(wire.buys_paused_at!));

  const idle = tradingFromWire({ buys_paused: false, buys_paused_via: null, buys_paused_at: null, agent_trade_enabled: true, rev: 7 });
  assert.deepEqual(idle, { buysPaused: false, buysPausedVia: null, buysPausedAt: null, agentTradeEnabled: true, rev: 7 });
  assert.equal(tradingFromWire({ ...wire, buys_paused_at: "not-a-date" }).buysPausedAt, null);
});