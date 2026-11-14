import type { Metadata } from "next";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { acrossModes, listAllStrategies, modesOf } from "@/lib/mode";
import { PageHeader } from "@/components/ui";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ActivityFeed } from "@/components/ActivityFeed";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Activity" };

async function Feed() {
  const api = getApi();
  const [strategies, t] = await Promise.all([listAllStrategies(api), getT()]);
  // Per-strategy mode: one feed across modes, every row badged with its envelope mode.
  const modes = modesOf(strategies);
  const events = (await acrossModes(modes, async (m) => (await api.listRecentEvents(m, 101)).map((e) => ({ ...e, mode: e.mode ?? m })))).sort((a, b) => b.ts - a.ts);
  return (
    <>
      <PageHeader title={t("activity.title")} subtitle={t("activity.subtitle")} />
      <ActivityFeed key={modes.join(",")} modes={modes} initial={events.slice(0, 100)} hasMore={events.length > 100} strategyNames={Object.fromEntries(strategies.map((s) => [s.id, s.name]))} />
    </>
  );
}

export default function ActivityPage() {
  return (
    <>
      <Suspense fallback={<PageSkeleton variant="list" />}>
        <Feed />
      </Suspense>
    </>
  );
}
