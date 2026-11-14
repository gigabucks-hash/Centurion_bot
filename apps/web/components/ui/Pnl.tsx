"use client";
import { cn } from "./cn";
import { useFmt, useT } from "@/lib/i18n/client";
import type { TradingMode } from "@/lib/types";
import { isUnknownMoney, pnlDisplay, PNL_TEXT_CLASS } from "@/lib/pnl";

/** 2 dp for |SOL| ≥ 0.01. Returns null when the helper's own precision should stand. */
function twoDp(sol: number | string | null | undefined, sign: string, locale: "en" | "id"): string | null {
  if (typeof sol !== "number" && typeof sol !== "string") return null;
  const n = typeof sol === "number" ? sol : Number(sol);
  if (!Number.isFinite(n) || Math.abs(n) < 0.01) return null;
  const body = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
  return `${sign}${body}`;
}

/**
 * Shared PnL (T-15) rendered straight from @centurion/i18n `pnlSol()` / `pnlPct()` output ({text, tone, arrow, sign}):
 * exact zero → "0.00" neutral, no arrow, no sign; any non-zero → ▲/▼ + +/− + profit/loss tone, tiny values
 * "<0.000001" (never "0"). Colour comes from the helper's tone, so text, arrow and colour cannot disagree.
 * Never colour-only (sr text too). `lamports` = exact wire string; `sol` = number or decimal string; `pct` = 8.4 for 8.4 %.
 */
/**
 * `wrapUnit`: lets the unit suffix move to the next line inside a narrow KPI cell (D1) instead of
 * overflowing the cell; the number itself never wraps.
 */
export function Pnl({ sol, pct, lamports, className, unit = false, wrapUnit = false, mode }: { sol?: number | string | null; pct?: number | null; lamports?: string; className?: string; unit?: boolean; wrapUnit?: boolean; digits?: number; mode?: TradingMode }) {
  const t = useT();
  const f = useFmt();
  // A null is "not reported" (no mark price, no portfolio value): show an em dash, never a fabricated 0.00.
  // A non-finite number (NaN from an unparsable decimal) is the same case: `pnlSol()` would print "0.00".
  if ((sol !== undefined && isUnknownMoney(sol)) || (pct !== undefined && isUnknownMoney(pct))) {
    return <span className={cn("num", className)} aria-label={t.ux("common.value.unavailable")}>—</span>;
  }
  const paper = (mode ?? f.mode) === "practice";
  const d = pnlDisplay(lamports != null ? { lamports } : sol != null ? { sol } : { pct: pct ?? 0 }, f.locale, { paper, unit: lamports != null || sol != null ? unit : undefined });
  // Unit suffix comes from the package as "…\u00A0paper SOL": render it one step smaller so hero numbers keep
  // their digits readable inside a KPI cell. Tone, arrow and sign still come from pnlDisplay. Values at least
  // 0.01 SOL are shown at 2 decimals so a column does not mix 2 dp and 4 dp; smaller amounts keep the helper's
  // extra places so a real position never prints as a flat zero.
  const [rawMain, ...rest] = d.text.split("\u00A0");
  const fixed = lamports == null && pct === undefined ? twoDp(sol, d.sign, f.locale) : null;
  const main = fixed ?? rawMain;
  const unitText = rest.join("\u00A0");
  const number = (
    <>
      {d.arrow && <span aria-hidden>{d.arrow} </span>}
      <span className="sr-only">{t(d.tone === "neutral" ? "common.flat" : d.tone === "profit" ? "common.up" : "common.down")} </span>
      {main}
    </>
  );
  if (wrapUnit) {
    return (
      <span className={cn("num whitespace-normal", PNL_TEXT_CLASS[d.tone], className)} data-pnl-tone={d.tone}>
        <span className="whitespace-nowrap">{number}</span>
        {unitText && <span className="text-caption font-normal"> {unitText}</span>}
      </span>
    );
  }
  return (
    <span className={cn("num whitespace-nowrap", PNL_TEXT_CLASS[d.tone], className)} data-pnl-tone={d.tone}>
      {number}
      {unitText && <span className="text-caption font-normal">{"\u00A0"}{unitText}</span>}
    </span>
  );
}
