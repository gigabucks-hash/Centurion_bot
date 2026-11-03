import localFont from "next/font/local";

/**
 * Inter 700 for identicon initials only (UX COIN_LOGO §4). Self-hosted subset (A-Z, 0-9, •; ~4 KB) generated from
 * packages/design-tokens/fonts/Inter-Bold.ttf (sha256 2883160…947f) by scripts/identicon-font.sh. No external fetch,
 * not preloaded (loaded only when an identicon is on screen).
 */
export const identiconFont = localFont({
  src: "./inter-bold-initials.woff",
  weight: "700",
  style: "normal",
  display: "swap",
  preload: false,
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: false,
});
