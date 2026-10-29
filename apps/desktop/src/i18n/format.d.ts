/** Types for `@sentra/i18n/format.mjs` (packages/i18n 0.4.3, UX-owned JS; read-only for Desktop). */
declare module "@sentra/i18n/format.mjs" {
  export type Lang = "en" | "id";
  export interface PnlParts { text: string; tone: "profit" | "loss" | "neutral"; arrow: "▲" | "▼" | ""; sign: "+" | "−" | "" }
  export const LOCALES: Record<Lang, string>;
  export function formatSol(v: number, loc: Lang, o?: { kind?: "amount" | "pnl"; paper?: boolean }): string;
  export function pnlSol(v: number | string | bigint, loc: Lang, o?: { paper?: boolean }): PnlParts;
  export function pnlPct(r: number, loc: Lang, o?: { dp?: number }): PnlParts;
  export function formatPct(r: number, loc: Lang, o?: { signed?: boolean; dp?: number }): string;
  export function formatUsd(v: number, loc: Lang): string;
  export function formatCompact(v: number, loc: Lang): string;
  export function formatInt(v: number, loc: Lang): string;
  export function formatCountdown(ms: number): string;
  export function formatTime(d: Date | number, loc: Lang, tz?: string): string;
  export function lamportsToSol(l: string | bigint): number;
  export function formatLamports(l: string | bigint, loc: Lang, o?: { kind?: "amount" | "pnl"; paper?: boolean }): string;
  export function skewFrom(serverNowIso: string, localNowMs?: number): number;
  export function remainingMs(untilIso: string, skewMs: number, localNowMs?: number): number;
  export function pctToFractionBps(pct: number): number;
  export function fractionBpsToPct(bps: number): number;
  export function formatFractionBps(bps: number, loc: Lang): string;
}
