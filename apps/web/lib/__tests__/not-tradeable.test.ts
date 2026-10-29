import { test } from "node:test";
import assert from "node:assert/strict";

// Apex correction (29 Oct): on "Not tradeable" (UNSUPPORTED_QUOTE_MINT) items Skip works as dismiss only;
// Approve (and Sell) stay disabled. Checked against the mock server.
test("not-tradeable pick: approve refused with UNSUPPORTED_QUOTE_MINT, skip (reject) dismisses", async () => {
  const store = await import("../mock/store.ts");
  const nt = store.listApprovals("practice").find((a) => a.screenerState === "UNSUPPORTED_QUOTE_MINT" && a.status === "pending");
  assert.ok(nt, "seeded race-case pick exists");
  assert.throws(() => store.decideApproval(nt.id, { action: "approve" }), (e: { code?: string }) => e.code === "UNSUPPORTED_QUOTE_MINT");
  const { token } = store.issueDecisionToken(nt.id);
  assert.throws(() => store.decideApprovalWire(nt.id, { decision: "approve", token, expected_rev: nt.rev }), (e: { code?: string }) => e.code === "UNSUPPORTED_QUOTE_MINT");
  const r = store.decideApprovalWire(nt.id, { decision: "reject", token, expected_rev: nt.rev, reason: null, reject_reason: "not_tradeable" }) as { status: string; reject_reason: string };
  assert.equal(r.status, "rejected");
  assert.equal(r.reject_reason, "not_tradeable");
  const { approvalToWire } = await import("../contracts.ts");
  const w = approvalToWire(store.getApproval(nt.id)!);
  assert.equal(w.decision, "reject");
  assert.equal(w.reject_reason, "not_tradeable");
});

test("not-tradeable coins come from the wire flag (tradeable:false + skip_reason)", async () => {
  const { coinSummaries, trails } = await import("../mock/data.ts");
  const c = coinSummaries.find((x) => x.screenerState === "UNSUPPORTED_QUOTE_MINT")!;
  const coin = trails.find((t) => t.coin.mint === c.mint)!.coin;
  assert.equal(coin.tradeable, false);
  assert.equal(coin.skipReason, "UNSUPPORTED_QUOTE_MINT");
  assert.ok(coin.decimals === 6 || coin.decimals === 9);
});
