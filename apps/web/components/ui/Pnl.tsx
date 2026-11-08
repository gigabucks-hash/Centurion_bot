"use client";
import { cn } from "./cn";
import { useFmt, useT } from "@/lib/i18n/client";
import type { TradingMode } from "@/lib/types";
import { isUnknownMoney, pnlDisplay, PNL_TEXT_CLASS } from "@/lib/pnl";

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
  // Unit suffix comes from the package as "…\u00A0paper SOL": render it one step smaller so hero numbers (28 px) keep
  // their digits readable inside a KPI cell instead of overflowing the divider. No re-formatting, no re-rounding.
  const [main, ...rest] = d.text.split("\u00A0");
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
