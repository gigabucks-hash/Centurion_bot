/**
 * Untrusted on-chain text (token symbol / name, anything a coin creator controls). React already escapes HTML;
 * this removes what escaping does not: C0/C1 control characters, bidi overrides/isolates (Trojan-Source style
 * spoofing such as "$SOL\u202Egnp.exe"), zero-width / invisible formatting characters and line breaks, then
 * NFC-normalizes, collapses whitespace and caps the length in code points (so a cap never splits a surrogate pair).
 * Never use the result as HTML; it is plain text only.
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

export const safeSymbol = (s: unknown) => safeText(s, SYMBOL_MAX);
export const safeName = (s: unknown) => safeText(s, NAME_MAX);
