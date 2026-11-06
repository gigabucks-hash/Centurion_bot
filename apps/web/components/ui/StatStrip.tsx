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
const COLS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  // Five KPIs at 22 px do not fit five columns on a 1024 screen; a 6-track grid keeps the numbers
  // readable (3 cells on row 1, 2 wider cells on row 2) and fills the row without an empty cell.
  5: "md:grid-cols-6 xl:grid-cols-5",
} as const;

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
        // 6-track fallback: 2 + 2 + 2 on row 1, 3 + 3 on row 2, no empty cell; 5 equal cells from xl.
        const span = columns === 5 ? (i < 3 ? "md:col-span-2 xl:col-span-1" : "md:col-span-3 xl:col-span-1") : "";
        const body = (
          <>
            <span className="text-overline uppercase tracking-wide text-text-tertiary">{item.label}</span>
            <span
              className={cn(
                "num mt-1.5 min-w-0 whitespace-normal",
                // 5 cells: caption size only on phones (2 columns), full size from sm up (2 then 3 then 5 columns).
                "text-numSm sm:text-numLg",
                TONE[item.tone ?? "neutral"],
              )}
            >
              {item.value}
            </span>
            {item.hint && <span className="mt-1 text-caption text-text-tertiary">{item.hint}</span>}
          </>
        );
        return item.href ? (
          <Link key={i} href={item.href} className={cn(CELL, span, "transition duration-fast hover:bg-bg-raised focus-visible:outline-2")}>{body}</Link>
        ) : (
          <div key={i} className={cn(CELL, span)}>{body}</div>
        );
      })}
    </div>
  );
}