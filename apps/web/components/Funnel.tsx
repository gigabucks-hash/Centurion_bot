"use client";
import { useFmt } from "@/lib/i18n/client";
import type { StrategyFunnel } from "@/lib/types";
import { FUNNEL_STAGES } from "@/lib/types";

import { useT } from "@/lib/i18n/client";

/**
 * MVP funnel (Apex decision): horizontal bars + step conversion %.
 * Bar width is log-scaled so late stages stay visible; exact counts are always printed.
 * A Sankey view can replace this later.
 */
export function Funnel({ funnel }: { funnel: StrategyFunnel }) {
  const t = useT();
  const f = useFmt();
  const max = Math.max(1, funnel.scanned);
  const width = (n: number) => (n <= 0 ? 0 : Math.max(3, (Math.log10(n + 1) / Math.log10(max + 1)) * 100));
  return (
    <ol className="flex flex-col gap-1.5" aria-label={t("strategies.funnel")}>
      {FUNNEL_STAGES.map((stage, i) => {
        const n = funnel[stage];
        const prev = i === 0 ? null : funnel[FUNNEL_STAGES[i - 1]];
        const conv = prev != null ? (prev > 0 ? (n / prev) * 100 : 0) : null;
        return (
          <li key={stage} className="grid grid-cols-[5rem_1fr_6rem] items-center gap-2 text-caption">
            <span className="text-text-secondary">{t(`strategies.stage.${stage}`)}</span>
            <span className="h-4 rounded-xs bg-bg-sunken">
              <span className="block h-4 rounded-xs bg-brand-primary" style={{ width: `${width(n).toFixed(2)}%`, opacity: Number((1 - i * 0.13).toFixed(2)) }} />
            </span>
            <span className="num text-right text-numSm text-text-primary">
              {f.int(n)}
              {conv != null && <span className="ml-1 text-caption text-text-tertiary">{f.num(conv, conv < 10 ? 1 : 0)}%</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
