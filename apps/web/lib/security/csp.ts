import { createHash } from "node:crypto";
import { THEME_INIT } from "./theme-init";

/**
 * Strict CSP (nonce + 'strict-dynamic') and the other security headers. Pure so it is unit-tested; proxy.ts sets
 * them per request. Origins beyond 'self' are added only when the matching feature is configured:
 * - Google Identity Services (NEXT_PUBLIC_GOOGLE_CLIENT_ID): accounts.google.com for its iframe/XHR/styles.
 * - Apple button artwork: appleid.cdn-apple.com images.
 * - DATA_SOURCE=http: the API origin (server-side only, but SSE runs in the browser).
 * Inline style *attributes* (React style={{}}, virtual rows, charts) need style-src-attr 'unsafe-inline'; style
 * elements still need the nonce. 'unsafe-eval' only in development (React dev tooling).
 */
export const THEME_INIT_HASH = `'sha256-${createHash("sha256").update(THEME_INIT).digest("base64")}'`;

export interface CspOptions {
  nonce: string;
  dev?: boolean;
  https?: boolean;
  googleClientId?: string;
  apiOrigin?: string | null;
}

/**
 * lightweight-charts injects one fixed <style> for its (required) TradingView attribution logo. Allowed by hash
 * instead of 'unsafe-inline'; lib/__tests__/contracts-114.test.ts recomputes it from the installed library, so a
 * library upgrade that changes the CSS fails the test instead of silently breaking the logo style.
 */
export const LWC_ATTRIBUTION_STYLE_HASH = "'sha256-3pRED1tOXas1FXFoPb9TGCjmYe9XQsmO9OV23khV2nY='";

export function buildCsp(o: CspOptions): string {
  const google = o.googleClientId ? " https://accounts.google.com" : "";
  const api = o.apiOrigin ? ` ${o.apiOrigin}` : "";
  const d: [string, string][] = [
    ["default-src", "'self'"],
    ["script-src", `'self' 'nonce-${o.nonce}' 'strict-dynamic' ${THEME_INIT_HASH}${o.dev ? " 'unsafe-eval'" : ""}`],
    ["style-src", `'self' 'nonce-${o.nonce}' ${LWC_ATTRIBUTION_STYLE_HASH}${google ? `${google}/gsi/style` : ""}`],
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", "'self' data: blob: https://appleid.cdn-apple.com https://static.datapi.jup.ag"],
    ["font-src", "'self'"],
    ["connect-src", `'self'${api}${google}${o.dev ? " ws:" : ""}`],
    ["frame-src", google.trim() || "'none'"],
    ["worker-src", "'self' blob:"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ["manifest-src", "'self'"],
  ];
  const out = d.map(([k, v]) => `${k} ${v}`);
  if (o.https) out.push("upgrade-insecure-requests");
  return out.join("; ");
}

/** Static security headers (also set in next.config.ts headers() for responses the proxy does not touch). */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
};

export function newNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Buffer.from(b).toString("base64");
}
