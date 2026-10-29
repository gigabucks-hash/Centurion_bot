import { test } from "node:test";
import assert from "node:assert/strict";

// Contracts 1.1.3: official ApprovalWire, reject_reason (reject only), ConflictError.current required.
test("skip chips map to the closed reject_reason enum", async () => {
  const { rejectReasonFor, APPROVAL_REJECT_REASONS } = await import("../contracts.ts");
  assert.equal(rejectReasonFor({}), "user_declined");
  assert.equal(rejectReasonFor({ skipReason: "already_pumped" }), "price_moved");
  assert.equal(rejectReasonFor({ skipReason: "thin_liquidity" }), "other");
  assert.equal(rejectReasonFor({ skipReason: "dev_suspicious" }), "other");
  assert.equal(rejectReasonFor({ skipReason: "other" }), "other");
  assert.equal(rejectReasonFor({ notTradeable: true, skipReason: "already_pumped" }), "not_tradeable");
  for (const r of ["user_declined", "not_tradeable", "price_moved", "other"]) assert.ok(APPROVAL_REJECT_REASONS.includes(r as never));
});

test("ApprovalWire round-trips through the official shape (payload carries display extras)", async () => {
  const store = await import("../mock/store.ts");
  const { approvalToWire, approvalFromWire } = await import("../contracts.ts");
  for (const a of store.listApprovals("practice").concat(store.listApprovals("real"))) {
    const w = approvalToWire(a);
    for (const k of ["id", "proposal_id", "workspace_id", "strategy_id", "kind", "mode", "subject", "mint", "amount_lamports", "is_first_buy", "risk", "weakening", "status", "rev", "expire_reason", "base_rev", "decision", "reject_reason", "decided_via", "decided_by", "payload", "created_at", "expires_at", "decided_at"]) {
      assert.ok(k in w, `${a.id} missing ${k}`);
    }
    assert.equal(w.reject_reason === null, w.decision !== "reject", `${a.id}: reject_reason only on rejected`);
    const back = approvalFromWire(w);
    assert.equal(back.title, a.title);
    assert.equal(back.rev, a.rev);
    assert.equal(back.kind, a.kind);
  }
});

test("decision: reject_reason is reject-only and validated", async () => {
  const store = await import("../mock/store.ts");
  const p = store.listApprovals("practice").filter((a) => a.status === "pending" && a.kind === "buy_pick" && !a.screenerState);
  assert.ok(p.length >= 2);
  const t1 = store.issueDecisionToken(p[0].id).token;
  assert.throws(() => store.decideApprovalWire(p[0].id, { decision: "approve", token: t1, expected_rev: p[0].rev, reject_reason: "other" }), (e: { code?: string }) => e.code === "VALIDATION_FAILED");
  assert.throws(() => store.decideApprovalWire(p[0].id, { decision: "reject", token: t1, expected_rev: p[0].rev, reject_reason: "bogus" as never }), (e: { code?: string }) => e.code === "VALIDATION_FAILED");
  const r = store.decideApprovalWire(p[0].id, { decision: "reject", token: t1, expected_rev: p[0].rev, reason: "already_pumped", reject_reason: "price_moved" }) as { reject_reason: string };
  assert.equal(r.reject_reason, "price_moved");
  const t2 = store.issueDecisionToken(p[1].id).token;
  const d = store.decideApprovalWire(p[1].id, { decision: "reject", token: t2, expected_rev: p[1].rev }) as { reject_reason: string };
  assert.equal(d.reject_reason, "user_declined", "server default");
});

test("asRevConflict requires error.current (no empty merge view)", async () => {
  const { ApiError } = await import("../errors.ts");
  const { asRevConflict } = await import("../client.ts");
  const missing = new ApiError("STRATEGY_REV_CONFLICT", 409, { error: { code: "STRATEGY_REV_CONFLICT", current_rev: 3, base_rev: 2 } });
  assert.equal(asRevConflict(missing), null);
});

test("practice reset: new epoch overview starts at 30 paper SOL with no PnL or positions", async () => {
  const store = await import("../mock/store.ts");
  const { mockApi } = await import("../mock/index.ts");
  const before = await mockApi.getOverview("practice");
  assert.notEqual(before.realizedPnlSol, 0);
  store.resetPractice();
  const o = await mockApi.getOverview("practice");
  assert.equal(o.cashSol, 30);
  assert.equal(o.realizedPnlSol, 0);
  assert.equal(o.unrealizedPnlSol, 0);
  assert.equal(o.openPositions, 0);
  assert.equal(o.inPositionsSol, 0);
  assert.ok(o.equityCurve.every((p) => p.equitySol === 30));
  for (const s of await mockApi.listStrategies("practice")) assert.equal(s.realizedPnlSol, 0);
  assert.equal(store.listOpenPositions("practice").length, 0);
  assert.equal((await mockApi.getExitStats({ mode: "practice" })).length, 0);
  // Real is untouched.
  const real = await mockApi.getOverview("real");
  assert.notEqual(real.realizedPnlSol, 0);
});
