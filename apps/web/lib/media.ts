/**
 * Coin logos (contracts 1.1.6, API_ENDPOINTS 4.12; UX COIN_LOGO.md Rev 6.1).
 * Backend proxy: `GET /v1/img/coin/{mint}?s={48|64|96|128|192}[&fmt=webp|png]&v={logo_hash}` (WebP, never SVG;
 * 404 LOGO_NOT_FOUND / 422 LOGO_REJECTED → identicon, no retry per mint+v). Wires carry `logo_hash` (= `v`) and
 * `logo_url` (our URL with s=96). The browser only ever loads OUR same-origin BFF mirror
 * `/api/v1/img/coin/{mint}?s=&v=` (CSP img-src 'self'), so:
 * - `logo_hash` null/absent → identicon locally, no request, no skeleton ("don't guess a URL without v");
 * - `logo_url` is only a hint: its host is never put in an <img>; the src is rebuilt from mint + logo_hash;
 * - size `s` = smallest LOGO_SIZES bucket >= px × dpr (cap 192), via the contract's logoSizeFor();
 * - token metadata `untrusted.uri` / `image` are never loaded.
 */
import { LOGO_SIZES, logoSizeFor, type LogoSize } from "@centurion/contracts/wire";
import { fnv1a32, isMint } from "./identicon";

export { LOGO_SIZES, logoSizeFor, type LogoSize };
export const LOGO_PATH = "/api/v1/img/coin/";
/** WebP budget per logo (UX COIN_LOGO §2); Backend hard cap per variant is 16 KiB (above → 422 → identicon). */
export const LOGO_BUDGET_BYTES = 8 * 1024;
export const LOGO_HARD_MAX_BYTES = 16 * 1024;
const HASH = /^[A-Za-z0-9_-]{1,128}$/;

export const isLogoHash = (v: unknown): v is string => typeof v === "string" && HASH.test(v);
export const isLogoSize = (n: number): n is LogoSize => (LOGO_SIZES as readonly number[]).includes(n);

/** Same-origin BFF URL for a mint at a size, or null (invalid mint / no logo_hash → identicon without a request). */
export function coinLogoSrc(mint: string, logoHash: string | null | undefined, size: LogoSize = 64): string | null {
  if (!isMint(mint) || !isLogoHash(logoHash)) return null;
  return `${LOGO_PATH}${mint}?s=${size}&v=${encodeURIComponent(logoHash)}`;
}

/** Wire `logo_hash` → view model: undefined (absent, pre-1.1.6), null (no logo / invalid) or the validated hash. */
export function logoHashFromWire(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  return isLogoHash(v) ? v : null;
}

/**
 * Mock Backend: ~2/3 of mints have a logo (`logo_hash` = deterministic content-hash stand-in), the rest null.
 * `logo_url` is the API-relative 1.1.6 shape with s=96 (LOGO_PUBLIC_BASE_URL unset).
 */
export function mockLogoHash(mint: string | null | undefined): string | null {
  if (!mint || !isMint(mint)) return null;
  const h = fnv1a32(`${mint}:logo`);
  return h % 3 === 0 ? null : `m${h.toString(36)}`;
}
export const wireLogo = (mint: string | null | undefined): { logo_hash: string | null; logo_url: string | null } => {
  const hash = mockLogoHash(mint);
  return { logo_hash: hash, logo_url: hash ? `/v1/img/coin/${mint}?s=96&v=${hash}` : null };
};
/** Approvals and events carry only `logo_url` (1.1.6): recover `v` from it when it is our proxy shape for that mint. */
// eslint-disable-next-line security/detect-unsafe-regex -- anchored, bounded quantifiers, no nested repetition; inputs ≤ 400 chars
const WIRE_LOGO = /^(?:https:\/\/[A-Za-z0-9.-]{1,253}(?::\d{2,5})?)?\/v1\/img\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})\?s=(?:48|64|96|128|192)(?:&fmt=(?:webp|png))?&v=([A-Za-z0-9_-]{1,128})$/;
export function logoHashFromUrl(url: unknown, mint: string | null | undefined): string | null | undefined {
  if (url === undefined) return undefined;
  if (typeof url !== "string" || url.length > 400) return null;
  const m = WIRE_LOGO.exec(url);
  return m && m[1] === mint ? m[2] : null;
}

export const LOGO_TYPES = new Set(["image/png", "image/webp"]);

/** Approval / envelope: `logo_hash` when sent (contracts c99b114); else (4e0d7f3 servers) recover `v` from `logo_url`. */
export function logoHashOf(w: { logo_hash?: unknown; logo_url?: unknown }, mint: string | null | undefined): string | null | undefined {
  return "logo_hash" in w ? logoHashFromWire(w.logo_hash) : logoHashFromUrl(w.logo_url, mint);
}
