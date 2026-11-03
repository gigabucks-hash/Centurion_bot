/**
 * Deterministic coin identicon (UX COIN_LOGO.md Rev 6.1 §4; reference ux-solbot/visual/src/identicon.ts + vectors.mjs,
 * same on Web, Desktop and Flutter): palette index = FNV-1a 32-bit over the UTF-8 bytes of the trimmed mint, mod 12;
 * background `coin.identicon.palette.{idx}`, initials `coin.identicon.fg` (#F4F6FB), Inter 700.
 * Initials: drop leading `$`, first 2 ASCII [A-Za-z0-9] chars, uppercased; none → "•" (U+2022).
 * Pure: no user text reaches markup except the 1–2 validated initials.
 */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const IDENTICON_PALETTE = ["#8A2E3B", "#8A4A1F", "#6E5A12", "#4C6A1A", "#1F6B3A", "#146560", "#16607E", "#2A4F94", "#4A3F9C", "#6A3592", "#86306F", "#5A5F6E"] as const;
export const IDENTICON_FG = "#F4F6FB";

const utf8 = new TextEncoder();
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (const b of utf8.encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const paletteIndex = (mint: string): number => fnv1a32(mint.trim()) % 12;

export function initials(symbol: string | null | undefined): string {
  const al = [...(symbol ?? "").replace(/^\$+/, "")].filter((c) => /^[A-Za-z0-9]$/.test(c)).slice(0, 2).join("");
  return al ? al.toUpperCase() : "\u2022";
}

export interface Identicon { index: number; bg: string; bgVar: string; fg: string; fgVar: string; text: string; fontPct: number }

/** Everything the avatar needs; colours as token CSS vars with the spec hex as fallback. */
export function identicon(mint: string, symbol?: string | null): Identicon {
  const index = paletteIndex(mint);
  const text = initials(symbol);
  return {
    index, bg: IDENTICON_PALETTE[index], bgVar: `var(--color-identicon-${index}, ${IDENTICON_PALETTE[index]})`,
    fg: IDENTICON_FG, fgVar: `var(--color-identicon-fg, ${IDENTICON_FG})`,
    text, fontPct: text.length === 2 ? 42 : 50,
  };
}

export const isMint = (s: string) => BASE58.test(s);
