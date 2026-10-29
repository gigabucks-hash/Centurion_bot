"use client";
import { cn } from "./cn";
import { useFmt, useT } from "@/lib/i18n/client";

/** PnL is never colour-only: ▲/▼ + sign + colour + mono number. Zero = neutral "±0". */
export function Pnl({ sol, pct, className, unit = false }: { sol?: number; pct?: number; className?: string; unit?: boolean; digits?: number }) {
  const t = useT();
  const f = useFmt();
  const v = sol ?? pct ?? 0;
  const zero = Math.abs(v) < 1e-9;
  const color = zero ? "text-semantic-neutralPnl" : v > 0 ? "text-semantic-profit" : "text-semantic-loss";
  const arrow = zero ? "" : v > 0 ? "▲ " : "▼ ";
  const text = zero ? "±0" : sol != null ? f.sol(sol, { sign: true, unit }) : f.pct(pct ?? 0);
  return (
    <span className={cn("num whitespace-nowrap", color, className)}>
      <span aria-hidden>{arrow}</span>
      <span className="sr-only">{t(zero ? "common.flat" : v > 0 ? "common.up" : "common.down")} </span>
      {text}
    </span>
  );
}
