// Provider-agnostic signer interface for the bake-off. Mocks and real adapters both implement it.
export type ProviderName = "turnkey" | "crossmint";

export type WalletRef = { provider: ProviderName; walletId: string; address: string; owner: string };
export type ProviderPolicySpec = {
  /** Programs the delegated signer may touch (provider-side floor; Crossmint cannot express this). */
  allowedPrograms: string[];
  perTxCapLamports: bigint;
  /** Cumulative cap per interval (Crossmint spendingLimit semantics); null = none. */
  windowCapLamports: bigint | null;
  windowSeconds: number | null;
  /** Only these addresses may receive SOL/SPL transfers. */
  allowedRecipients: string[];
  expiresAt: string | null;
};
export type PolicyRef = { policyId: string; rendered: unknown };
export type SignerRef = { signerId: string; locator: string; wallet: WalletRef };
export type SendResult = {
  status: "confirmed" | "rejected" | "failed";
  signature?: string;
  rejectedBy?: "presign" | "provider";
  reason?: string;
  signMs: number;
  totalMs: number;
};
export type ExportCheck = { signerCanExport: boolean; ownerCanExport: boolean; ownerHoldsKey: boolean; notes: string };

export interface SignerProvider {
  readonly name: ProviderName;
  readonly live: boolean;
  createWallet(owner: string): Promise<WalletRef>;
  attachPolicy(wallet: WalletRef, spec: ProviderPolicySpec): Promise<PolicyRef>;
  createDelegatedSigner(wallet: WalletRef, policy: PolicyRef): Promise<SignerRef>;
  /** Provider-side only; Sentra's pre-sign runs before this in executeTrade(). */
  signAndSend(signer: SignerRef, unsignedTx: Uint8Array): Promise<SendResult>;
  revoke(signer: SignerRef): Promise<void>;
  exportCheck(wallet: WalletRef): Promise<ExportCheck>;
}

export class ProviderRejected extends Error {
  readonly code: string;
  constructor(code: string, msg: string) {
    super(msg);
    this.code = code;
  }
}
