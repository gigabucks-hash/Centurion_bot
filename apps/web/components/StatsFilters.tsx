"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/client";

/** Mode is NOT a filter: stats always show the current workspace only. */
export function StatsFilters({ strategies }: { strategies: { id: string; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const q = new URLSearchParams(sp.toString());
    if (v) q.set(k, v);
    else q.delete(k);
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  };
  const sel = "h-9 rounded-md border border-border-default bg-bg-inset px-2 text-caption text-text-primary";
  return (
    <div className="flex flex-wrap gap-2">
      <select aria-label={t("common.strategy")} className={sel} value={sp.get("strategy") ?? ""} onChange={(e) => set("strategy", e.target.value)}>
        <option value="">{t("common.allStrategies")}</option>
        {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select aria-label={t("stats.window")} className={sel} value={sp.get("window") ?? ""} onChange={(e) => set("window", e.target.value)}>
        <option value="">{t("stats.allTime")}</option>
        <option value="168">{t("stats.d7")}</option>
        <option value="72">{t("stats.d3")}</option>
        <option value="24">{t("stats.h24")}</option>
      </select>
    </div>
  );
}
