import type { ReactNode } from "react";
import { cn } from "./cn";

/** KPI card: muted label, large tabular value, one hint line. */
export function StatTile({ label, value, hint, tone = "neutral", icon, className }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "profit" | "loss" | "warning";
  icon?: ReactNode;
  className?: string;
}) {
  const color = { neutral: "text-text-primary", profit: "text-semantic-profit", loss: "text-semantic-loss", warning: "text-semantic-warning" }[tone];
  return (
    <div className={cn("flex min-h-[96px] flex-col justify-center rounded-md border border-border-subtle bg-bg-surface px-4 py-3", className)}>
      <div className="flex items-center justify-between text-caption text-text-tertiary">
        <span>{label}</span>
        {icon && <span>{icon}</span>}
      </div>
      {/* QA-09: nowrap keeps amount + unit together on a narrow tile. */}
      <div className={cn("num mt-1 min-w-0 whitespace-nowrap text-[22px] leading-7 font-semibold tracking-tight", color)}>{value}</div>
      {hint && <div className="mt-1 line-clamp-1 text-caption text-text-tertiary">{hint}</div>}
    </div>
  );
}
