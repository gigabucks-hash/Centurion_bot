// Tiny devnet JSON-RPC client. Construct only through devnetRpc(), which enforces the devnet guard.
import { assertDevnetConfig, verifyGenesis } from "./network-guard.ts";

export class DevnetRpc {
  readonly url: string;
  private id = 0;
  constructor(url: string) {
    this.url = url;
  }
  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const r = await fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }) });
    const j = (await r.json()) as { result?: T; error?: { message: string } };
    if (j.error) throw new Error(`${method}: ${j.error.message}`);
    return j.result as T;
  }
  async latestBlockhash(): Promise<string> {
    return (await this.call<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "confirmed" }])).value.blockhash;
  }
  async balance(addr: string): Promise<number> {
    return (await this.call<{ value: number }>("getBalance", [addr, { commitment: "confirmed" }])).value;
  }
  async airdrop(addr: string, lamports: number): Promise<string> {
    return this.call<string>("requestAirdrop", [addr, lamports]);
  }
  async sigStatus(sig: string): Promise<string | null> {
    const r = await this.call<{ value: ({ confirmationStatus: string; err: unknown } | null)[] }>("getSignatureStatuses", [[sig]]);
    const v = r.value[0];
    return v ? (v.err ? "failed" : v.confirmationStatus) : null;
  }
}

export async function devnetRpc(env: Record<string, string | undefined> = process.env): Promise<DevnetRpc> {
  const { rpcUrl } = assertDevnetConfig(env);
  await verifyGenesis(rpcUrl);
  return new DevnetRpc(rpcUrl);
}
