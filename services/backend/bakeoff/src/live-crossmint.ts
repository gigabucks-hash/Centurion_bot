// LIVE Crossmint bake-off: Crossmint STAGING + Solana DEVNET only. Devnet test keypairs only, no real funds.
// Run:  set -a; . /home/box/.secrets/sentra_bakeoff.env; set +a; SOLANA_CLUSTER=devnet BAKEOFF_LIVE=1 node src/live-crossmint.ts [--phase=...] [--runs=60]
// Every line printed goes through redact(); results/*.json is gitignored and redaction-checked.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CrossmintRest } from "./real/crossmint-rest.ts";
import { devnetRpc } from "./rpc.ts";
import { loadOrCreateKeypair, DEFAULT_STATE_DIR } from "./keys.ts";
import { redact, secretValues } from "./secrets.ts";
import { buildTx, ix } from "./txbuild.ts";
import { executeTrade } from "./pipeline.ts";
import { presign, type PresignPolicy, type Simulator } from "./presign.ts";
import { allowlistFor } from "./solana/programs.ts";
import { percentile, r1 } from "./stats.ts";
import type { SignerRef } from "./provider.ts";
import type { DevnetRpc } from "./rpc.ts";
import { b58encode } from "./solana/base58.ts";
import { decodeTransaction } from "./solana/message.ts";

function withFeePayer(tx: Uint8Array, payer: string): Uint8Array {
  const m = decodeTransaction(tx);
  const ixs = m.instructions.map((i) => ({ programId: i.programId, keys: i.accounts.map((a) => ({ pubkey: a.pubkey as string, isSigner: a.isSigner, isWritable: a.isWritable })), data: i.data }));
  return buildTx(payer, ixs, m.recentBlockhash);
}

const env = process.env;
const SECRETS = secretValues(env);
const log = (...a: unknown[]) => console.log(redact(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v)))).join(" "), SECRETS));
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const stateDir = env.BAKEOFF_STATE_DIR ?? DEFAULT_STATE_DIR;
const stateFile = join(stateDir, "crossmint-wallet.json");

/**
 * Real devnet simulation via RPC (sigVerify off, replaceRecentBlockhash).
 * Crossmint smart wallets are fee-sponsored: on chain, a Crossmint relayer pays and the smart-wallet program CPIs our
 * instructions, so the wallet PDA may hold 0 lamports / not exist. We therefore simulate OUR instructions with a funded
 * devnet fee payer substituted (sponsorFeePayer), and read the trading wallet's lamports delta.
 */
