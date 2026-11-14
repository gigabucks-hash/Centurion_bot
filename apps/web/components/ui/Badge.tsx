import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "brand" | "profit" | "loss" | "warning" | "guard" | "info" | "practice" | "real";

const tones: Record<Tone, string> = {
  neutral: "bg-transparent text-text-secondary border-transparent",
  brand: "bg-brand-primaryContainer text-brand-onPrimaryContainer border-transparent",
  profit: "bg-semantic-profitContainer text-semantic-profit border-transparent",
  loss: "bg-semantic-lossContainer text-semantic-loss border-transparent",
  warning: "bg-semantic-warningContainer text-semantic-warning border-transparent",
  guard: "bg-semantic-guardContainer text-semantic-guard border-transparent",
  info: "bg-bg-raised text-text-secondary border-transparent",
  practice: "bg-transparent text-text-secondary border-transparent",
  real: "bg-semantic-lossContainer text-semantic-loss border-transparent",
};

/** Quiet status label. Always carries text — colour is never the only signal. */
export function Badge({ tone = "neutral", children, className, icon, upper, title }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode; upper?: boolean; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-px text-caption", upper && "text-[11px] uppercase tracking-wide", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
