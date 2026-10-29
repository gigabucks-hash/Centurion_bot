"use client";
import { fmtPct, fmtSol } from "@/lib/format";
import { cn } from "./cn";
import { useT } from "@/lib/i18n/client";

/** PnL is never colour-only: ▲/▼ + sign + colour + mono number. Zero = neutral "±0". */
export function Pnl({ sol, pct, className, unit = false, digits = 3 }: { sol?: number; pct?: number; className?: string; unit?: boolean; digits?: number }) {
  const t = useT();
  const v = sol ?? pct ?? 0;
  const zero = Math.abs(v) < 1e-9;
  const color = zero ? "text-semantic-neutralPnl" : v > 0 ? "text-semantic-profit" : "text-semantic-loss";
  const arrow = zero ? "" : v > 0 ? "▲ " : "▼ ";
  const text = zero ? "±0" : sol != null ? fmtSol(sol, { sign: true, digits, unit }) : fmtPct(pct ?? 0);
  return (
    <span className={cn("num whitespace-nowrap", color, className)}>
      <span aria-hidden>{arrow}</span>
      <span className="sr-only">{t(zero ? "common.flat" : v > 0 ? "common.up" : "common.down")} </span>
      {text}
    </span>
  );
}
