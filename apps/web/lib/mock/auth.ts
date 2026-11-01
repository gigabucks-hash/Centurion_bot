/**
 * Mock auth state for /api/v1/auth/* (API_ENDPOINTS §4.1). No IdP, wallet or mail server is contacted.
 * - SIWS: nonce 16–64 alnum, 5 min TTL, single use, bound to domain + address. "Signature" = the literal
 *   string "mock-signature" (no wallet in this build).
 * - Email OTP: request always 202 {sent, resend_after_s: 60}; code is 123456 in the mock; 10 min TTL;
 *   5 wrong → locked 15 min (429 OTP_LOCKED).
 */
import { WireError } from "./store";

/** Backend SIWS_STATEMENTS[2] (current, = UX auth.siws.statement since i18n 0.4.7). The server builds the signed text. */
export const SIWS_STATEMENT = "Sign in to Centurion Trade";
export const SIWS_STATEMENT_VERSION = 2;

const MIN = 60_000;
export const MOCK_OTP = "123456";
const g = globalThis as unknown as {
  __sentraAuth?: { nonces: Map<string, { address: string; domain: string; exp: number }>; otps: Map<string, { sentAt: number; exp: number; attempts: number; lockedUntil?: number }> };
};
const st = (g.__sentraAuth ??= { nonces: new Map(), otps: new Map() });

export function siwsNonce(address: string, domain: string, uri: string, now = Date.now()) {
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const issued = new Date(now).toISOString();
  const exp = now + 5 * MIN;
  st.nonces.set(nonce, { address, domain, exp });
  const message = `${domain} wants you to sign in with your Solana account:\n${address}\n\n${SIWS_STATEMENT}\n\nURI: ${uri}\nVersion: 1\nChain ID: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issued}\nExpiration Time: ${new Date(exp).toISOString()}`;
  return { nonce, message, issued_at: issued, expires_at: new Date(exp).toISOString(), statement_version: SIWS_STATEMENT_VERSION };
}

export function siwsVerify(address: string, message: string, signature: string, now = Date.now()) {
  const nonce = /Nonce: (\w+)/.exec(message)?.[1];
  const n = nonce ? st.nonces.get(nonce) : undefined;
  if (!nonce || !n || n.address !== address || now > n.exp) throw new WireError("SIWS_NONCE_INVALID");
  st.nonces.delete(nonce); // single use
  if (signature !== "mock-signature") throw new WireError("SIWS_SIGNATURE_INVALID");
  return { method: "wallet_siws" as const };
}

export function otpRequest(email: string, now = Date.now()) {
  const k = email.trim().toLowerCase();
  const prev = st.otps.get(k);
  if (!prev?.lockedUntil || now > prev.lockedUntil) {
    if (!prev || now - prev.sentAt >= MIN) st.otps.set(k, { sentAt: now, exp: now + 10 * MIN, attempts: prev && !prev.lockedUntil ? prev.attempts : 0 });
  }
  return { sent: true, resend_after_s: 60 };
}

export function otpVerify(email: string, code: string, now = Date.now()) {
  const k = email.trim().toLowerCase();
  const o = st.otps.get(k);
  if (o?.lockedUntil && now < o.lockedUntil) throw new WireError("OTP_LOCKED", { retry_after_s: Math.ceil((o.lockedUntil - now) / 1000) });
  if (!o || now > o.exp) throw new WireError("OTP_INVALID", { attempts_left: 0, expired: true });
  if (code !== MOCK_OTP) {
    o.attempts += 1;
    if (o.attempts >= 5) {
      o.lockedUntil = now + 15 * MIN;
      throw new WireError("OTP_LOCKED", { retry_after_s: 15 * 60 });
    }
    throw new WireError("OTP_INVALID", { attempts_left: 5 - o.attempts });
  }
  st.otps.delete(k);
  return { method: "email_otp" as const };
}
