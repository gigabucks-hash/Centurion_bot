// Crossmint MOCK: emulates documented signer-scope semantics (docs.crossmint.com/wallets/guides/signers/scopes):
// scopes are TRANSFER-ONLY (token, cumulative spendingLimit per interval, recipients whitelist, expiresAt).
// A signer with no scopes has full control. Non-transfer instructions are NOT restricted by the provider;
// `nonTransferPolicy` lets the live run correct this if Crossmint turns out stricter.
import { randomUUID } from "node:crypto";
import type { ExportCheck, PolicyRef, ProviderPolicySpec, SendResult, SignerProvider, SignerRef, WalletRef } from "../provider.ts";
import { decodeTransaction, fakeSignature, MockClock, topLevelTransfers, type MockOptions } from "./mock-common.ts";

export function renderCrossmintScopes(spec: ProviderPolicySpec, delegate: string) {
  return {
    signer: { type: "external-wallet", address: delegate },
    expiresAt: spec.expiresAt,
    scopes: [
      {
        type: "transfer",
        tokenLocator: "solana:sol",
        spendingLimit: spec.windowCapLamports === null ? undefined : { amount: lamportsToSol(spec.windowCapLamports), ...(spec.windowSeconds ? { interval: spec.windowSeconds } : {}) },
        recipients: spec.allowedRecipients,
      },
    ],
  };
}
export const lamportsToSol = (l: bigint): string => {
  const s = l.toString().padStart(10, "0");
  return `${s.slice(0, -9)}.${s.slice(-9)}`.replace(/\.?0+$/, "");
};

type Signer = { spec: ProviderPolicySpec | null; spent: bigint; revoked: boolean };

export class CrossmintMock implements SignerProvider {
  readonly name = "crossmint" as const;
  readonly live = false;
  private readonly clock: MockClock;
  private readonly specs = new Map<string, ProviderPolicySpec>();
  private readonly signers = new Map<string, Signer>();
  private readonly nonTransfer: "allow" | "deny";
  constructor(opts: MockOptions & { nonTransferPolicy?: "allow" | "deny" } = {}) {
    this.nonTransfer = opts.nonTransferPolicy ?? "allow";
    // No public Crossmint latency figure: placeholder medians (smart-wallet approval round trip + devnet confirm).
    this.clock = new MockClock(opts, { signMedianMs: 250, confirmMedianMs: 700, jitter: 0.4 });
  }
  async createWallet(owner: string): Promise<WalletRef> {
    return { provider: this.name, walletId: randomUUID(), address: `smart-${owner.slice(0, 8)}`, owner };
  }
  async attachPolicy(wallet: WalletRef, spec: ProviderPolicySpec): Promise<PolicyRef> {
    this.specs.set(wallet.walletId, spec);
    return { policyId: `scopes:${wallet.walletId}`, rendered: renderCrossmintScopes(spec, "<delegate>") };
  }
  async createDelegatedSigner(wallet: WalletRef): Promise<SignerRef> {
    const id = randomUUID();
    this.signers.set(id, { spec: this.specs.get(wallet.walletId) ?? null, spent: 0n, revoked: false });
    return { signerId: id, locator: `external-wallet:${id}`, wallet };
  }
  evaluate(signer: SignerRef, tx: Uint8Array): { allow: boolean; reason?: string; transfersOut: bigint } {
    const s = this.signers.get(signer.signerId);
    if (!s || s.revoked) return { allow: false, reason: "SIGNER_NOT_FOUND_OR_REMOVED", transfersOut: 0n };
    const m = decodeTransaction(tx);
    if (!s.spec) return { allow: true, transfersOut: 0n }; // no scopes = full control (documented)
    if (s.spec.expiresAt && Date.parse(s.spec.expiresAt) < Date.now()) return { allow: false, reason: "SIGNER_EXPIRED", transfersOut: 0n };
    const transfers = topLevelTransfers(m);
    let out = 0n;
    for (const t of transfers) {
      if (t.kind === "spl") return { allow: false, reason: "TOKEN_NOT_IN_SCOPE", transfersOut: 0n };
      if (s.spec.allowedRecipients.length > 0 && (!t.to || !s.spec.allowedRecipients.includes(t.to))) return { allow: false, reason: `RECIPIENT_NOT_WHITELISTED ${t.to}`, transfersOut: 0n };
      out += t.amount;
    }
    if (s.spec.windowCapLamports !== null && s.spent + out > s.spec.windowCapLamports) return { allow: false, reason: "SPENDING_LIMIT_EXCEEDED", transfersOut: out };
    const hasNonTransfer = m.instructions.length > transfers.length;
    if (hasNonTransfer && this.nonTransfer === "deny") return { allow: false, reason: "NON_TRANSFER_DENIED", transfersOut: 0n };
    return { allow: true, transfersOut: out };
  }
  async signAndSend(signer: SignerRef, tx: Uint8Array): Promise<SendResult> {
    const { down } = this.clock.next();
    const signMs = await this.clock.wait("sign");
    if (down) return { status: "failed", reason: "PROVIDER_UNAVAILABLE (mock 503)", signMs, totalMs: signMs };
    const v = this.evaluate(signer, tx);
    if (!v.allow) return { status: "rejected", rejectedBy: "provider", reason: v.reason, signMs, totalMs: signMs };
    this.signers.get(signer.signerId)!.spent += v.transfersOut;
    const confirmMs = await this.clock.wait("confirm");
    return { status: "confirmed", signature: fakeSignature(tx, signer.signerId), signMs, totalMs: signMs + confirmMs };
  }
  async revoke(signer: SignerRef): Promise<void> {
    const s = this.signers.get(signer.signerId);
    if (s) s.revoked = true;
  }
  async exportCheck(): Promise<ExportCheck> {
    return { signerCanExport: false, ownerCanExport: false, ownerHoldsKey: true, notes: "Smart wallet: the external-wallet recovery method (owner) already holds its own key; Crossmint key export exists only for email/phone signers." };
  }
}
