import type { Metadata } from "next";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import { PageHeader } from "@/components/ui";
import { ActivityFeed } from "@/components/ActivityFeed";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Activity" };

async function Feed() {
  const [mode, t] = await Promise.all([getMode(), getT()]);
  const api = getApi();
  const [events, strategies] = await Promise.all([api.listRecentEvents(mode, 100), api.listStrategies(mode)]);
  return (
    <>
      <PageHeader title={t("activity.title")} subtitle={t("activity.subtitle")} />
      <ActivityFeed key={mode} initial={events} strategyNames={Object.fromEntries(strategies.map((s) => [s.id, s.name]))} />
    </>
  );
}

export default function ActivityPage() {
  return (
    <>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-bg-surface" />}>
        <Feed />
      </Suspense>
    </>
  );
}
