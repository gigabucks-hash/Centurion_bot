import type { ReactNode } from "react";
import { cn } from "./cn";

/** KPI card: label, big mono number, hint. */
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
    <div className={cn("rounded-lg border border-border-subtle bg-bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center justify-between text-label text-text-secondary">
        <span>{label}</span>
        {icon && <span className="text-text-tertiary">{icon}</span>}
      </div>
      {/* QA-09: compact on 2-up mobile tiles so "−9.83 paper SOL" never overflows; nowrap keeps amount + unit together. */}
      <div className={cn("num mt-2 min-w-0 whitespace-nowrap text-numSm sm:text-numLg", color)}>{value}</div>
      {hint && <div className="mt-1 text-caption text-text-tertiary">{hint}</div>}
    </div>
  );
}
