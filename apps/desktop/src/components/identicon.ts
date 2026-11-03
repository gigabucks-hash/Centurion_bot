/**
 * Deterministic coin identicon (COIN_LOGO §4, same result on every platform). Own implementation of the
 * spec algorithm; checked against the spec's test vectors in scripts/ui-format.test.mjs.
 *   index    = FNV-1a 32-bit over the UTF-8 bytes of the trimmed mint, mod 12 → --color-identicon-{index}
 *   initials = first two ASCII [A-Za-z0-9] of the symbol (leading "$" removed), uppercased; none → "•"
 */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
export const IDENTICON_COLORS = 12;

export function fnv1a32(text: string): number {
  let hash = FNV_OFFSET;
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i++) {
    hash = Math.imul(hash ^ bytes[i], FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export const identiconIndex = (mint: string): number => fnv1a32(mint.trim()) % IDENTICON_COLORS;

export function identiconInitials(symbol: string): string {
  let out = "";
  for (const ch of symbol.replace(/^\$+/, "")) {
    if (/^[A-Za-z0-9]$/.test(ch)) out += ch;
    if (out.length === 2) break;
  }
  return out ? out.toUpperCase() : "\u2022";
}
