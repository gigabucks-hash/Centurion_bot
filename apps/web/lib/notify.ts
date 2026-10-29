/**
 * N-05 `order.failed` (contracts 1.1.2, @sentra/i18n 0.4.1): `notif.failed.title|body` with wire vars
 * {side, symbol, reason_code, amount_lamports, mode}. reason_code → `order.fail_reason.<code lower>` (unknown →
 * `.unknown`, never the raw code); amount_lamports → formatLamports (exact BigInt split) in the UI locale.
 */
import { formatLamports } from "@sentra/i18n/format";
import type { T } from "./i18n";
import type { TradingMode } from "./types";

const FAIL_REASONS = new Set(["slippage_exceeded", "insufficient_practice_balance", "guard_failed", "unsupported_quote_mint", "pool_stale"]);

export const isOrderFailReason = (code: string) => FAIL_REASONS.has(code.toLowerCase());

export interface OrderFailedVars {
  side: "buy" | "sell";
  symbol: string;
  reason_code: string;
  amount_lamports: string;
  mode: TradingMode;
}

export function failReasonText(t: T, code: string): string {
  const k = code.toLowerCase();
  return t.ux(`order.fail_reason.${FAIL_REASONS.has(k) ? k : "unknown"}` as Parameters<T["ux"]>[0]);
}

export function orderFailedText(t: T, v: OrderFailedVars): { title: string; body: string } {
  const amount = formatLamports(v.amount_lamports, t.locale === "id" ? "id" : "en", { paper: v.mode === "practice" });
  const base = { side: v.side, symbol: v.symbol, mode: v.mode };
  return {
    title: t.ux("notif.failed.title", base),
    body: t.ux("notif.failed.body", { ...base, reason_code: failReasonText(t, v.reason_code), amount_lamports: amount }),
  };
}
