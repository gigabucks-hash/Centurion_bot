/** Types for `@centurion/i18n/format.mjs` (packages/i18n 0.4.8, UX-owned JS; read-only for Desktop). */
declare module "@centurion/i18n/format.mjs" {
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
  // 0.4.6+ (contracts 1.1.4)
  export function formatBps(bps: number | null | undefined, loc: Lang): string;
  export function formatLamportsOrDash(l: string | bigint | null | undefined, loc: Lang, o?: { kind?: "amount" | "pnl"; paper?: boolean }): string;
  export function formatRawQty(raw: string | null | undefined, decimals: number | null | undefined, loc: Lang): string;
  export interface QuoteState { state: "missing" | "fresh" | "stale"; ageS: number | null; expiresInS: number | null; complete: boolean; blocksApprove: boolean }
  export function quoteState(q: { quote_ts?: string | null; quote_expires_at?: string | null }, skewMs?: number, o?: { mode?: "practice" | "real"; localNowMs?: number }): QuoteState;
  export function formatRelativeSeconds(sec: number, loc: Lang): string;
  export function formatMcapUsd(usd: string | number | null | undefined, loc: Lang): string;
  export function formatMcapSol(lamports: string | null | undefined, loc: Lang): string;
  // 0.4.7
  export function showAtaRent(v: string | null | undefined): boolean;
  export const DASH: string;
  export function quoteChanged(prev: { quote_id?: string | null } | null | undefined, next: { quote_id?: string | null } | null | undefined): boolean;
  export function mcapView(c: { mcap_source?: string | null; market_cap_lamports?: string | null; mcap_usd?: string | null }, loc: Lang): { primary: string; secondary: string | null; sourceKey: string | null; tooltipKeys: string[] };
}
