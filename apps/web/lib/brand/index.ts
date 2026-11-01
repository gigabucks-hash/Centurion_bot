/**
 * Brand (Boss 2026-10-29): product name "Centurion Trade" from @sentra/i18n app.name (0.4.7+). Package names stay
 * @sentra/*. Colours are the design-token values (packages/design-tokens tokens.css, dark theme) because metadata,
 * the manifest and generated images cannot read CSS variables.
 */
import en from "@sentra/i18n/en.json" with { type: "json" };

export const APP_NAME: string = en.app.name; // "Centurion Trade"
export const APP_SHORT_NAME = "Centurion";
export const APP_TITLE: string = en.app.title; // "Centurion Trade · Solana trading bot"
export const APP_DESCRIPTION = "Private dashboard for our Solana trading bot: picks, approvals, positions and exit stats. Mock data build.";
export const BRAND_COLORS = { canvas: "#0B0E14", surface: "#121722", primary: "#8B97FF" } as const;
/** Desktop SIWS hand-off returns here (i18n 0.4.8: scheme centurion://, lead decision). */
export const DESKTOP_AUTH_URI = "centurion://auth";
