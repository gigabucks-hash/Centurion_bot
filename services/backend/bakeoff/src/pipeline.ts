// The only sanctioned path to a signature: pre-sign (ours) THEN the provider. Never the provider alone.
import { presign, type PresignPolicy, type Simulator } from "./presign.ts";
import type { SendResult, SignerProvider, SignerRef } from "./provider.ts";

export async function executeTrade(p: SignerProvider, signer: SignerRef, tx: Uint8Array, policy: PresignPolicy, sim: Simulator): Promise<SendResult & { violations?: string[] }> {
  const t0 = performance.now();
  const v = await presign(tx, policy, sim);
  if (!v.ok) {
    return { status: "rejected", rejectedBy: "presign", reason: v.violations.map((x) => x.code).join(","), violations: v.violations.map((x) => x.code), signMs: 0, totalMs: performance.now() - t0 };
  }
  return p.signAndSend(signer, tx);
}
