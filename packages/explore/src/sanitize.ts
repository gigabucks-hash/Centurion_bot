/**
 * Untrusted token text. Same rules as apps/web/lib/untrusted.ts: drop C0/C1 controls, bidi
 * overrides, and invisible formatting characters, then NFC, collapse whitespace, and cap
 * the length in code points. The result is plain text. Callers must not parse it as HTML.
 */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const INVISIBLE = /[\u00AD\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200D\u2060-\u2064\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]/g;

export const SYMBOL_MAX = 16;
export const NAME_MAX = 48;

export function safeText(input: unknown, max = NAME_MAX): string {
  if (typeof input !== "string") return "";
  const clean = input.normalize("NFC").replace(CONTROL, " ").replace(BIDI, "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  const cps = Array.from(clean);
  return cps.length > max ? `${cps.slice(0, max - 1).join("")}…` : clean;
}

export const safeSymbol = (s: unknown) => safeText(s, SYMBOL_MAX).replace(/^\$+/, "");
export const safeName = (s: unknown) => safeText(s, NAME_MAX);

/** Jupiter's own icon CDN, path-locked. Every other icon URL is dropped (no SSRF, no remote HTML). */
export const ICON_RE = /^https:\/\/static\.datapi\.jup\.ag\/token-icons\/[a-f0-9]{64}\.(?:webp|png|jpe?g)$/;

export function safeIcon(input: unknown): string | null {
  return typeof input === "string" && ICON_RE.test(input) ? input : null;
}

export const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isMint(input: unknown): input is string {
  return typeof input === "string" && MINT_RE.test(input);
}
