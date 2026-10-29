/**
 * Wallet sign-in adapter (SIWS), shaped for Backend's POST /auth/siws/nonce and /auth/siws/verify.
 * MOCK: `mockPhantom` never touches window.solana / window.phantom or any @phantom SDK; it returns a fixed public
 * key and the literal signature "mock-signature". Swap in a real adapter (Phantom Connect / Wallet Standard
 * `solana:signMessage`) once the SIWS route is live; the flow below does not change.
 */
import { request } from "@/lib/client";

export interface WalletAdapter {
  name: "Phantom";
  /** Ask the wallet to connect; resolves with the public key (base58). */
  connect(): Promise<{ address: string }>;
  /** Sign the exact SIWS message bytes; resolves with the signature (base58/base64 string). */
  signMessage(message: string): Promise<string>;
  disconnect(): Promise<void>;
}

export type MockWalletBehaviour = "ok" | "not_installed" | "connect_rejected" | "sign_rejected";

export class WalletError extends Error {
  constructor(readonly code: "not_installed" | "connect_rejected" | "sign_rejected") {
    super(code);
  }
}

export function mockPhantom(address: string, behaviour: MockWalletBehaviour = "ok"): WalletAdapter {
  return {
    name: "Phantom",
    async connect() {
      await new Promise((r) => setTimeout(r, 400));
      if (behaviour === "not_installed") throw new WalletError("not_installed");
      if (behaviour === "connect_rejected") throw new WalletError("connect_rejected");
      return { address };
    },
    async signMessage() {
      await new Promise((r) => setTimeout(r, 400));
      if (behaviour === "sign_rejected") throw new WalletError("sign_rejected");
      return "mock-signature";
    },
    async disconnect() {},
  };
}

export interface SiwsChallenge { nonce: string; message: string; issued_at: string; expires_at: string }

/** Step 2: server-issued SIWS message for this address (shown to the user before signing). */
export async function siwsNonce(address: string): Promise<SiwsChallenge> {
  return (await request<SiwsChallenge>("/api/v1/auth/siws/nonce", { body: { address, domain: window.location.host, uri: window.location.origin, chain_id: "solana:mainnet" } })).data;
}

/** Step 4: verify the signature → httpOnly session cookie (403 FORBIDDEN_ROLE{reason:wallet_not_allowed} otherwise). */
export async function siwsVerify(address: string, message: string, signature: string): Promise<void> {
  await request("/api/v1/auth/siws/verify", { body: { address, message, signature } });
}
