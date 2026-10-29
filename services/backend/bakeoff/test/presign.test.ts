import { test } from "node:test";
import assert from "node:assert/strict";
import { MockSimulator, presign, staticCheck, type PresignPolicy } from "../src/presign.ts";
import { addr, buildTx, ix } from "../src/txbuild.ts";
import { anchorDisc, JUPITER_V6, MEMO_V1, PUMP_IX, allowlistFor, RAYDIUM_DEVNET } from "../src/solana/programs.ts";
import { decodeTransaction } from "../src/solana/message.ts";
import { b58decode, b58encode } from "../src/solana/base58.ts";

const OWNER = addr("owner");
const OWN_ATA = addr("owner-wsol-ata");
const FOREIGN = addr("attacker");
const policy: PresignPolicy = { cluster: "devnet", owner: OWNER, ownedAccounts: [OWN_ATA], perTxCapLamports: 50_000_000n, maxCuPriceMicroLamports: 200_000n };
const codes = (v: { violations: { code: string }[] }) => v.violations.map((x) => x.code);

test("base58 round trip and message codec", () => {
  const b = new Uint8Array([0, 0, 1, 2, 255]);
  assert.deepEqual(b58decode(b58encode(b)), b);
  const tx = buildTx(OWNER, [ix.memo(OWNER, "hi"), ix.transfer(OWNER, OWN_ATA, 5n)]);
  const m = decodeTransaction(tx);
  assert.equal(m.staticKeys[0], OWNER);
  assert.equal(m.instructions.length, 2);
  assert.equal(m.instructions[1].accounts[1].pubkey, OWN_ATA);
  assert.equal(m.instructions[1].accounts[1].isWritable, true);
});

test("allowed: memo + compute price + wrap into own ATA within cap", async () => {
  const tx = buildTx(OWNER, [ix.cuPrice(1000n), ix.transfer(OWNER, OWN_ATA, 10_000_000n), ix.memo(OWNER, "ok")]);
  const v = await presign(tx, policy, new MockSimulator());
  assert.equal(v.ok, true, JSON.stringify(codes(v)));
});

test("NEGATIVE: SOL transfer to a foreign address is rejected", async () => {
  const v = await presign(buildTx(OWNER, [ix.transfer(OWNER, FOREIGN, 1_000n)]), policy, new MockSimulator());
  assert.equal(v.ok, false);
  assert.ok(codes(v).includes("TRANSFER_TO_NON_OWNER"));
});

test("NEGATIVE: SPL transfer to a foreign token account is rejected", () => {
  const v = staticCheck(buildTx(OWNER, [ix.splTransfer(OWN_ATA, FOREIGN, OWNER, 1n)]), policy);
  assert.ok(codes(v).includes("TRANSFER_TO_NON_OWNER"));
});

test("NEGATIVE: token Approve (delegation) is rejected", () => {
  assert.ok(codes(staticCheck(buildTx(OWNER, [ix.approve(OWN_ATA, FOREIGN, OWNER, 1n)]), policy)).includes("TOKEN_APPROVE_DENIED"));
});

test("NEGATIVE: over-cap is rejected (static: pump buy max_sol_cost)", async () => {
  const v = await presign(buildTx(OWNER, [ix.pumpBuy(OWNER, 1000n, 60_000_000n)]), policy, new MockSimulator());
  assert.ok(codes(v).includes("OVER_CAP"));
});

test("NEGATIVE: over-cap caught by simulation even when static parse sees nothing (CPI outflow)", async () => {
  const v = await presign(buildTx(OWNER, [ix.memo(OWNER, "innocent")]), policy, new MockSimulator({ extraOutflow: 80_000_000n }));
  assert.equal(v.ok, false);
  assert.ok(codes(v).includes("OVER_CAP"));
});

test("NEGATIVE: non-allowlisted program is rejected", () => {
  assert.ok(codes(staticCheck(buildTx(OWNER, [ix.memoV1(OWNER, "x")]), policy)).includes("PROGRAM_NOT_ALLOWED"));
});

test("NEGATIVE: Jupiter is not allowlisted on devnet (not deployed there)", () => {
  assert.ok(!allowlistFor("devnet").some((p) => p.id === JUPITER_V6));
  assert.ok(allowlistFor("mainnet").some((p) => p.id === JUPITER_V6));
  assert.ok(allowlistFor("devnet").some((p) => p.id === RAYDIUM_DEVNET.CPMM));
  assert.ok(!allowlistFor("devnet").some((p) => p.id === MEMO_V1));
});

test("NEGATIVE: foreign fee payer, CU price over cap, simulation failure/outage fail closed", async () => {
  assert.ok(codes(staticCheck(buildTx(FOREIGN, [ix.memo(FOREIGN, "x")]), policy)).includes("FEE_PAYER_NOT_OWNER"));
  assert.ok(codes(staticCheck(buildTx(OWNER, [ix.cuPrice(10_000_000n)]), policy)).includes("CU_PRICE_OVER_CAP"));
  const ok = buildTx(OWNER, [ix.memo(OWNER, "x")]);
  assert.ok(codes(await presign(ok, policy, new MockSimulator({ fail: "InstructionError" }))).includes("SIMULATION_FAILED"));
  assert.ok(codes(await presign(ok, policy, new MockSimulator({ down: true }))).includes("SIMULATION_UNAVAILABLE"));
  assert.ok(codes(staticCheck(new Uint8Array([1, 2, 3]), policy)).includes("DECODE_FAILED"));
});

test("pump.fun discriminators match the Anchor derivation", () => {
  for (const [hex, { name }] of Object.entries(PUMP_IX)) assert.equal(anchorDisc(name), hex, name);
});
