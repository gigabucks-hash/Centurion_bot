"use client";
import { cn } from "./cn";
import { useFmt, useT } from "@/lib/i18n/client";
import { pnlDisplay, PNL_TEXT_CLASS } from "@/lib/pnl";

/**
 * Shared PnL (T-15) rendered straight from @sentra/i18n `pnlSol()` / `pnlPct()` output ({text, tone, arrow, sign}):
 * exact zero → "0.00" neutral, no arrow, no sign; any non-zero → ▲/▼ + +/− + profit/loss tone, tiny values
 * "<0.000001" (never "0"). Colour comes from the helper's tone, so text, arrow and colour cannot disagree.
 * Never colour-only (sr text too). `lamports` = exact wire string; `sol` = number or decimal string; `pct` = 8.4 for 8.4 %.
 */
export function Pnl({ sol, pct, lamports, className, unit = false }: { sol?: number | string; pct?: number; lamports?: string; className?: string; unit?: boolean; digits?: number }) {
  const t = useT();
  const f = useFmt();
  const paper = f.mode === "practice";
  const d = pnlDisplay(lamports != null ? { lamports } : sol != null ? { sol } : { pct: pct ?? 0 }, f.locale, { paper, unit: lamports != null || sol != null ? unit : undefined });
  return (
    <span className={cn("num whitespace-nowrap", PNL_TEXT_CLASS[d.tone], className)} data-pnl-tone={d.tone}>
      {d.arrow && <span aria-hidden>{d.arrow} </span>}
      <span className="sr-only">{t(d.tone === "neutral" ? "common.flat" : d.tone === "profit" ? "common.up" : "common.down")} </span>
      {d.text}
    </span>
  );
}
