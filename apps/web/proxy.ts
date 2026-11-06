import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce, SECURITY_HEADERS } from "@/lib/security/csp";
import { gate } from "@/lib/auth/gate";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookies";

/**
 * Per-request nonce CSP + security headers (Next 16 Proxy). Next reads the nonce from the request's
 * Content-Security-Policy header and stamps it on its own scripts/styles. Static assets are skipped.
 * COOP is same-origin-allow-popups so the Google / Apple / Telegram sign-in popups keep working (SIGN_IN_BUTTONS §3).
 * Also the private-app gate (lib/auth/gate.ts). Prefetches are NOT skipped, so they are gated too.
 */
export function proxy(request: NextRequest) {
  const g = gate(request.nextUrl.pathname, request.nextUrl.search, { access: request.cookies.has(ACCESS_COOKIE), refresh: request.cookies.has(REFRESH_COOKIE) });
  if (g.kind === "unauthorized") {
    const ts = new Date().toISOString();
    return withSecurity(Response.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required", reason: "access_missing", server_now: ts }, server_now: ts }, { status: 401 }));
  }
  if (g.kind === "redirect") return withSecurity(NextResponse.redirect(new URL(g.to, request.url)));
  // DATA_SOURCE=http: browser-side reads/writes under the workspace API are answered by the paper backend through one
  // proxy route, so every existing BFF call (approve, sell, events stream, coins, strategies) keeps its URL. Auth and
  // workspace come from the httpOnly cookies, never from the URL.
  if (process.env.DATA_SOURCE === "http" && (request.nextUrl.pathname.startsWith("/api/v1/workspaces/") || request.nextUrl.pathname.startsWith("/api/v1/img/coin/"))) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/backend${request.nextUrl.pathname}`;
    return withSecurity(NextResponse.rewrite(url));
  }
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    https: request.nextUrl.protocol === "https:",
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    apiOrigin: process.env.DATA_SOURCE === "http" && process.env.API_BASE_URL ? new URL(process.env.API_BASE_URL).origin : null,
  });
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return withSecurity(res);
}

function withSecurity<R extends Response>(res: R): R {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: [
    { source: "/((?!_next/static|_next/image|favicon.ico|brand/).*)" },
  ],
};
