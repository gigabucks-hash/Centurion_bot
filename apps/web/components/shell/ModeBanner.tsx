"use client";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/**
 * Persistent, non-dismissable mode strip (SPEC §1). One line, no pattern fill. While every strategy runs in
 * Paper it is the Paper line; once any strategy runs in Real the line names both counts so Real stays visible.
 */
export function ModeBanner({ realCount, paperCount }: { realCount: number; paperCount: number }) {
  const t = useT();
  const real = realCount > 0;
  return (
    <div
      role="status"
      className={cn(
        "flex h-7 items-center gap-3 border-b px-4 text-caption",
        real ? "border-semantic-loss bg-bg-chrome text-semantic-loss" : "border-border-subtle bg-bg-chrome text-text-secondary",
      )}
    >
      {real ? (
        <span className="inline-flex min-w-0 items-center gap-2 font-medium">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-semantic-loss" aria-hidden />
          <span className="truncate">{t.ux("strategy.list.summary", { real_count: realCount, paper_count: paperCount })}</span>
        </span>
      ) : (
        <span className="truncate">{t("mode.bannerPractice")}</span>
      )}
      {/* UX G8 §3.11: honesty marker, always in the first viewport. */}
      <span data-testid="example-data" className="ml-auto shrink-0 text-caption text-text-tertiary">
        {t("common.exampleData")}
      </span>
    </div>
  );
}
