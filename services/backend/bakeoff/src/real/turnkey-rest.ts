// Turnkey REAL adapter over the REST API, stamped with @turnkey/api-key-stamper@0.6.18 (the only provider package
// installed; see BAKEOFF_REVIEW §0). Wired but NOT exercised until TURNKEY_* vars exist and BAKEOFF_LIVE=1.
// Turnkey keys are not cluster-scoped: devnet is enforced by the RPC guard + a devnet blockhash in every message.
import type { ExportCheck, PolicyRef, ProviderPolicySpec, SendResult, SignerProvider, SignerRef, WalletRef } from "../provider.ts";
import { assertDevnetConfig } from "../network-guard.ts";
import { renderTurnkeyPolicy } from "../providers/turnkey-mock.ts";
import { redact, secretValues } from "../secrets.ts";

export const TURNKEY_ENV = ["TURNKEY_ORGANIZATION_ID", "TURNKEY_API_PUBLIC_KEY", "TURNKEY_API_PRIVATE_KEY"] as const;

export function turnkeyConfigured(env: Record<string, string | undefined>): boolean {
  return TURNKEY_ENV.every((k) => !!env[k]);
}

export class TurnkeyRest implements SignerProvider {
  readonly name = "turnkey" as const;
  readonly live = true;
  private readonly base: string;
  private readonly org: string;
  private readonly env: Record<string, string | undefined>;
  private readonly secrets: string[];
  private readonly rpcUrl: string;

  constructor(env: Record<string, string | undefined>) {
    if (env.BAKEOFF_LIVE !== "1") throw new Error("TurnkeyRest requires BAKEOFF_LIVE=1");
    if (!turnkeyConfigured(env)) throw new Error(`TurnkeyRest needs ${TURNKEY_ENV.join(", ")}`);
    this.rpcUrl = assertDevnetConfig(env).rpcUrl;
    this.base = env.TURNKEY_API_BASE_URL ?? "https://api.turnkey.com";
    if (new URL(this.base).hostname !== "api.turnkey.com") throw new Error("unexpected Turnkey API host");
    this.org = env.TURNKEY_ORGANIZATION_ID as string;
    this.env = env;
    this.secrets = secretValues(env);
  }

  private async submit<T>(path: string, type: string, parameters: unknown): Promise<T> {
    const { ApiKeyStamper } = await import("@turnkey/api-key-stamper");
    const stamper = new ApiKeyStamper({ apiPublicKey: this.env.TURNKEY_API_PUBLIC_KEY as string, apiPrivateKey: this.env.TURNKEY_API_PRIVATE_KEY as string });
    const body = JSON.stringify({ type, timestampMs: String(Date.now()), organizationId: this.org, parameters });
    const stamp = await stamper.stamp(body);
    const r = await fetch(`${this.base}/public/v1/submit/${path}`, { method: "POST", body, headers: { "content-type": "application/json", [stamp.stampHeaderName]: stamp.stampHeaderValue }, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    if (!r.ok) throw new Error(`turnkey ${path} -> ${r.status}: ${redact(text, this.secrets).slice(0, 600)}`);
    return JSON.parse(text) as T;
  }

  async createWallet(owner: string): Promise<WalletRef> {
    const r = await this.submit<{ activity: { result: { createWalletResult: { walletId: string; addresses: string[] } } } }>("create_wallet", "ACTIVITY_TYPE_CREATE_WALLET", {
      walletName: `sentra-bakeoff-${Date.now()}`,
      accounts: [{ curve: "CURVE_ED25519", pathFormat: "PATH_FORMAT_BIP32", path: "m/44'/501'/0'/0'", addressFormat: "ADDRESS_FORMAT_SOLANA" }],
    });
    const res = r.activity.result.createWalletResult;
    return { provider: this.name, walletId: res.walletId, address: res.addresses[0], owner };
  }
  async attachPolicy(wallet: WalletRef, spec: ProviderPolicySpec): Promise<PolicyRef> {
    const delegatedUserId = this.env.TURNKEY_DELEGATED_USER_ID ?? "";
    if (!delegatedUserId) throw new Error("TURNKEY_DELEGATED_USER_ID required (API-only user created in setup)");
    const p = renderTurnkeyPolicy(spec, delegatedUserId, wallet.address);
    const r = await this.submit<{ activity: { result: { createPolicyResult: { policyId: string } } } }>("create_policy", "ACTIVITY_TYPE_CREATE_POLICY_V3", p);
    return { policyId: r.activity.result.createPolicyResult.policyId, rendered: p };
  }
  async createDelegatedSigner(wallet: WalletRef): Promise<SignerRef> {
    const id = this.env.TURNKEY_DELEGATED_USER_ID ?? "";
    return { signerId: id, locator: `api-key:${this.env.TURNKEY_DELEGATED_API_PUBLIC_KEY ?? "?"}`, wallet };
  }
  async signAndSend(): Promise<SendResult> {
    throw new Error(`not enabled in this run: Turnkey stays on mocks until TURNKEY_* keys exist (rpc ${this.rpcUrl})`);
  }
  async revoke(): Promise<void> {
    throw new Error("not enabled in this run");
  }
  async exportCheck(): Promise<ExportCheck> {
    return { signerCanExport: false, ownerCanExport: true, ownerHoldsKey: false, notes: "EXPORT_WALLET governed by policy; delegated user gets none." };
  }
}
