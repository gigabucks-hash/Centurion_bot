/**
 * Mock of Backend's SIWS session model (API_ENDPOINTS §4.1, a639d43): short-lived access token (900 s) + opaque
 * rotating refresh token ("srt_…", 30 d) with reuse detection (a rotated token presented again revokes the whole
 * family). Tokens are random strings held in server memory only; they never reach client JS (route handlers put
 * them in httpOnly cookies). Nothing here is a real credential.
 */
import { isAllowedWallet } from "@/lib/auth/allowlist";
import { WireError } from "./store";

export const ACCESS_TTL_S = 900;
export const REFRESH_TTL_S = 30 * 24 * 3600;

export interface Session {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: string;
  refresh_token: string;
  refresh_expires_in: number;
  session_id: string;
  user_id: string;
  address: string;
}

interface Family { address: string; userId: string; revoked: boolean; current: string; refreshExp: number }
const g = globalThis as unknown as { __sentraSessions?: { families: Map<string, Family>; refresh: Map<string, string>; access: Map<string, { sid: string; exp: number }> } };
const st = (g.__sentraSessions ??= { families: new Map(), refresh: new Map(), access: new Map() });
const rand = (n = 32) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join("");

function mint(sid: string, f: Family, now: number): Session {
  const at = `mat_${rand()}`;
  const rt = `srt_${rand()}`;
  st.access.set(at, { sid, exp: now + ACCESS_TTL_S * 1000 });
  st.refresh.set(rt, sid);
  f.current = rt;
  f.refreshExp = now + REFRESH_TTL_S * 1000;
  return { access_token: at, token_type: "bearer", expires_in: ACCESS_TTL_S, expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(), refresh_token: rt, refresh_expires_in: REFRESH_TTL_S, session_id: sid, user_id: f.userId, address: f.address };
}

export function issueSession(address: string, now = Date.now()): Session {
  const sid = `ses_${rand(12)}`;
  const f: Family = { address, userId: `usr_${address.slice(0, 8)}`, revoked: false, current: "", refreshExp: 0 };
  st.families.set(sid, f);
  return mint(sid, f, now);
}

export function refreshSession(refreshToken: string | undefined, now = Date.now()): Session {
  const sid = refreshToken ? st.refresh.get(refreshToken) : undefined;
  const f = sid ? st.families.get(sid) : undefined;
  if (!sid || !f) throw new WireError("UNAUTHENTICATED", { reason: "refresh_invalid" });
  if (f.revoked) throw new WireError("UNAUTHENTICATED", { reason: "refresh_revoked" });
  if (f.current !== refreshToken) {
    f.revoked = true; // reuse of a rotated token → revoke the family
    throw new WireError("UNAUTHENTICATED", { reason: "refresh_reused" });
  }
  if (now > f.refreshExp) throw new WireError("UNAUTHENTICATED", { reason: "refresh_expired" });
  if (!isAllowedWallet(f.address)) {
    f.revoked = true;
    throw new WireError("FORBIDDEN_ROLE", { reason: "wallet_not_allowed" });
  }
  return mint(sid, f, now);
}

export function logoutSession(refreshToken: string | undefined) {
  const sid = refreshToken ? st.refresh.get(refreshToken) : undefined;
  const f = sid ? st.families.get(sid) : undefined;
  if (f) f.revoked = true;
  return { revoked: true as const };
}

/** Access-token check used by the mock BFF: valid, unexpired and the family is not revoked. */
export function accessSession(accessToken: string | undefined, now = Date.now()) {
  const a = accessToken ? st.access.get(accessToken) : undefined;
  const f = a ? st.families.get(a.sid) : undefined;
  if (!a || !f || f.revoked || now > a.exp) return null;
  return { session_id: a.sid, address: f.address, expires_at: new Date(a.exp).toISOString() };
}
