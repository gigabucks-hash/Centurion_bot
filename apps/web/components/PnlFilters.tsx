"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/client";

/**
 * PnL report filters (0022): one mode (tabs), one strategy, one range. The range is the server's
 * enum (`1h|24h|7d|30d|all`) so `/stats/pnl` and `/positions?state=closed` receive the same value.
 */
export function PnlFilters({ strategies }: { strategies: { id: string; name: string }[] }) {
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
  const sel = "h-9 min-w-0 rounded-md border border-border-default bg-bg-sunken px-2 text-caption text-text-primary";
  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-2 sm:flex-none">
      <select aria-label={t("common.strategy")} className={`${sel} flex-1 sm:flex-none`} value={sp.get("strategy") ?? ""} onChange={(e) => set("strategy", e.target.value)}>
        <option value="">{t("common.allStrategies")}</option>
        {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select aria-label={t("stats.window")} className={sel} value={sp.get("window") ?? "7d"} onChange={(e) => set("window", e.target.value)}>
        <option value="24h">{t("pnl.w24h")}</option>
        <option value="7d">{t("pnl.w7d")}</option>
        <option value="30d">{t("pnl.w30d")}</option>
        <option value="all">{t("pnl.wAll")}</option>
      </select>
    </div>
  );
}