/** Types for @sentra/i18n/format (format.mjs 0.4.2 ships without .d.ts; owned by UX, typed here). */
declare module "@sentra/i18n/format" {
  export const LOCALES: { en: string; id: string };
  type SolOpts = { kind?: "amount" | "pnl"; paper?: boolean };
  export function formatSol(v: number, loc: string, o?: SolOpts): string;
  export function formatPct(r: number, loc: string, o?: { signed?: boolean; dp?: number }): string;
  export function formatUsd(v: number, loc: string): string;
  export function formatCompact(v: number, loc: string): string;
  export function formatInt(v: number, loc: string): string;
  export function formatCountdown(ms: number): string;
  /** 0.4.3: UI percent (0.01–100) → contract fraction_bps (1–10000); RangeError "INVALID_FRACTION" outside. */
  export function pctToFractionBps(pct: number): number;
  export function fractionBpsToPct(bps: number | string): number;
  export function formatFractionBps(bps: number | string, loc: "en" | "id"): string;
  export function formatTime(d: number | Date, loc: string, tz: string): string;
  export function formatDateTime(d: number | Date, loc: string, tz: string): string;
  export function formatRelative(sec: number, loc: string): string;
  /** Lamport integer string → SOL number (BigInt split, no float parse of the whole value). */
  export function lamportsToSol(lamports: string): number;
  export function formatLamports(lamports: string, loc: string, o?: SolOpts): string;
  export function formatSolVar(s: string, loc: string, o?: SolOpts): string;
  export function skewFrom(serverNowIso: string, localNowMs?: number): number;
  export type PnlOut = { text: string; tone: "profit" | "loss" | "neutral"; arrow: "\u25B2" | "\u25BC" | ""; sign: "+" | "\u2212" | "" };
  /** T-15: number SOL, or lamport string/bigint. Exact 0 → "0.00 SOL" neutral; tiny non-zero → "<0.000001" signed. */
  export function pnlSol(v: number | string | bigint, loc: string, o?: { paper?: boolean }): PnlOut;
  /** Ratio in (0.084 = 8.4%). Exact 0 → "0.0%" neutral; tiny non-zero → "<0.1%" signed. */
  export function pnlPct(r: number, loc: string, o?: { dp?: number }): PnlOut;
  export function remainingMs(untilIso: string, skewMs: number, localNowMs?: number): number;
}
