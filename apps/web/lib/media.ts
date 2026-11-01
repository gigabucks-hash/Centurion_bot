/**
 * Coin logos (contracts 1.1.6, Backend working tree: `LogoUrl`, `GET /v1/logos/{mint}/{size}.{webp|png}`, sizes
 * 32/64/128, re-encoded PNG/WebP, public, can 404 → identicon). The browser only ever loads OUR same-origin BFF mirror
 * `/api/v1/logos/{mint}/{size}.{ext}` (CSP img-src 'self'), so:
 * - a wire `logo_url` is validated (our proxy shape, same mint) and only tells us the proxy is on; its host is never
 *   put in an <img> (no CSP widening for LOGO_PUBLIC_BASE_URL, no third-party request from the browser);
 * - `logo_url === null` = proxy disabled → identicon locally, no request; `undefined` (pre-1.1.6 wire, mock) → try BFF;
 * - token metadata `untrusted.uri` / `image` are never loaded.
 */
import { isMint } from "./identicon";

export const LOGO_PATH = "/api/v1/logos/";
export const LOGO_SIZES = [32, 64, 128] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];
export const LOGO_FILE = /^(32|64|128)\.(webp|png)$/;
// eslint-disable-next-line security/detect-unsafe-regex -- anchored, bounded quantifiers, no nested repetition; inputs ≤ 400 chars
const WIRE_LOGO = /^(?:https:\/\/[A-Za-z0-9.-]{1,253}(?::\d{2,5})?)?\/v1\/logos\/([1-9A-HJ-NP-Za-km-z]{32,44})\/(?:32|64|128)\.(?:webp|png)$/;

/** Smallest proxy size covering `px` CSS pixels at `dpr`. */
export const logoSizeFor = (px: number, dpr = 1): LogoSize => LOGO_SIZES.find((s) => s >= px * dpr) ?? 128;

/** Same-origin BFF URL for a mint at a size, or null (invalid mint / proxy disabled / wire URL for another mint). */
export function coinLogoSrc(mint: string, logoUrl?: string | null, size: LogoSize = 64): string | null {
  if (!isMint(mint) || logoUrl === null) return null;
  if (logoUrl !== undefined) {
    const m = logoUrl.length <= 400 ? WIRE_LOGO.exec(logoUrl) : null;
    if (!m || m[1] !== mint) return null;
  }
  return `${LOGO_PATH}${mint}/${size}.webp`;
}

/** Wire logo_url → hint kept on view models: undefined (absent), null (disabled/invalid) or the validated string. */
export function logoHintFromWire(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || v.length > 400 || !WIRE_LOGO.test(v)) return null;
  return v;
}

/** What Backend would send (API-relative) — used by the mock BFF when it builds wire objects. */
export const wireLogoUrl = (mint: string | null | undefined): { logo_url: string | null } => ({
  logo_url: mint && isMint(mint) ? `/v1/logos/${mint}/128.webp` : null,
});

export const LOGO_TYPES = new Set(["image/png", "image/webp"]);
export const LOGO_MAX_BYTES = 256 * 1024;
