/**
 * Deterministic coin identicon from the mint (base58 string): FNV-1a 32-bit → hue + a 5×5 left-right symmetric grid.
 * Pure and shared by the client <CoinAvatar> fallback and the server image proxy (same picture on both sides).
 * Input is validated as base58 (32–44 chars); anything else yields a neutral grey glyph.
 */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface Identicon { hue: number; cells: boolean[]; valid: boolean }

export function identicon(mint: string): Identicon {
  const valid = BASE58.test(mint);
  const h1 = fnv1a(valid ? mint : "invalid");
  const h2 = fnv1a(`${mint}:grid`);
  const cells: boolean[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const col = c < 3 ? c : 4 - c; // mirror
      cells.push(((h2 >>> (r * 3 + col)) & 1) === 1);
    }
  }
  if (!cells.some(Boolean)) cells[12] = true;
  return { hue: h1 % 360, cells, valid };
}

export const identiconColors = (hue: number, valid = true) =>
  valid ? { bg: `hsl(${hue} 45% 18%)`, fg: `hsl(${hue} 70% 62%)` } : { bg: "hsl(220 10% 20%)", fg: "hsl(220 8% 55%)" };

/** Standalone SVG document (server proxy fallback). Numbers/colours only — no user text is interpolated. */
export function identiconSvg(mint: string, size = 64): string {
  const { hue, cells, valid } = identicon(mint);
  const { bg, fg } = identiconColors(hue, valid);
  const rects = cells.map((on, i) => (on ? `<rect x="${(i % 5) + 1.5}" y="${Math.floor(i / 5) + 1.5}" width="1" height="1"/>` : "")).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 8 8"><rect width="8" height="8" rx="4" fill="${bg}"/><g fill="${fg}">${rects}</g></svg>`;
}

export const isMint = (s: string) => BASE58.test(s);
