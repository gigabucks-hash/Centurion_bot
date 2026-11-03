// Turnkey MOCK: emulates the documented policy-engine semantics (docs.turnkey.com/features/policies/language):
// default deny; ALLOW only if every condition clause evaluates true; transfers are TOP-LEVEL only;
// ALT-resolved accounts appear as 'ADDRESS_TABLE_LOOKUP'; programs from ALTs are rejected outright.
import { randomUUID } from "node:crypto";
import type { ExportCheck, PolicyRef, ProviderPolicySpec, SendResult, SignerProvider, SignerRef, WalletRef } from "../provider.ts";
import { decodeTransaction, fakeSignature, MockClock, topLevelTransfers, type MockOptions } from "./mock-common.ts";

/** Render the real Turnkey policy we would create (CREATE_POLICY_V3 parameters). */
export function renderTurnkeyPolicy(spec: ProviderPolicySpec, delegatedUserId: string, walletAddress: string) {
  const list = (xs: string[]) => `[${xs.map((x) => `'${x}'`).join(", ")}]`;
  const condition = [
    "activity.kind == 'SIGN_TRANSACTION'",
    "activity.params.type == 'TRANSACTION_TYPE_SOLANA'",
    `wallet_account.address == '${walletAddress}'`,
    "solana.tx.address_table_lookups.count() == 0",
    `solana.tx.program_keys.all(p, p in ${list(spec.allowedPrograms)})`,
    `solana.tx.transfers.all(t, t.to in ${list(spec.allowedRecipients)} && t.amount <= ${spec.perTxCapLamports})`,
    `solana.tx.spl_transfers.all(t, t.to in ${list(spec.allowedRecipients)})`,
  ].join(" && ");
  return {
    policyName: `centurion-bakeoff-swap-only-${walletAddress.slice(0, 6)}`,
    effect: "EFFECT_ALLOW",
    consensus: `approvers.any(user, user.id == '${delegatedUserId}')`,
    condition,
    notes: "Centurion bake-off: delegated swap-only signer, devnet. Daily cap is enforced by Centurion (no native counter).",
  };
}

type State = { spec?: ProviderPolicySpec; revoked: Set<string>; exportedBy: Set<string> };

export class TurnkeyMock implements SignerProvider {
  readonly name = "turnkey" as const;
  readonly live = false;
  private readonly clock: MockClock;
  private readonly st = new Map<string, State>();
  constructor(opts: MockOptions = {}) {
    // Medians from Turnkey's own "sub-100ms" claim + a devnet confirm; replaced by measurements on the live run.
    this.clock = new MockClock(opts, { signMedianMs: 90, confirmMedianMs: 450, jitter: 0.35 });
  }
  async createWallet(owner: string): Promise<WalletRef> {
    const w = { provider: this.name, walletId: randomUUID(), address: owner, owner };
    this.st.set(w.walletId, { revoked: new Set(), exportedBy: new Set() });
    return w;
  }
  async attachPolicy(wallet: WalletRef, spec: ProviderPolicySpec): Promise<PolicyRef> {
    this.st.get(wallet.walletId)!.spec = spec;
    return { policyId: randomUUID(), rendered: renderTurnkeyPolicy(spec, "<delegated-user-id>", wallet.address) };
  }
  async createDelegatedSigner(wallet: WalletRef): Promise<SignerRef> {
    const id = randomUUID();
    return { signerId: id, locator: `api-key:${id}`, wallet };
  }
  /** Pure policy evaluation (exported for tests). */
  evaluate(wallet: WalletRef, signer: SignerRef, tx: Uint8Array): { allow: boolean; reason?: string } {
    const s = this.st.get(wallet.walletId);
    if (!s?.spec) return { allow: false, reason: "NO_POLICY (default deny)" };
    if (s.revoked.has(signer.signerId)) return { allow: false, reason: "API_KEY_DELETED" };
    let m;
    try {
      m = decodeTransaction(tx);
    } catch (e) {
      return { allow: false, reason: `PARSE_FAILED: ${(e as Error).message}` };
    }
    if (m.addressTableLookups.length > 0) return { allow: false, reason: "ALT_PRESENT" };
    const progs = new Set(m.instructions.map((i) => i.programId));
    for (const p of progs) if (!s.spec.allowedPrograms.includes(p)) return { allow: false, reason: `PROGRAM_NOT_ALLOWED ${p}` };
    for (const t of topLevelTransfers(m)) {
      if (!t.to || !s.spec.allowedRecipients.includes(t.to)) return { allow: false, reason: `RECIPIENT_NOT_ALLOWED ${t.to}` };
      if (t.kind === "sol" && t.amount > s.spec.perTxCapLamports) return { allow: false, reason: `AMOUNT_OVER_CAP ${t.amount}` };
    }
    return { allow: true };
  }
  async signAndSend(signer: SignerRef, tx: Uint8Array): Promise<SendResult> {
    const { down } = this.clock.next();
    const signMs = await this.clock.wait("sign");
    if (down) return { status: "failed", reason: "PROVIDER_UNAVAILABLE (mock 503)", signMs, totalMs: signMs };
    const v = this.evaluate(signer.wallet, signer, tx);
    if (!v.allow) return { status: "rejected", rejectedBy: "provider", reason: v.reason, signMs, totalMs: signMs };
    const confirmMs = await this.clock.wait("confirm");
    return { status: "confirmed", signature: fakeSignature(tx, signer.signerId), signMs, totalMs: signMs + confirmMs };
  }
  async revoke(signer: SignerRef): Promise<void> {
    this.st.get(signer.wallet.walletId)?.revoked.add(signer.signerId);
  }
  async exportCheck(): Promise<ExportCheck> {
    return { signerCanExport: false, ownerCanExport: true, ownerHoldsKey: false, notes: "EXPORT_WALLET allowed only for the root (owner) user; the delegated API-only user has no export policy." };
  }
}