class RpcSimulator implements Simulator {
  readonly rpc: DevnetRpc;
  readonly sponsorFeePayer: string | null;
  constructor(rpc: DevnetRpc, sponsorFeePayer: string | null) {
    this.rpc = rpc;
    this.sponsorFeePayer = sponsorFeePayer;
  }
  async simulate(tx: Uint8Array, owner: string) {
    const simTx = this.sponsorFeePayer ? withFeePayer(tx, this.sponsorFeePayer) : tx;
    const r = await this.rpc.call<{ value: { err: unknown; logs?: string[]; accounts?: ({ lamports: number } | null)[] } }>("simulateTransaction", [
      Buffer.from(simTx).toString("base64"),
      { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed", accounts: { encoding: "base64", addresses: [owner] } },
    ]);
    const before = BigInt(await this.rpc.balance(owner).catch(() => 0));
    const after = r.value.accounts?.[0] ? BigInt(r.value.accounts[0].lamports) : before;
    return { err: r.value.err ? JSON.stringify(r.value.err) : null, ownerLamportsDelta: after - before, logs: r.value.logs };
  }
}

async function main() {
  const phase = arg("phase", "all");
  const runs = Number(arg("runs", "60"));
  const rpc = await devnetRpc(env); // devnet guard + genesis check
  const owner = loadOrCreateKeypair("crossmint-owner-recovery");
  const delegate = loadOrCreateKeypair("crossmint-delegate");
  const foreign = loadOrCreateKeypair("foreign-recipient");
  const cm = new CrossmintRest(env, owner, delegate); // staging guard
  const results: Record<string, unknown> = { startedAt: new Date().toISOString(), env: "crossmint-staging + solana-devnet", owner: owner.address, delegate: delegate.address, foreign: foreign.address };

  const perTxCap = 10_000_000n; // 0.01 SOL
  const spec = { allowedPrograms: allowlistFor("devnet").map((p) => p.id), perTxCapLamports: perTxCap, windowCapLamports: 20_000_000n, windowSeconds: 86400, allowedRecipients: [owner.address], expiresAt: new Date(Date.now() + 3 * 86400e3).toISOString() };

  let signer: SignerRef;
  if (existsSync(stateFile) && phase !== "setup") {
    signer = JSON.parse(readFileSync(stateFile, "utf8"));
    log("reusing wallet", signer.wallet.address);
  } else {
    const t0 = performance.now();
    const w = await cm.createWallet(owner.address);
    const pol = await cm.attachPolicy(w, spec);
    signer = await cm.createDelegatedSigner(w, pol);
    results.setup = { ms: r1(performance.now() - t0), wallet: signer.wallet.address, scopes: pol.rendered };
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    writeFileSync(stateFile, JSON.stringify(signer), { mode: 0o600 });
    log("created smart wallet", signer.wallet.address, "in", r1(performance.now() - t0), "ms");
    log("wallet", await cm.getWallet(signer.wallet.address));
  }
  const W = signer.wallet.address;
  const policy: PresignPolicy = { cluster: "devnet", owner: W, ownedAccounts: [], perTxCapLamports: perTxCap, maxCuPriceMicroLamports: 200_000n };
  // Funded devnet account used only as the simulated fee payer (never signs anything). Default: the Crossmint
  // staging relayer observed paying fees for our wallet in the probe (results/*.json). Override with BAKEOFF_SIM_FEE_PAYER.
  const sim = new RpcSimulator(rpc, env.BAKEOFF_SIM_FEE_PAYER ?? "34U6iAJmsmRUmodCbbqvSWKP46mjk49q7ykjdpW6dVeQ");

  if (phase === "setup") return finish(results);

  if (phase === "probe" || phase === "all") {
    const bh = await rpc.latestBlockhash();
    const tx = buildTx(W, [ix.memo(W, "sentra-bakeoff probe")], bh);
    const pv = await presign(tx, policy, sim);
    log("presign probe", { ok: pv.ok, violations: pv.violations, sim: pv.simulatedSpendLamports });
    const r = await cm.signAndSend(signer, tx);
    log("probe send", r);
    results.probe = { presign: pv.ok, send: r };
  }

  if (phase === "latency" || phase === "all") {
    const sign: number[] = [], e2e: number[] = [], fails: string[] = [];
    let ok = 0;
    for (let i = 0; i < runs; i++) {
      const bh = await rpc.latestBlockhash();
      const tx = buildTx(W, [ix.memo(W, `sentra-bakeoff ${i} ${Date.now()}`)], bh);
      const r = await executeTrade(cm, signer, tx, policy, sim);
      if (r.status === "confirmed") {
        ok++;
        sign.push(r.signMs);
        e2e.push(r.totalMs);
      } else fails.push(`${i}:${r.status}:${(r.reason ?? "").slice(0, 160)}`);
      if (i % 10 === 9) log(`latency ${i + 1}/${runs} ok=${ok}`);
    }
    results.latency = { runs, ok, failed: runs - ok, signP50: r1(percentile(sign, 50)), signP95: r1(percentile(sign, 95)), e2eP50: r1(percentile(e2e, 50)), e2eP95: r1(percentile(e2e, 95)), fails: fails.slice(0, 10) };
    log("latency", results.latency);
  }

  if (phase === "negatives" || phase === "all") {
    const bal = await rpc.balance(W).catch(() => 0);
    log("wallet balance (lamports)", bal);
    const bh = await rpc.latestBlockhash();
    const cases = {
      transfer_to_foreign: buildTx(W, [ix.transfer(W, foreign.address, 1_000n)], bh),
      over_cap_to_owner: buildTx(W, [ix.transfer(W, owner.address, 25_000_000n)], bh),
      non_allowlisted_program: buildTx(W, [ix.memoV1(W, "not allowlisted")], bh),
      // pump.fun buy with max_sol_cost 0.025 SOL > 0.01 cap: our layer must say OVER_CAP. The provider-only leg fails
      // on chain anyway (placeholder accounts), so it shows only that Crossmint has no per-tx swap cap of its own.
      over_cap_pump_buy: buildTx(W, [ix.pumpBuy(W, 1_000n, 25_000_000n)], bh),
    };
    const neg: Record<string, unknown> = {};
    for (const [name, tx] of Object.entries(cases)) {
      const pipeline = await executeTrade(cm, signer, tx, policy, sim); // ours first: must reject
      const providerOnly = await cm.signAndSend(signer, tx); // vendor floor, measured on purpose
      neg[name] = { pipeline: { status: pipeline.status, by: pipeline.rejectedBy, reason: pipeline.reason }, providerOnly: { status: providerOnly.status, reason: (providerOnly.reason ?? "").slice(0, 300), sig: providerOnly.signature } };
      log("negative", name, neg[name]);
    }
    results.negatives = { walletBalanceLamports: bal, cases: neg };
  }

  if (phase === "outage" || phase === "all") {
    // Can't take Crossmint down; emulate a hung/unreachable provider with a 1 ms timeout and verify fail-closed.
    const saved = cm.timeoutMs;
    cm.timeoutMs = 1;
    const bh = await rpc.latestBlockhash();
    const outs: unknown[] = [];
    for (let i = 0; i < 5; i++) outs.push(await executeTrade(cm, signer, buildTx(W, [ix.memo(W, `outage ${i}`)], bh), policy, sim));
    cm.timeoutMs = saved;
    const after = await executeTrade(cm, signer, buildTx(W, [ix.memo(W, "recovery")], await rpc.latestBlockhash()), policy, sim);
    results.outage = { induced: outs.map((o) => ({ status: (o as { status: string }).status, signature: (o as { signature?: string }).signature ?? null })), recovery: { status: after.status, totalMs: r1(after.totalMs) } };
    log("outage", results.outage);
  }

  if (phase === "escalation" || phase === "all") {
    results.escalation = await cm.escalationProbe(signer, foreign.address);
    log("escalation", results.escalation);
  }

  if (phase === "revoke" || phase === "all") {
    const t0 = performance.now();
    let revokeErr: string | null = null;
    try {
      await cm.revoke(signer);
    } catch (e) {
      revokeErr = (e as Error).message;
    }
    const revokeMs = r1(performance.now() - t0);
    const after = await cm.signAndSend(signer, buildTx(W, [ix.memo(W, "after revoke")], await rpc.latestBlockhash()));
    results.revoke = { revokeMs, revokeErr, signAfterRevoke: { status: after.status, reason: (after.reason ?? "").slice(0, 300) }, export: await cm.exportCheck() };
    log("revoke", results.revoke);
  }
  finish(results);
}

function finish(results: Record<string, unknown>) {
  mkdirSync("results", { recursive: true });
  const f = `results/live-crossmint-${Date.now()}.json`;
  writeFileSync(f, redact(JSON.stringify(results, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2), SECRETS));
  log("wrote", f);
}

main().catch((e) => {
  log("FATAL", String((e as Error).message ?? e));
  process.exit(1);
});
void b58encode;
