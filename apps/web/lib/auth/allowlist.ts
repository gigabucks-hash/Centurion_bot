/**
 * Server-side wallet allowlist for the private MVP (mock). OWNER_WALLETS = comma-separated base58
 * addresses (server env, not NEXT_PUBLIC). Default: the mock owner wallet only. Addresses are public keys, not
 * secrets. Backend's SIWS verify will enforce the same rule; the web check is defence in depth.
 */
export const MOCK_OWNER_WALLET = "BossMockWa11et11111111111111111111111111111";
export const MOCK_OTHER_WALLET = "StrangerMockWa11et1111111111111111111111111";

export function allowedWallets(): Set<string> {
  const raw = process.env.OWNER_WALLETS;
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [MOCK_OWNER_WALLET];
  return new Set(list);
}

export const isAllowedWallet = (address: string) => allowedWallets().has(address);
