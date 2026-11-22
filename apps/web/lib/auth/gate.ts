/**
 * Route gate used by proxy.ts (private single-owner app).
 * - Pages: no access AND no refresh cookie → redirect /login?next=… (with only a refresh cookie the client
 *   SessionKeeper refreshes silently).
 * - /api/*: no access cookie → 401 UNAUTHENTICATED, which makes lib/client.ts refresh once and retry.
 * Mock mode (DATA_SOURCE is not http): the proxy also checks the access token against the in-memory session.
 * DATA_SOURCE=http: the paper backend verifies the JWT. A present cookie is enough to reach that proxy.
 * CENTURION_AUTH_GATE=0 skips the gate for local perf/screenshot runs. A production process ignores that switch.
 */
export const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/api\/v1\/auth\//, /^\/api\/auth$/, /^\/api\/local\/paper-session$/, /^\/api\/local\/mcp$/, /^\/robots\.txt$/, /^\/manifest/, /^\/icon/, /^\/apple-icon/, /^\/opengraph-image$/, /^\/twitter-image$/, /^\/auth\/desktop$/];

export type GateResult = { kind: "pass" } | { kind: "redirect"; to: string } | { kind: "unauthorized" };

/** True unless a non-production process explicitly turns the gate off. */
export function authGateOn(env: { NODE_ENV?: string; CENTURION_AUTH_GATE?: string } = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  return env.CENTURION_AUTH_GATE !== "0";
}

export function gate(pathname: string, search: string, has: { access: boolean; refresh: boolean }, enabled = authGateOn()): GateResult {
  if (!enabled || PUBLIC_PATHS.some((r) => r.test(pathname))) return { kind: "pass" };
  if (pathname.startsWith("/api/")) return has.access ? { kind: "pass" } : { kind: "unauthorized" };
  if (has.access || has.refresh) return { kind: "pass" };
  return { kind: "redirect", to: `/login?next=${encodeURIComponent(pathname + search)}` };
}

/** ?next= from the gate redirect; only same-origin absolute paths (no "//host", no scheme). */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.length > 512) return null;
  return /[\u0000-\u001f]/.test(raw) ? null : raw;
}
