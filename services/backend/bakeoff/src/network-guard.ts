// Devnet-only guard. Any provider key found must be used on devnet only; refuse everything else.
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

export class NotDevnetError extends Error {}

export function assertDevnetConfig(env: Record<string, string | undefined>): { rpcUrl: string } {
  const cluster = env.SOLANA_CLUSTER;
  if (cluster !== "devnet") throw new NotDevnetError(`SOLANA_CLUSTER must be "devnet" (got ${JSON.stringify(cluster ?? null)})`);
  const rpcUrl = env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  let u: URL;
  try {
    u = new URL(rpcUrl);
  } catch {
    throw new NotDevnetError("SOLANA_RPC_URL is not a URL");
  }
  if (u.protocol !== "https:") throw new NotDevnetError("SOLANA_RPC_URL must be https");
  const parts = u.hostname.toLowerCase().split(/[.-]/);
  const whole = rpcUrl.toLowerCase();
  if (whole.includes("mainnet") || whole.includes("testnet")) throw new NotDevnetError("SOLANA_RPC_URL points at a non-devnet cluster");
  if (!parts.includes("devnet")) throw new NotDevnetError(`SOLANA_RPC_URL host ${u.hostname} is not a devnet host`);
  return { rpcUrl };
}

export function assertCrossmintStaging(env: Record<string, string | undefined>): { baseUrl: string; apiKey: string } {
  if (env.CROSSMINT_ENV !== "staging") throw new NotDevnetError(`CROSSMINT_ENV must be "staging" (got ${JSON.stringify(env.CROSSMINT_ENV ?? null)})`);
  const baseUrl = env.CROSSMINT_API_BASE_URL ?? "https://staging.crossmint.com/api";
  if (new URL(baseUrl).hostname !== "staging.crossmint.com") throw new NotDevnetError("Crossmint base URL must be staging.crossmint.com");
  const apiKey = env.CROSSMINT_SERVER_API_KEY ?? "";
  if (!apiKey.startsWith("sk_staging_")) throw new NotDevnetError("CROSSMINT_SERVER_API_KEY must be a staging server key (sk_staging_ prefix)");
  return { baseUrl, apiKey };
}

/** Live check: the RPC must report the devnet genesis hash. */
export async function verifyGenesis(rpcUrl: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const r = await fetchFn(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash" }) });
  const j = (await r.json()) as { result?: string };
  if (j.result !== DEVNET_GENESIS) throw new NotDevnetError(`RPC genesis ${j.result} is not devnet`);
}
