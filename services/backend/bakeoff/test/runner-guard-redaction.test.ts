import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLatency, MIN_RUNS } from "../src/runner.ts";
import { TurnkeyMock } from "../src/providers/turnkey-mock.ts";
import { CrossmintMock } from "../src/providers/crossmint-mock.ts";
import { assertCrossmintStaging, assertDevnetConfig, NotDevnetError, verifyGenesis, MAINNET_GENESIS, DEVNET_GENESIS } from "../src/network-guard.ts";
import { CrossmintRest } from "../src/real/crossmint-rest.ts";
import { TurnkeyRest } from "../src/real/turnkey-rest.ts";
import { findLeaks, loadSecretsFile, redact, secretValues } from "../src/secrets.ts";

// Synthetic, obviously-fake values built at runtime so no key-shaped literal sits in the repo.
const FAKE_SK = ["sk", "staging", "FAKEFAKEFAKE0000"].join("_");
const FAKE_PROD = ["sk", "production", "FAKEFAKEFAKE0000"].join("_");
const devEnv = { SOLANA_CLUSTER: "devnet", SOLANA_RPC_URL: "https://api.devnet.solana.com", CROSSMINT_ENV: "staging", CROSSMINT_SERVER_API_KEY: FAKE_SK, BAKEOFF_LIVE: "1" };

test(`latency runner: >= ${MIN_RUNS} runs, p50/p95, outage fails closed then recovers`, async () => {
  await assert.rejects(runLatency(new TurnkeyMock(), 10), /at least 50/);
  for (const p of [new TurnkeyMock({ seed: 1, outage: { from: 20, to: 25 } }), new CrossmintMock({ seed: 2, outage: { from: 20, to: 25 } })]) {
    const s = await runLatency(p, 60, { from: 20, to: 25 });
    assert.equal(s.runs, 60);
    assert.equal(s.failed, 5);
    assert.equal(s.outage.failedClosed, 5);
    assert.equal(s.outage.recoveredAfter, 0);
    assert.equal(s.ok, 55);
    assert.ok(s.signP50 > 0 && s.signP95 >= s.signP50 && s.e2eP95 >= s.e2eP50);
  }
});

test("GUARD: refuses non-devnet cluster or RPC", () => {
  assert.doesNotThrow(() => assertDevnetConfig(devEnv));
  assert.throws(() => assertDevnetConfig({ ...devEnv, SOLANA_CLUSTER: "mainnet-beta" }), NotDevnetError);
  assert.throws(() => assertDevnetConfig({ ...devEnv, SOLANA_CLUSTER: undefined }), NotDevnetError);
  assert.throws(() => assertDevnetConfig({ ...devEnv, SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com" }), NotDevnetError);
  assert.throws(() => assertDevnetConfig({ ...devEnv, SOLANA_RPC_URL: "https://mainnet.helius-rpc.com/?x=1" }), NotDevnetError);
  assert.throws(() => assertDevnetConfig({ ...devEnv, SOLANA_RPC_URL: "https://api.testnet.solana.com" }), NotDevnetError);
  assert.throws(() => assertDevnetConfig({ ...devEnv, SOLANA_RPC_URL: "https://rpc.example.com" }), NotDevnetError);
  assert.throws(() => assertDevnetConfig({ ...devEnv, SOLANA_RPC_URL: "http://api.devnet.solana.com" }), NotDevnetError);
});

test("GUARD: refuses Crossmint unless staging env + staging host + staging key", () => {
  assert.doesNotThrow(() => assertCrossmintStaging(devEnv));
  assert.throws(() => assertCrossmintStaging({ ...devEnv, CROSSMINT_ENV: "production" }), NotDevnetError);
  assert.throws(() => assertCrossmintStaging({ ...devEnv, CROSSMINT_ENV: undefined }), NotDevnetError);
  assert.throws(() => assertCrossmintStaging({ ...devEnv, CROSSMINT_SERVER_API_KEY: FAKE_PROD }), NotDevnetError);
  assert.throws(() => assertCrossmintStaging({ ...devEnv, CROSSMINT_API_BASE_URL: "https://www.crossmint.com/api" }), NotDevnetError);
});

test("GUARD: real adapters refuse without BAKEOFF_LIVE, off devnet, or without Turnkey keys", () => {
  const kp = { label: "x", address: "x", privateKey: undefined as never };
  assert.throws(() => new CrossmintRest({ ...devEnv, BAKEOFF_LIVE: undefined }, kp, kp), /BAKEOFF_LIVE/);
  assert.throws(() => new CrossmintRest({ ...devEnv, SOLANA_CLUSTER: "mainnet-beta" }, kp, kp), NotDevnetError);
  assert.throws(() => new CrossmintRest({ ...devEnv, CROSSMINT_ENV: "production" }, kp, kp), NotDevnetError);
  assert.throws(() => new TurnkeyRest(devEnv), /TURNKEY_ORGANIZATION_ID/);
  assert.throws(() => new TurnkeyRest({ ...devEnv, SOLANA_CLUSTER: "mainnet-beta", TURNKEY_ORGANIZATION_ID: "o", TURNKEY_API_PUBLIC_KEY: "p", TURNKEY_API_PRIVATE_KEY: "q" }), NotDevnetError);
});

test("GUARD: genesis check rejects a mainnet RPC (fetch stubbed, no network)", async () => {
  const stub = (h: string) => (async () => new Response(JSON.stringify({ result: h }))) as unknown as typeof fetch;
  await assert.doesNotReject(verifyGenesis("https://api.devnet.solana.com", stub(DEVNET_GENESIS)));
  await assert.rejects(verifyGenesis("https://api.devnet.solana.com", stub(MAINNET_GENESIS)), NotDevnetError);
});

test("REDACTION: detects secret values and key-shaped tokens; redact() scrubs them", () => {
  const env = { CROSSMINT_SERVER_API_KEY: FAKE_SK, CROSSMINT_CLIENT_API_KEY: "client-secret-value-123", OTHER: "not-secret-value" };
  const secrets = secretValues(env);
  assert.equal(secrets.length, 2);
  assert.equal(findLeaks("all clean", "x", secrets).length, 0);
  assert.ok(findLeaks(`oops ${FAKE_SK}`, "x", secrets).some((l) => l.kind === "secret-value"));
  assert.ok(findLeaks("oops client-secret-value-123", "x", secrets).some((l) => l.kind === "secret-value"));
  assert.ok(findLeaks(`other ${["ck", "staging", "ABCDEFGH12345678"].join("_")}`, "x", []).some((l) => l.kind === "key-shape"));
  assert.equal(findLeaks("the sk_staging_ prefix is documented", "x", []).length, 0);
  const r = redact(`k=${FAKE_SK} c=client-secret-value-123`, secrets);
  assert.equal(findLeaks(r, "x", secrets).length, 0);
});

test("REDACTION: secrets file loader refuses group/world-readable files", () => {
  const d = mkdtempSync(join(tmpdir(), "bk-"));
  const f = join(d, "s.env");
  writeFileSync(f, `CROSSMINT_ENV=staging\nCROSSMINT_SERVER_API_KEY="${FAKE_SK}"\n`);
  chmodSync(f, 0o644);
  assert.throws(() => loadSecretsFile(f), /chmod 600/);
  chmodSync(f, 0o600);
  const v = loadSecretsFile(f);
  assert.equal(v.CROSSMINT_ENV, "staging");
  assert.equal(v.CROSSMINT_SERVER_API_KEY, FAKE_SK);
});
