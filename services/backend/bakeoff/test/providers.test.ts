import { test } from "node:test";
import assert from "node:assert/strict";
import { TurnkeyMock, renderTurnkeyPolicy } from "../src/providers/turnkey-mock.ts";
import { CrossmintMock, lamportsToSol } from "../src/providers/crossmint-mock.ts";
import type { ProviderPolicySpec, SignerProvider } from "../src/provider.ts";
import { executeTrade } from "../src/pipeline.ts";
import { MockSimulator, type PresignPolicy } from "../src/presign.ts";
import { addr, buildTx, ix } from "../src/txbuild.ts";
import { allowlistFor } from "../src/solana/programs.ts";

const OWNER = addr("owner");
const FOREIGN = addr("attacker");
const spec: ProviderPolicySpec = { allowedPrograms: allowlistFor("devnet").map((p) => p.id), perTxCapLamports: 50_000_000n, windowCapLamports: 100_000_000n, windowSeconds: 86400, allowedRecipients: [OWNER], expiresAt: null };
const policy: PresignPolicy = { cluster: "devnet", owner: OWNER, ownedAccounts: [], perTxCapLamports: 50_000_000n, maxCuPriceMicroLamports: 200_000n };

async function setup(p: SignerProvider) {
  const w = await p.createWallet(OWNER);
  const pol = await p.attachPolicy(w, spec);
  return { w, s: await p.createDelegatedSigner(w, pol), pol };
}

for (const make of [() => new TurnkeyMock(), () => new CrossmintMock()]) {
  const name = make().name;
  test(`${name}: pipeline rejects transfer-out / over-cap / non-allowlisted BEFORE the provider`, async () => {
    const p = make();
    const { s } = await setup(p);
    for (const [tx, code] of [
      [buildTx(OWNER, [ix.transfer(OWNER, FOREIGN, 1_000n)]), "TRANSFER_TO_NON_OWNER"],
      [buildTx(OWNER, [ix.pumpBuy(OWNER, 1n, 60_000_000n)]), "OVER_CAP"],
      [buildTx(OWNER, [ix.memoV1(OWNER, "x")]), "PROGRAM_NOT_ALLOWED"],
    ] as const) {
      const r = await executeTrade(p, s, tx, policy, new MockSimulator());
      assert.equal(r.status, "rejected");
      assert.equal(r.rejectedBy, "presign");
      assert.ok(r.violations?.includes(code), `${code} in ${r.violations}`);
    }
    const good = await executeTrade(p, s, buildTx(OWNER, [ix.memo(OWNER, "ok")]), policy, new MockSimulator());
    assert.equal(good.status, "confirmed");
  });
  test(`${name}: revoked signer cannot sign; signer cannot export`, async () => {
    const p = make();
    const { s, w } = await setup(p);
    await p.revoke(s);
    const r = await p.signAndSend(s, buildTx(OWNER, [ix.memo(OWNER, "after revoke")]));
    assert.equal(r.status, "rejected");
    assert.equal((await p.exportCheck(w)).signerCanExport, false);
  });
}

test("provider-only floor: Turnkey mock blocks all three; Crossmint mock has no per-tx cap and no program allowlist", async () => {
  const tk = new TurnkeyMock();
  const cm = new CrossmintMock();
  const a = await setup(tk);
  const b = await setup(cm);
  const foreign = buildTx(OWNER, [ix.transfer(OWNER, FOREIGN, 1_000n)]);
  const overcap = buildTx(OWNER, [ix.transfer(OWNER, OWNER, 1n), ix.transfer(OWNER, OWNER, 60_000_000n)]);
  const program = buildTx(OWNER, [ix.memoV1(OWNER, "x")]);
  assert.equal((await tk.signAndSend(a.s, foreign)).status, "rejected");
  assert.equal((await tk.signAndSend(a.s, overcap)).status, "rejected");
  assert.equal((await tk.signAndSend(a.s, program)).status, "rejected");
  assert.equal((await cm.signAndSend(b.s, foreign)).status, "rejected");
  // Crossmint spendingLimit is CUMULATIVE per interval, not per tx: a 60M tx under a 50M per-tx cap passes the
  // provider while the 100M window has room, and only the next one is rejected.
  assert.equal((await cm.signAndSend(b.s, overcap)).status, "confirmed");
  assert.equal((await cm.signAndSend(b.s, overcap)).status, "rejected");
  assert.equal((await cm.signAndSend(b.s, program)).status, "confirmed"); // documented gap: no program allowlist
});

test("renderers produce the provider policy documents", () => {
  const t = renderTurnkeyPolicy(spec, "user-1", OWNER);
  assert.match(t.condition, /solana\.tx\.program_keys\.all/);
  assert.match(t.condition, /address_table_lookups\.count\(\) == 0/);
  assert.equal(t.effect, "EFFECT_ALLOW");
  assert.equal(lamportsToSol(100_000_000n), "0.1");
  assert.equal(lamportsToSol(1_500_000_000n), "1.5");
});
