"use client";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/**
 * Persistent, non-dismissable mode strip (SPEC §1). Per-strategy mode (contracts 1.1.6): while every strategy runs in
 * Paper it is the same Paper strip as before; once any strategy runs in Real it switches to the Real treatment with
 * the "{real_count} Real · {paper_count} Paper" summary so Real is never out of sight.
 */
export function ModeBanner({ realCount, paperCount }: { realCount: number; paperCount: number }) {
  const t = useT();
  const real = realCount > 0;
  return (
    <div
      role="status"
      className={cn(
        "flex h-8 items-center px-4 text-label font-semibold",
        real ? "bg-mode-real text-mode-onReal" : "stripes-practice bg-mode-practiceContainer text-mode-practice",
      )}
    >
      {real ? <span>● {t.ux("strategy.list.summary", { real_count: realCount, paper_count: paperCount })}</span> : <span>{t("mode.bannerPractice")}</span>}
    </div>
  );
}
