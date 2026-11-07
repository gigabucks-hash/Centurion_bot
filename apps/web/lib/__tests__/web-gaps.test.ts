import { test } from "node:test";
import assert from "node:assert/strict";

// Item 1: the per-strategy mode switch follows POST /strategies/{id}/mode (paper-only phase).
test("mode switch: rev required, stale 409, practice -> real locked, real -> paper flips rev", async () => {
  const store = await import("../mock/store.ts");
  const practice = store.listStrategies().find((s) => s.mode === "practice" && s.status !== "archived" && s.status !== "draft")!;
  assert.throws(() => store.setStrategyMode(practice.id, "practice", null), (e: { code?: string }) => e.code === "PRECONDITION_REQUIRED");
  assert.throws(() => store.setStrategyMode(practice.id, "practice", practice.rev + 1), (e: { code?: string }) => e.code === "STRATEGY_REV_CONFLICT");
  // Same mode is an idempotent no-op (no rev bump).
  assert.equal(store.setStrategyMode(practice.id, "practice", practice.rev).rev, practice.rev);
  // practice -> real is always 403 MODE_NOT_ALLOWED while paper-only, with the lock reason for inline display.
  assert.throws(
    () => store.setStrategyMode(practice.id, "real", practice.rev),
    (e: { code?: string; details?: { real_locked_reason?: string } }) => e.code === "MODE_NOT_ALLOWED" && typeof e.details?.real_locked_reason === "string",
  );
  assert.equal(store.getStrategy(practice.id)!.mode, "practice");
});

test("mode switch: real -> practice is immediate and bumps rev", async () => {
  const store = await import("../mock/store.ts");
  const real = store.listStrategies().find((s) => s.mode === "real" && s.status !== "archived");
  assert.ok(real, "CENTURION_MOCK_REAL_DEMO seeds one Real strategy");
  const before = real!.rev;
  const next = store.setStrategyMode(real!.id, "practice", before);
  assert.equal(next.mode, "practice");
  assert.equal(next.rev, before + 1);
});

// Item 4: Indonesian PnL ledger headers. EN stays unchanged.
test("D9: Indonesian PnL headers are Indonesian", async () => {
  const { messagesFor } = await import("../i18n/index.ts");
  const id = (messagesFor("id") as { app: Record<string, Record<string, string>> }).app;
  const en = (messagesFor("en") as { app: Record<string, Record<string, string>> }).app;
  assert.equal(id.pnl.colWindow, "Masuk → keluar");
  assert.equal(id.pnl.colHold, "Durasi tahan");
  assert.equal(en.pnl.colWindow, "Entry → exit");
  assert.equal(en.pnl.colHold, "Hold");
  assert.equal(en.strategyMode.modeEndpointMissing, undefined);
  assert.equal(id.strategyMode.modeEndpointMissing, undefined);
});

// Item 3: the sell hold hint is empty until the user releases; it never claims a release on idle.
test("D8: sell hold hint only appears after interaction", async () => {
  const { sellHoldHint } = await import("../hold-hint.ts");
  const { createT } = await import("../i18n/index.ts");
  const t = createT("en");
  assert.equal(sellHoldHint(t, false), undefined);
  assert.equal(sellHoldHint(t, true), "Released early — nothing was sold");
});

// Item 5 / D4: dashboard count + in-positions SOL, /positions and /pnl read one store snapshot.
test("D4: approve adds a position; selling 100% removes it and appends one ledger close", async () => {
  const store = await import("../mock/store.ts");
  const { mockApi } = await import("../mock/index.ts");
  const pick = store.listApprovals("practice").find((a) => a.status === "pending" && a.kind === "buy_pick" && !a.screenerState && !!a.amountSol)!;
  assert.ok(pick, "a pending practice buy pick exists");

  const beforeOverview = await mockApi.getOverview("practice");
  const beforePositions = store.listOpenPositions("practice");
  const beforeSummary = await mockApi.getPnlSummary({ mode: "practice", window: "all" });
  assert.equal(beforeOverview.openPositions, beforePositions.length, "dashboard count = /positions count");

  store.decideApproval(pick.id, { action: "approve" });
  const opened = await mockApi.listOpenPositions("practice");
  const overview = await mockApi.getOverview("practice");
  const row = opened.find((p) => p.key === `approval:${pick.id}`)!;
  assert.ok(row, "approved pick appears on /positions");
  assert.equal(opened.length, beforePositions.length + 1);
  assert.equal(overview.openPositions, opened.length);
  assert.equal(overview.inPositionsSol, Math.round(opened.reduce((a, p) => a + p.solIn * (1 - p.soldPct / 100), 0) * 1e9) / 1e9);

  const closed = store.closePosition(row.key, row.rev, 10_000, "practice");
  assert.equal(closed.after.soldPct, 100);
  const afterPositions = await mockApi.listOpenPositions("practice");
  const afterOverview = await mockApi.getOverview("practice");
  const afterSummary = await mockApi.getPnlSummary({ mode: "practice", window: "all" });
  const page = await mockApi.listClosedTradesPage({ mode: "practice", window: "all", limit: 50 });
  assert.equal(afterPositions.length, beforePositions.length, "100% sell removes it from /positions");
  assert.equal(afterOverview.openPositions, afterPositions.length, "dashboard count follows the same snapshot");
  assert.equal(afterSummary.closedCount, beforeSummary.closedCount + 1, "/pnl sees the manual close");
  assert.equal(afterSummary.realizedPnlSol, afterOverview.realizedPnlSol, "dashboard realized = /pnl realized");
  assert.equal(page.items[0].positionKey, row.key, "newest /pnl row is the manual close");
  assert.equal(page.items[0].exitReason, "manual");
});

test("D4: real mode ledger and positions also share the snapshot", async () => {
  const { mockApi } = await import("../mock/index.ts");
  const o = await mockApi.getOverview("real");
  const positions = await mockApi.listOpenPositions("real");
  const summary = await mockApi.getPnlSummary({ mode: "real", window: "all" });
  assert.equal(o.openPositions, positions.length);
  assert.equal(o.inPositionsSol, Math.round(positions.reduce((a, p) => a + p.solIn * (1 - p.soldPct / 100), 0) * 1e9) / 1e9);
  assert.equal(summary.realizedPnlSol, o.realizedPnlSol);
});