import localFont from "next/font/local";

/** Schibsted Grotesk, latin, OFL. Files live with the design tokens so the desktop shell can use the same bytes. */
export const sans = localFont({
  src: [
    { path: "../../../../packages/design-tokens/fonts/ui/schibsted-grotesk-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../../packages/design-tokens/fonts/ui/schibsted-grotesk-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../../../packages/design-tokens/fonts/ui/schibsted-grotesk-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../../../packages/design-tokens/fonts/ui/schibsted-grotesk-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-schibsted",
  display: "swap",
  fallback: ["Segoe UI", "system-ui", "sans-serif"],
});

/** Martian Mono, latin, OFL. Addresses, hashes, and tabular prices. */
export const mono = localFont({
  src: [
    { path: "../../../../packages/design-tokens/fonts/ui/martian-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../../packages/design-tokens/fonts/ui/martian-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-martian",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});
