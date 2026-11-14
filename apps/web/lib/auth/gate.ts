/**
 * Route gate used by proxy.ts (private single-owner app). Presence check only: the proxy cannot validate tokens
 * cheaply, Backend verifies the JWT on every API call and the mock BFF validates in route handlers.
 * - Pages: no access AND no refresh cookie → redirect /login?next=… (with only a refresh cookie the client
 *   SessionKeeper refreshes silently).
 * - /api/v1/workspaces/*: no access cookie → 401 UNAUTHENTICATED, which makes lib/client.ts refresh once and retry.
 * Disable for local perf/screenshot runs with CENTURION_AUTH_GATE=0.
 */
export const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/api\/v1\/auth\//, /^\/api\/auth$/, /^\/api\/local\/paper-session$/, /^\/api\/local\/mcp$/, /^\/robots\.txt$/, /^\/manifest/, /^\/icon/, /^\/apple-icon/, /^\/opengraph-image$/, /^\/twitter-image$/, /^\/auth\/desktop$/];

export type GateResult = { kind: "pass" } | { kind: "redirect"; to: string } | { kind: "unauthorized" };

export function gate(pathname: string, search: string, has: { access: boolean; refresh: boolean }, enabled = process.env.CENTURION_AUTH_GATE !== "0"): GateResult {
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
