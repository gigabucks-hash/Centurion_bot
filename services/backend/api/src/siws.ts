// Sign-In With Solana: server-built message, strict parse, ed25519 verification against the address
// (the public key). Verification only: no key custody, nothing is signed server-side.
import { createPublicKey, randomBytes, verify } from "node:crypto";
import { b58decode } from "./base58.ts";

export const SIWS_CHAIN = "solana:mainnet";
/**
 * Statement versions (B-7). The message format itself is SIWS "Version: 1"; the statement text is versioned
 * separately so it can change (e.g. for Phase 7) without breaking clients holding an older nonce. Every version
 * listed here is still accepted; the nonce row records which one the server used and verify requires that one.
 */
export const SIWS_STATEMENTS: Readonly<Record<number, string>> = {
  1: "Sign in to Sentra (practice). This request does not trigger a transaction or cost any fees.",
};
export const SIWS_STATEMENT_VERSION = 1;
export const SIWS_STATEMENT = SIWS_STATEMENTS[SIWS_STATEMENT_VERSION]!;
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export interface SiwsFields {
  domain: string; address: string; uri: string; version: "1"; chain_id: string; nonce: string;
  issued_at: string; expiration_time: string;
  /** Not a message line: which SIWS_STATEMENTS entry the message uses. */
  statement_version: number;
}

export function newNonce(len = 32): string {
  const b = randomBytes(len);
  let s = "";
  for (const x of b) s += ALNUM[x % ALNUM.length]; // 256 % 62 bias is negligible for a 32-char nonce
  return s;
}

export function isAddress(a: unknown): a is string {
  if (typeof a !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return false;
  return b58decode(a)?.length === 32;
}

export function buildMessage(f: SiwsFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.address,
    "",
    SIWS_STATEMENTS[f.statement_version] ?? "",
    "",
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Chain ID: ${f.chain_id}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issued_at}`,
    `Expiration Time: ${f.expiration_time}`,
  ].join("\n");
}

const RE = new RegExp(
  "^(?<domain>[A-Za-z0-9.-]{1,253}(?::[0-9]{1,5})?) wants you to sign in with your Solana account:\\n" +
    "(?<address>[1-9A-HJ-NP-Za-km-z]{32,44})\\n\\n" +
    "(?<statement>" + Object.values(SIWS_STATEMENTS).map((s) => s.replace(/[.()]/g, "\\$&")).join("|") + ")\\n\\n" +
    "URI: (?<uri>[^\\s]{1,2048})\\n" +
    "Version: (?<version>1)\\n" +
    "Chain ID: (?<chain_id>[a-z0-9:-]{1,32})\\n" +
    "Nonce: (?<nonce>[A-Za-z0-9]{16,64})\\n" +
    "Issued At: (?<issued_at>[0-9TZ:.-]{20,30})\\n" +
    "Expiration Time: (?<expiration_time>[0-9TZ:.-]{20,30})$",
);

/** Strict parse; returns null unless the message is exactly what buildMessage() produces. */
export function parseMessage(m: string): SiwsFields | null {
  if (m.length > 4096) return null;
  const g = RE.exec(m)?.groups;
  if (!g) return null;
  const version = Object.entries(SIWS_STATEMENTS).find(([, s]) => s === g.statement)?.[0];
  if (!version) return null;
  const f: SiwsFields = {
    domain: g.domain!, address: g.address!, uri: g.uri!, version: "1", chain_id: g.chain_id!, nonce: g.nonce!,
    issued_at: g.issued_at!, expiration_time: g.expiration_time!, statement_version: Number(version),
  };
  if (Number.isNaN(Date.parse(f.issued_at)) || Number.isNaN(Date.parse(f.expiration_time))) return null;
  return buildMessage(f) === m ? f : null;
}

/** ed25519 over the exact UTF-8 message bytes; signature is base58 (64 bytes). */
export function verifySignature(address: string, message: string, signatureB58: string): boolean {
  const pub = b58decode(address);
  const sig = typeof signatureB58 === "string" ? b58decode(signatureB58) : null;
  if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, pub]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), key, sig);
  } catch {
    return false;
  }
}

/** Host[:port] of a URL, or null. */
export function hostOf(u: string): string | null {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && !(x.protocol === "http:" && (x.hostname === "localhost" || x.hostname === "127.0.0.1"))) {
      return null;
    }
    return x.host;
  } catch {
    return null;
  }
}
