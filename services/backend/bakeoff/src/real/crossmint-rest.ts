// Crossmint REAL adapter over the REST API (no SDK: the SDK ships telemetry, see BAKEOFF_REVIEW §2.3).
// STAGING + SOLANA DEVNET ONLY. Network calls require BAKEOFF_LIVE=1 and pass assertCrossmintStaging().
import type { ExportCheck, PolicyRef, ProviderPolicySpec, SendResult, SignerProvider, SignerRef, WalletRef } from "../provider.ts";
import { assertCrossmintStaging, assertDevnetConfig } from "../network-guard.ts";
import { renderCrossmintScopes } from "../providers/crossmint-mock.ts";
import { b58decode, b58encode } from "../solana/base58.ts";
import { signBytes, type DevKeypair } from "../keys.ts";
import { redact, secretValues } from "../secrets.ts";

const API = "/2025-06-09";
type Tx = { id: string; status: "awaiting-approval" | "pending" | "success" | "failed"; approvals?: { pending?: { signer: { locator?: string } | string; message: string }[] }; onChain?: { txId?: string }; error?: unknown };

export class CrossmintHttpError extends Error {
  readonly status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export class CrossmintRest implements SignerProvider {
  readonly name = "crossmint" as const;
  readonly live = true;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secrets: string[];
  private readonly owner: DevKeypair;
  private readonly delegate: DevKeypair;
  private readonly specs = new Map<string, ProviderPolicySpec>();
  timeoutMs = 20000;
  pollMs = 250;

  constructor(env: Record<string, string | undefined>, owner: DevKeypair, delegate: DevKeypair) {
    if (env.BAKEOFF_LIVE !== "1") throw new Error("CrossmintRest requires BAKEOFF_LIVE=1");
    assertDevnetConfig(env);
    const { baseUrl, apiKey } = assertCrossmintStaging(env);
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.secrets = secretValues(env);
    this.owner = owner;
    this.delegate = delegate;
  }

  private async http<T>(method: string, path: string, body?: unknown): Promise<T> {
    const ctl = AbortSignal.timeout(this.timeoutMs);
    const r = await fetch(this.baseUrl + API + path, {
      method,
      signal: ctl,
      headers: { "X-API-KEY": this.apiKey, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) throw new CrossmintHttpError(r.status, `${method} ${path} -> ${r.status}: ${redact(text, this.secrets).slice(0, 600)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async createWallet(owner: string): Promise<WalletRef> {
    // Deferred: Crossmint registers scoped signers atomically at wallet creation (no extra approval).
    return { provider: this.name, walletId: "", address: "", owner };
  }
  async attachPolicy(wallet: WalletRef, spec: ProviderPolicySpec): Promise<PolicyRef> {
    this.specs.set(wallet.owner, spec);
    return { policyId: `scopes:${wallet.owner}`, rendered: renderCrossmintScopes(spec, this.delegate.address) };
  }
  async createDelegatedSigner(wallet: WalletRef): Promise<SignerRef> {
    const spec = this.specs.get(wallet.owner);
    if (!spec) throw new Error("attachPolicy first: Crossmint signer without scopes has FULL control");
    const scoped = renderCrossmintScopes(spec, this.delegate.address);
    const w = await this.http<{ address: string }>("POST", "/wallets", {
      chainType: "solana",
      type: "smart",
      config: {
        recoveryMethods: [{ type: "external-wallet", address: this.owner.address }],
        delegatedSigners: [scoped],
      },
    });
    wallet.address = w.address;
    wallet.walletId = w.address;
    return { signerId: this.delegate.address, locator: `external-wallet:${this.delegate.address}`, wallet };
  }
  async getWallet(address: string): Promise<unknown> {
    return this.http("GET", `/wallets/${address}`);
  }

  private async approveAll(wallet: string, tx: Tx, kp: DevKeypair): Promise<Tx> {
    const pend = tx.approvals?.pending ?? [];
    if (pend.length === 0) return tx;
    const approvals = pend.map((p) => ({ signer: `external-wallet:${kp.address}`, signature: b58encode(signBytes(kp, b58decode(p.message))) }));
    return this.http<Tx>("POST", `/wallets/${wallet}/transactions/${tx.id}/approvals`, { approvals });
  }
  private async waitFinal(wallet: string, tx: Tx): Promise<Tx> {
    const deadline = performance.now() + 60000;
    let t = tx;
    while (t.status !== "success" && t.status !== "failed") {
      if (performance.now() > deadline) throw new Error(`transaction ${t.id} not final after 60s (status ${t.status})`);
      await new Promise((r) => setTimeout(r, this.pollMs));
      t = await this.http<Tx>("GET", `/wallets/${wallet}/transactions/${t.id}`);
    }
    return t;
  }

  /** Provider-side only. Use executeTrade() for the sanctioned path; probes call this directly on purpose. */
  async signAndSend(signer: SignerRef, unsignedTx: Uint8Array): Promise<SendResult> {
    const t0 = performance.now();
    let tx: Tx;
    try {
      tx = await this.http<Tx>("POST", `/wallets/${signer.wallet.address}/transactions`, { params: { transaction: b58encode(unsignedTx), signer: signer.locator } });
      tx = await this.approveAll(signer.wallet.address, tx, this.delegate);
    } catch (e) {
      const ms = performance.now() - t0;
      if (e instanceof CrossmintHttpError && e.status >= 400 && e.status < 500) return { status: "rejected", rejectedBy: "provider", reason: e.message, signMs: ms, totalMs: ms };
      return { status: "failed", reason: String((e as Error).message), signMs: ms, totalMs: ms };
    }
    const signMs = performance.now() - t0;
    try {
      const fin = await this.waitFinal(signer.wallet.address, tx);
      const totalMs = performance.now() - t0;
      if (fin.status === "failed") return { status: "rejected", rejectedBy: "provider", reason: `onchain/validation failed: ${redact(JSON.stringify(fin.error ?? {}), this.secrets).slice(0, 400)}`, signMs, totalMs };
      return { status: "confirmed", signature: fin.onChain?.txId, signMs, totalMs };
    } catch (e) {
      return { status: "failed", reason: String((e as Error).message), signMs, totalMs: performance.now() - t0 };
    }
  }

  /** Remove the delegated signer; Crossmint requires the recovery method (owner) to approve. */
  async revoke(signer: SignerRef): Promise<void> {
    const w = signer.wallet.address;
    const r = await this.http<Tx & { transaction?: Tx }>("DELETE", `/wallets/${w}/signers/${signer.locator}`);
    const tx = (r.transaction ?? r) as Tx;
    if (tx?.id) await this.waitFinal(w, await this.approveAll(w, tx, this.owner));
  }

  async exportCheck(): Promise<ExportCheck> {
    return { signerCanExport: false, ownerCanExport: false, ownerHoldsKey: true, notes: "External-wallet recovery: owner holds its own key; Crossmint export exists only for email/phone signers (docs)." };
  }
}
