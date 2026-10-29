"use client";
import { useMemo, useState } from "react";
import type { EventKind, TradeEvent } from "@/lib/types";
import { useRealtime } from "@/components/shell/RealtimeProvider";
import { Segmented } from "@/components/ui/client";
import { EventRow } from "@/components/EventRow";
import { useT } from "@/lib/i18n/client";

export const FEED_FILTERS: { id: "all" | "buys" | "sells" | "guard" | "proposals"; kinds: EventKind[] | null; actors?: string[] }[] = [
  { id: "all", kinds: null },
  { id: "buys", kinds: ["bought"] },
  { id: "sells", kinds: ["sold"] },
  { id: "guard", kinds: ["blocked", "passed"], actors: ["guard"] },
  { id: "proposals", kinds: ["proposal", "approved", "skipped", "expired"] },
];

export function filterEvents(list: TradeEvent[], id: string) {
  const f = FEED_FILTERS.find((x) => x.id === id);
  if (!f?.kinds) return list;
  return list.filter((e) => f.kinds!.includes(e.kind) && (!f.actors || f.actors.includes(e.actor)));
}

/** Compact live feed for the dashboard card. */
export function OverviewFeed({ initial, names }: { initial: TradeEvent[]; names: Record<string, string> }) {
  const t = useT();
  const { events } = useRealtime();
  const [f, setF] = useState("all");
  const list = useMemo(() => filterEvents([...events, ...initial], f).slice(0, 8), [events, initial, f]);
  return (
    <>
      <Segmented size="sm" label={t("feed.filter")} value={f} onChange={setF} options={FEED_FILTERS.map((x) => ({ value: x.id, label: t(`feed.${x.id}`) }))} />
      <ul className="mt-2">
        {list.map((e) => (
          <EventRow key={e.id} e={e} strategyName={names[e.strategyId ?? ""]} />
        ))}
        {list.length === 0 && <li className="py-6 text-center text-caption text-text-tertiary">{t("feed.empty")}</li>}
      </ul>
    </>
  );
}
