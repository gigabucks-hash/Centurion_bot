/**
 * Session cookies (server only). Access token and refresh token live ONLY in httpOnly cookies set by route
 * handlers; client JS never sees them (no localStorage/sessionStorage). The refresh cookie is scoped to the
 * session routes so it is not sent with every request.
 */
import type { cookies } from "next/headers";
import type { Session } from "@/lib/mock/session";

type Jar = Awaited<ReturnType<typeof cookies>>;
export const ACCESS_COOKIE = "centurion_at";
export const REFRESH_COOKIE = "centurion_rt";
export const REFRESH_PATH = "/api/v1/auth/session";
/** Workspace created by the backend at first SIWS login (DATA_SOURCE=http); not a secret. */
export const WORKSPACE_COOKIE = "centurion_ws";

const secure = () => process.env.NODE_ENV === "production" && process.env.CENTURION_INSECURE_COOKIES !== "1";

export function setSessionCookies(c: Jar, s: Session) {
  c.set(ACCESS_COOKIE, s.access_token, { path: "/", httpOnly: true, sameSite: "lax", secure: secure(), maxAge: s.expires_in });
  c.set(REFRESH_COOKIE, s.refresh_token, { path: REFRESH_PATH, httpOnly: true, sameSite: "strict", secure: secure(), maxAge: s.refresh_expires_in });
}

export function clearSessionCookies(c: Jar) {
  c.set(ACCESS_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: secure(), maxAge: 0 });
  c.set(REFRESH_COOKIE, "", { path: REFRESH_PATH, httpOnly: true, sameSite: "strict", secure: secure(), maxAge: 0 });
  c.set(WORKSPACE_COOKIE, "", { path: "/", httpOnly: true, sameSite: "lax", secure: secure(), maxAge: 0 });
  c.delete("centurion_session"); // legacy mock cookie
}

/** What the browser may know about the session (no tokens). */
export const publicSession = (s: Pick<Session, "session_id" | "address" | "expires_at">) => ({ session_id: s.session_id, address: s.address, expires_at: s.expires_at });
