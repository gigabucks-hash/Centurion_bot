import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

type Tone = "neutral" | "profit" | "loss" | "warning";

export type StatItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  /** The whole cell becomes a link (Approvals cell → /approvals). */
  href?: string;
};

const TONE: Record<Tone, string> = {
  neutral: "text-text-primary",
  profit: "text-semantic-profit",
  loss: "text-semantic-loss",
  warning: "text-semantic-warning",
};

/** Static class strings so Tailwind emits them (no dynamic `sm:grid-cols-${n}`). */
const COLS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" } as const;

const CELL = "flex min-w-0 flex-col bg-bg-surface p-4";

/**
 * G1-blue KPI strip (UX G3 §3.4): ONE bordered container — cells are separated by 1 px `border.subtle`
 * rules on both axes (bg-border-subtle showing through a 1 px grid gap), never a row of separate cards.
 * Server component: no hooks, links stay plain <Link>.
 */
export function StatStrip({ items, columns = 4, className, label }: {
  items: StatItem[];
  columns?: keyof typeof COLS;
  className?: string;
  /** Accessible name for the strip as a group (e.g. "Key figures"). */
  label?: string;
}) {
  return (
    <div
      {...(label ? { role: "group", "aria-label": label } : {})}
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle",
        COLS[columns],
        className,
      )}
    >
      {items.map((item, i) => {
        const body = (
          <>
            <span className="text-overline uppercase tracking-wide text-text-tertiary">{item.label}</span>
            <span className={cn("num mt-1.5 min-w-0 whitespace-nowrap text-numSm sm:text-numLg", TONE[item.tone ?? "neutral"])}>{item.value}</span>
            {item.hint && <span className="mt-1 text-caption text-text-tertiary">{item.hint}</span>}
          </>
        );
        return item.href ? (
          <Link key={i} href={item.href} className={cn(CELL, "transition duration-fast hover:bg-bg-raised focus-visible:outline-2")}>{body}</Link>
        ) : (
          <div key={i} className={CELL}>{body}</div>
        );
      })}
    </div>
  );
}