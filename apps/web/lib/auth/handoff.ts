/**
 * Desktop SIWS hand-off (/auth/desktop). The desktop app opens this page in the system browser with
 * `?state=<random>&redirect_uri=<uri>&client=desktop`; the page connects Phantom, gets a server nonce, has the wallet
 * sign the server-built SIWS message and returns to the app. It NEVER calls /verify and never sees or forwards a
 * session token: the app redeems the one-time, nonce-bound signed message itself (`POST /v1/auth/siws/verify
 * {client: "desktop"}`; nonce 5 min, single use, all fields bound — backend B-3), and stores tokens in the OS keychain.
 *
 * Return URL: `centurion://auth` (i18n 0.4.8 / lead decision) — or, for the current desktop build, its loopback
 * `http://127.0.0.1:<port>/siws/callback` (apps/desktop auth.rs). Nothing else is accepted (no open redirect).
 * Params on return: success `state, address, message, signature`; failure `state, error`.
 *
 * ASSUMPTION (no Backend hand-off code yet): the "one-time code" is the signed SIWS message itself. A custom scheme can
 * be claimed by another app, so Backend's PKCE-style `state` (REAL_MONEY_OPTIONS 2.5 (4): hash with /nonce, secret
 * with /verify) or a short-lived hand-off code exchange should replace it; see docs/PERF_SECURITY.md §Auth.
 */
import { z } from "zod";

export const DESKTOP_AUTH_URI = "centurion://auth";
const LOOPBACK = /^http:\/\/127\.0\.0\.1:(\d{2,5})\/siws\/callback$/;

export type HandoffError = "wallet_not_allowed" | "user_rejected" | "not_installed" | "nonce_expired" | "failed";

export const HandoffParams = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  redirect_uri: z.string().max(200).optional(),
  client: z.literal("desktop").optional(),
});

/** Allow-listed return target or null. */
export function safeRedirect(raw: string | undefined | null): string | null {
  if (raw == null || raw === "" || raw === DESKTOP_AUTH_URI) return DESKTOP_AUTH_URI;
  const m = LOOPBACK.exec(raw);
  if (m && Number(m[1]) >= 1024 && Number(m[1]) <= 65535) return raw;
  return null;
}

export function parseHandoff(sp: Record<string, string | string[] | undefined>): { state: string; redirect: string } | null {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? undefined : v);
  const p = HandoffParams.safeParse({ state: one(sp.state), redirect_uri: one(sp.redirect_uri), client: one(sp.client) });
  if (!p.success) return null;
  const redirect = safeRedirect(p.data.redirect_uri);
  return redirect ? { state: p.data.state, redirect } : null;
}

const enc = (o: Record<string, string>) => new URLSearchParams(o).toString();

export function successUrl(redirect: string, state: string, r: { address: string; message: string; signature: string }): string {
  return `${redirect}?${enc({ state, address: r.address, message: r.message, signature: r.signature })}`;
}

export function errorUrl(redirect: string, state: string, error: HandoffError): string {
  return `${redirect}?${enc({ state, error })}`;
}
