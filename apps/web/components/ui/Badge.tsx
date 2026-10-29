import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "brand" | "profit" | "loss" | "warning" | "guard" | "info" | "practice" | "real";

const tones: Record<Tone, string> = {
  neutral: "bg-bg-raised text-text-secondary border-border-default",
  brand: "bg-brand-primaryContainer text-brand-onPrimaryContainer border-brand-primary/40",
  profit: "bg-semantic-profitContainer text-semantic-profit border-semantic-profit/40",
  loss: "bg-semantic-lossContainer text-semantic-loss border-semantic-loss/40",
  warning: "bg-semantic-warningContainer text-semantic-warning border-semantic-warning/40",
  guard: "bg-semantic-guardContainer text-semantic-guard border-semantic-guard/40",
  info: "bg-semantic-infoContainer text-semantic-info border-semantic-info/40",
  practice: "bg-mode-practiceContainer text-mode-practice border-mode-practice/50",
  real: "bg-mode-real text-mode-onReal border-mode-real",
};

/** Chip / badge. Always carries text — colour is never the only signal. */
export function Badge({ tone = "neutral", children, className, icon, upper, title }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode; upper?: boolean; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-caption font-medium", upper && "text-overline uppercase tracking-wide", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
