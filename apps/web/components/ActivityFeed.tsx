"use client";
import { cmpSeq, minSeq } from "@/lib/seq";
import { Fragment, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { TradeEvent } from "@/lib/types";
import { useRealtime } from "@/components/shell/RealtimeProvider";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { Segmented } from "@/components/ui/client";
import { EventRow } from "@/components/EventRow";
import { VirtualList } from "@/components/ui/VirtualList";
import { FEED_FILTERS, filterEvents } from "@/components/OverviewFeed";
import { useFmt, useT } from "@/lib/i18n/client";
import { request } from "@/lib/client";
import { envelopeToTradeEvent } from "@/lib/contracts";
import { errorText } from "@/lib/errors";
import { TZ } from "@/lib/format";
import type { AnyEvent, EventPage } from "@centurion/contracts/wire";

const PAGE = 100;
const VIRTUAL_AFTER = 150;
const dayKey = (ts: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);

/** QA-16: group rows by WIB day (sticky day headers), page older history by seq (before_seq). */
function groupByDay(events: TradeEvent[]) {
  const out: { key: string; ts: number; items: TradeEvent[] }[] = [];
  for (const e of events) {
    const k = dayKey(e.ts);
    const last = out[out.length - 1];
    if (last?.key === k) last.items.push(e);
    else out.push({ key: k, ts: e.ts, items: [e] });
  }
  return out;
}

/** Per-strategy mode (contracts 1.1.6): the feed merges every mode that has strategies; rows carry their own mode chip. */
export function ActivityFeed({ initial, strategyNames, modes, hasMore: initialHasMore }: { initial: TradeEvent[]; strategyNames: Record<string, string>; modes: ("practice" | "real")[]; hasMore: boolean }) {
  const t = useT();
  const f = useFmt();
  const [older, setOlder] = useState<TradeEvent[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const { events: live, status, paused, setPaused } = useRealtime();
  const [filter, setFilter] = useState("all");
  const [strategy, setStrategy] = useState("");
  const merged = useMemo(() => {
    // Dedupe by envelope id, then order by seq (int64 string → BigInt compare), newest first; ts breaks ties.
    const seen = new Set<string>();
    const all = [...live, ...initial, ...older].filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => cmpSeq(b.seq, a.seq) || b.ts - a.ts);
    return filterEvents(all, filter).filter((e) => !strategy || e.strategyId === strategy);
  }, [live, initial, older, filter, strategy]);
  const groups = useMemo(() => groupByDay(merged), [merged]);
  const today = dayKey(Date.parse(new Date().toISOString()));
  const yesterday = dayKey(Date.parse(new Date().toISOString()) - 86_400_000);

  async function loadMore() {
    const base = [...initial, ...older];
    setLoading(true);
    setLoadErr(null);
    try {
      // `?mode=` stays per request (wire contract); one keyset page per mode, merged.
      const pages = await Promise.all(
        modes.map(async (m) => {
          const cursor = minSeq(base.filter((e) => (e.mode ?? "practice") === m).map((e) => e.seq));
          const { raw } = await request<unknown>(`/events?mode=${m}&limit=${PAGE}${cursor != null ? `&before_seq=${encodeURIComponent(cursor)}` : ""}`);
          const page = raw as unknown as EventPage;
          return { has: page.has_more, items: (page.items as AnyEvent[]).map(envelopeToTradeEvent).filter((e): e is TradeEvent => e != null).map((e) => ({ ...e, mode: e.mode ?? m })) };
        }),
      );
      setOlder((o) => [...o, ...pages.flatMap((p) => p.items)]);
      setHasMore(pages.some((p) => p.has));
    } catch (e) {
      setLoadErr(errorText(t, e));
    } finally {
      setLoading(false);
    }
  }
  const liveIds = useMemo(() => new Set(live.slice(0, 2).map((e) => e.id)), [live]);
  const dayLabel = (key: string, ts: number) => (key === today ? t("activity.today") : key === yesterday ? t("activity.yesterday") : f.day(ts));
  const flat = useMemo(
    () => groups.flatMap((g) => [{ kind: "day" as const, key: g.key, ts: g.ts, n: g.items.length }, ...g.items.map((e) => ({ kind: "row" as const, e }))]),
    [groups],
  );

  return (
    <Card
      title={<span className="flex items-center gap-2">{t("feed.live")} <Badge tone={paused ? "neutral" : status === "connected" ? "profit" : status === "connecting" ? "warning" : "loss"}>{paused ? t("feed.paused") : t(`conn.${status}`)}</Badge></span>}
      subtitle={t("feed.newThisSession", { n: live.length })}
      action={<Button size="sm" variant="ghost" onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? <Play size={14} /> : <Pause size={14} />} {paused ? t("feed.resume") : t("feed.pause")}</Button>}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented label={t("feed.eventType")} value={filter} onChange={setFilter} options={FEED_FILTERS.map((f) => ({ value: f.id, label: t(`feed.${f.id}`) }))} />
        <select aria-label={t("common.strategy")} value={strategy} onChange={(e) => setStrategy(e.target.value)} className="ml-auto h-8 rounded-md border border-border-default bg-bg-sunken px-2 text-caption text-text-primary">
          <option value="">{t("common.allStrategies")}</option>
          {Object.entries(strategyNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      {merged.length === 0 ? (
        <EmptyState title={t("feed.noMatch")} detail={t("feed.noMatchDetail")} />
      ) : (
        <div aria-live="polite" aria-relevant="additions">
          {/* Perf: past ~150 rows the feed is window-virtualized (TanStack Virtual); day headers become rows. */}
          {merged.length > VIRTUAL_AFTER ? (
            <VirtualList
              count={flat.length}
              threshold={0}
              estimate={(i) => (flat[i].kind === "day" ? 32 : 64)}
              className="divide-y divide-border-subtle"
              render={(i) => {
                const it = flat[i];
                return it.kind === "day" ? (
                  <h3 key={it.key} className="flex items-baseline justify-between bg-bg-surface px-0 py-1.5 text-caption text-text-tertiary">
                    <span>{dayLabel(it.key, it.ts)}</span>
                    <span className="num normal-case">{t("activity.dayCount", { n: it.n })}</span>
                  </h3>
                ) : (
                  <EventRow key={it.e.id} as="div" e={it.e} strategyName={strategyNames[it.e.strategyId ?? ""]} fresh={liveIds.has(it.e.id)} />
                );
              }}
            />
          ) : (
            groups.map((g) => (
              <Fragment key={g.key}>
                <h3 className="sticky top-[var(--shell-top)] z-10 -mx-4 flex items-baseline justify-between border-y border-border-subtle bg-bg-surface px-4 py-1.5 text-caption text-text-tertiary">
                  <span>{dayLabel(g.key, g.ts)}</span>
                  <span className="num normal-case">{t("activity.dayCount", { n: g.items.length })}</span>
                </h3>
                <ul className="divide-y divide-border-subtle">
                  {g.items.map((e) => <EventRow key={e.id} e={e} strategyName={strategyNames[e.strategyId ?? ""]} fresh={liveIds.has(e.id)} />)}
                </ul>
              </Fragment>
            ))
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-caption text-text-tertiary">
        <span className="num">{t("activity.shown", { n: merged.length })}</span>
        {hasMore ? (
          <Button size="sm" variant="secondary" onClick={loadMore} loading={loading}>{loading ? t("activity.loading") : t("activity.loadMore")}</Button>
        ) : (
          <span>{t("activity.end")}</span>
        )}
        {loadErr ? <span role="alert" className="text-semantic-loss">{loadErr}</span> : null}
      </div>
    </Card>
  );
}
