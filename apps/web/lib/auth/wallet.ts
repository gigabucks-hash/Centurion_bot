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

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (Bitcoin alphabet) without a dependency; SIWS signatures travel as base58. */
export function b58encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58[digits[i]];
  return out;
}

interface PhantomProvider {
  isPhantom?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
  disconnect?(): Promise<void>;
}

function phantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider };
  const provider = w.phantom?.solana ?? w.solana;
  return provider && typeof provider.connect === "function" && typeof provider.signMessage === "function" ? provider : null;
}

/**
 * Real sign-in: the injected Phantom provider signs the exact SIWS bytes; the base58 signature goes to the
 * backend, which verifies ed25519. No key ever leaves the wallet.
 */
export function phantomAdapter(): WalletAdapter {
  return {
    name: "Phantom",
    async connect() {
      const provider = phantomProvider();
      if (!provider) throw new WalletError("not_installed");
      try {
        const res = await provider.connect();
        return { address: res.publicKey.toString() };
      } catch {
        throw new WalletError("connect_rejected");
      }
    },
    async signMessage(message: string) {
      const provider = phantomProvider();
      if (!provider) throw new WalletError("not_installed");
      try {
        const res = await provider.signMessage(new TextEncoder().encode(message), "utf8");
        const sig = res instanceof Uint8Array ? res : res.signature;
        return b58encode(sig);
      } catch {
        throw new WalletError("sign_rejected");
      }
    },
    async disconnect() {
      await phantomProvider()?.disconnect?.().catch(() => undefined);
    },
  };
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
