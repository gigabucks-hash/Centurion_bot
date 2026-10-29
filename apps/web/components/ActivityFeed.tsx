"use client";
import { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { TradeEvent } from "@/lib/types";
import { useRealtime } from "@/components/shell/RealtimeProvider";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { Segmented } from "@/components/ui/client";
import { EventRow } from "@/components/EventRow";
import { FEED_FILTERS, filterEvents } from "@/components/OverviewFeed";
import { useT } from "@/lib/i18n/client";

export function ActivityFeed({ initial, strategyNames }: { initial: TradeEvent[]; strategyNames: Record<string, string> }) {
  const t = useT();
  const { events: live, status, paused, setPaused } = useRealtime();
  const [filter, setFilter] = useState("all");
  const [strategy, setStrategy] = useState("");
  const merged = useMemo(() => filterEvents([...live, ...initial], filter).filter((e) => !strategy || e.strategyId === strategy), [live, initial, filter, strategy]);
  const liveIds = useMemo(() => new Set(live.slice(0, 2).map((e) => e.id)), [live]);

  return (
    <Card
      title={<span className="flex items-center gap-2">{t("feed.live")} <Badge tone={paused ? "neutral" : status === "connected" ? "profit" : status === "connecting" ? "warning" : "loss"}>{paused ? t("feed.paused") : t(`conn.${status}`)}</Badge></span>}
      subtitle={t("feed.newThisSession", { n: live.length })}
      action={<Button size="sm" variant="ghost" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? <Play size={14} /> : <Pause size={14} />} {paused ? t("feed.resume") : t("feed.pause")}</Button>}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented label={t("feed.eventType")} value={filter} onChange={setFilter} options={FEED_FILTERS.map((f) => ({ value: f.id, label: t(`feed.${f.id}`) }))} />
        <select aria-label={t("common.strategy")} value={strategy} onChange={(e) => setStrategy(e.target.value)} className="ml-auto h-8 rounded-md border border-border-default bg-bg-inset px-2 text-caption text-text-primary">
          <option value="">{t("common.allStrategies")}</option>
          {Object.entries(strategyNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      {merged.length === 0 ? (
        <EmptyState title={t("feed.noMatch")} detail={t("feed.noMatchDetail")} />
      ) : (
        <ul aria-live="polite" aria-relevant="additions" className="divide-y divide-border-subtle">
          {merged.slice(0, 150).map((e) => <EventRow key={e.id} e={e} strategyName={strategyNames[e.strategyId ?? ""]} fresh={liveIds.has(e.id)} />)}
        </ul>
      )}
    </Card>
  );
}
