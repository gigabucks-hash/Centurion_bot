/**
 * MOCK of the desktop PKCE hand-off proposed by Desktop (apps/desktop deeplink.rs; not in the API contract yet):
 * - web page: POST /v1/auth/siws/verify {address, message, signature, code_challenge, code_challenge_method:"S256",
 *   state} → {code, expires_in} instead of a session (no cookies are set);
 * - desktop:  POST /v1/auth/desktop/exchange {code, code_verifier, client:"desktop"} → Session (JSON body, keychain).
 * Code: 32 random bytes base64url, single use, 60 s, bound to the challenge + state; RFC 7636 S256.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { WireError } from "./store";
import { issueSession, type Session } from "./session";

export const CODE_TTL_MS = 60_000;
const g = globalThis as unknown as { __centurionHandoff?: Map<string, { address: string; challenge: string; state: string; exp: number }> };
const codes = (g.__centurionHandoff ??= new Map());

export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function issueHandoffCode(address: string, challenge: string, state: string, now = Date.now()): { code: string; expires_in: number } {
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k);
  const code = randomBytes(32).toString("base64url");
  codes.set(code, { address, challenge, state, exp: now + CODE_TTL_MS });
  return { code, expires_in: CODE_TTL_MS / 1000 };
}

export function exchangeHandoffCode(code: string, verifier: string, now = Date.now()): Session {
  const c = codes.get(code);
  codes.delete(code); // single use, even on failure
  if (!c || c.exp < now) throw new WireError("UNAUTHENTICATED", { reason: "code_invalid" });
  const a = Buffer.from(s256(verifier)), b = Buffer.from(c.challenge);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new WireError("UNAUTHENTICATED", { reason: "code_verifier_mismatch" });
  return issueSession(c.address, now);
}
