/**
 * Desktop SIWS hand-off (/auth/desktop), aligned to apps/desktop (auth.rs loopback + deeplink.rs PKCE parser).
 * The page connects Phantom, gets a server nonce and has the wallet sign the server-built message. Two return paths:
 *
 * 1. `centurion://auth` (Boss/lead decision; i18n 0.4.8): the app sends `state` + `code_challenge` (S256). The page
 *    calls `/v1/auth/siws/verify {…, code_challenge, code_challenge_method, state}` and gets a ONE-TIME CODE
 *    (60 s, single use, bound to the challenge) — never a session, no cookies. It returns
 *    `centurion://auth?code=…&state=…` (exactly the two params deeplink.rs accepts). The app redeems
 *    `POST /v1/auth/desktop/exchange {code, code_verifier}` → Session. A hijacked redirect alone is useless
 *    without the verifier. Errors are shown on the page (the app's parser accepts no `error` param).
 * 2. Loopback `http://127.0.0.1:<port>/siws/callback` (current desktop build, auth.rs): returns the one-time,
 *    nonce-bound signed message `state, address, message, signature` (or `state, error`); the app calls /verify.
 *
 * ASSUMPTION: the code/exchange step is Desktop's proposal and is NOT in the API contract yet; the web BFF mock
 * implements it (lib/mock/handoff.ts). Nothing else is accepted as a return target (no open redirect).
 */
import { z } from "zod";

export const DESKTOP_AUTH_URI = "centurion://auth";
const LOOPBACK = /^http:\/\/127\.0\.0\.1:(\d{2,5})\/siws\/callback$/;

export type HandoffError = "wallet_not_allowed" | "user_rejected" | "not_installed" | "nonce_expired" | "failed";

export const HandoffParams = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  redirect_uri: z.string().max(200).optional(),
  client: z.literal("desktop").optional(),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  code_challenge_method: z.literal("S256").optional(),
});

export type Handoff =
  | { kind: "deeplink"; state: string; redirect: typeof DESKTOP_AUTH_URI; codeChallenge: string }
  | { kind: "loopback"; state: string; redirect: string };

/** Allow-listed return target or null. */
export function safeRedirect(raw: string | undefined | null): string | null {
  if (raw == null || raw === "" || raw === DESKTOP_AUTH_URI) return DESKTOP_AUTH_URI;
  const m = LOOPBACK.exec(raw);
  if (m && Number(m[1]) >= 1024 && Number(m[1]) <= 65535) return raw;
  return null;
}

export function parseHandoff(sp: Record<string, string | string[] | undefined>): Handoff | null {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? undefined : v);
  const p = HandoffParams.safeParse({ state: one(sp.state), redirect_uri: one(sp.redirect_uri), client: one(sp.client), code_challenge: one(sp.code_challenge), code_challenge_method: one(sp.code_challenge_method) });
  if (!p.success) return null;
  const redirect = safeRedirect(p.data.redirect_uri);
  if (!redirect) return null;
  if (redirect === DESKTOP_AUTH_URI) {
    // deep link: PKCE required (S256 only)
    if (!p.data.code_challenge || p.data.code_challenge_method !== "S256") return null;
    return { kind: "deeplink", state: p.data.state, redirect: DESKTOP_AUTH_URI, codeChallenge: p.data.code_challenge };
  }
  return { kind: "loopback", state: p.data.state, redirect };
}

/** centurion://auth?code=…&state=… — exactly the params apps/desktop deeplink.rs accepts. */
export function deepLinkUrl(state: string, code: string): string {
  return `${DESKTOP_AUTH_URI}?${new URLSearchParams({ code, state }).toString()}`;
}

const enc = (o: Record<string, string>) => new URLSearchParams(o).toString();

export function successUrl(redirect: string, state: string, r: { address: string; message: string; signature: string }): string {
  return `${redirect}?${enc({ state, address: r.address, message: r.message, signature: r.signature })}`;
}

export function errorUrl(redirect: string, state: string, error: HandoffError): string {
  return `${redirect}?${enc({ state, error })}`;
}
