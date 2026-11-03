// Latency / outage runner. Mocks by default; ≥50 runs enforced. Real providers via live-crossmint.ts.
// Usage: node src/runner.ts --provider=all|turnkey|crossmint --runs=60 [--real-sleep]
import { writeFileSync, mkdirSync } from "node:fs";
import { MockSimulator, type PresignPolicy } from "./presign.ts";
import { executeTrade } from "./pipeline.ts";
import type { SignerProvider } from "./provider.ts";
import { TurnkeyMock } from "./providers/turnkey-mock.ts";
import { CrossmintMock } from "./providers/crossmint-mock.ts";
import { addr, buildTx, ix } from "./txbuild.ts";
import { percentile, r1 } from "./stats.ts";
import { allowlistFor } from "./solana/programs.ts";

export const MIN_RUNS = 50;
const OWNER = addr("bakeoff-owner");

export type RunSummary = { provider: string; mode: "mock" | "live"; runs: number; ok: number; failed: number; rejected: number; signP50: number; signP95: number; e2eP50: number; e2eP95: number; outage: { injected: number; failedClosed: number; recoveredAfter: number | null } };

export async function runLatency(p: SignerProvider, runs: number, outage?: { from: number; to: number }): Promise<RunSummary> {
  if (runs < MIN_RUNS) throw new Error(`need at least ${MIN_RUNS} runs`);
  const policy: PresignPolicy = { cluster: "devnet", owner: OWNER, ownedAccounts: [], perTxCapLamports: 50_000_000n, maxCuPriceMicroLamports: 200_000n };
  const w = await p.createWallet(OWNER);
  const pol = await p.attachPolicy(w, { allowedPrograms: allowlistFor("devnet").map((x) => x.id), perTxCapLamports: policy.perTxCapLamports, windowCapLamports: 500_000_000n, windowSeconds: 86400, allowedRecipients: [OWNER], expiresAt: null });
  const s = await p.createDelegatedSigner(w, pol);
  const sign: number[] = [], e2e: number[] = [];
  let ok = 0, failed = 0, rejected = 0, failedClosed = 0, recoveredAfter: number | null = null;
  for (let i = 0; i < runs; i++) {
    const tx = buildTx(OWNER, [ix.cuPrice(1000n), ix.memo(OWNER, `centurion-bakeoff ${i}`)]);
    const r = await executeTrade(p, s, tx, policy, new MockSimulator());
    if (r.status === "confirmed") {
      ok++;
      sign.push(r.signMs);
      e2e.push(r.totalMs);
      if (outage && i >= outage.to && recoveredAfter === null) recoveredAfter = i - outage.to;
    } else if (r.status === "failed") {
      failed++;
      if (!r.signature) failedClosed++;
    } else rejected++;
  }
  return { provider: p.name, mode: p.live ? "live" : "mock", runs, ok, failed, rejected, signP50: r1(percentile(sign, 50)), signP95: r1(percentile(sign, 95)), e2eP50: r1(percentile(e2e, 50)), e2eP95: r1(percentile(e2e, 95)), outage: { injected: outage ? outage.to - outage.from : 0, failedClosed, recoveredAfter } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
  const runs = Number(arg("runs", "60"));
  const which = arg("provider", "all");
  const realSleep = process.argv.includes("--real-sleep");
  const outage = { from: 20, to: 25 };
  const out: RunSummary[] = [];
  if (which === "all" || which === "turnkey") out.push(await runLatency(new TurnkeyMock({ seed: 1, outage, realSleep }), runs, outage));
  if (which === "all" || which === "crossmint") out.push(await runLatency(new CrossmintMock({ seed: 2, outage, realSleep }), runs, outage));
  console.table(out.map((o) => ({ ...o, outage: JSON.stringify(o.outage) })));
  mkdirSync("results", { recursive: true });
  writeFileSync(`results/mock-${Date.now()}.json`, JSON.stringify(out, null, 2));
}
