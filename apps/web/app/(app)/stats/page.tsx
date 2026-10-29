import type { Metadata } from "next";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import type { ExitReasonStat } from "@/lib/types";

import { Card, EmptyState, PageHeader, Pnl, StatTile, Table } from "@/components/ui";
import { ModeBadge } from "@/components/domain";
import { ExitCountChart, ExitPnlChart } from "@/components/charts/ExitCharts";
import { StatsFilters } from "@/components/StatsFilters";
import { getT, getFmt } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Exit stats" };

async function StatsBody({ searchParams }: { searchParams: PageProps<"/stats">["searchParams"] }) {
  const [sp, mode, t] = await Promise.all([searchParams, getMode(), getT()]);
  const f = await getFmt(mode);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const api = getApi();
  const strategies = await api.listStrategies(mode);
  const strategyId = one(sp.strategy);
  const stats = await api.getExitStats({ mode, strategyId: strategies.some((s) => s.id === strategyId) ? strategyId : undefined, windowHours: Number(one(sp.window)) || undefined });
  const total = stats.reduce((a, s) => a + s.count, 0);
  const filters = (
    <>
    <PageHeader title={t("stats.title")} subtitle={t("stats.subtitle")} />
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <StatsFilters strategies={strategies.map((s) => ({ id: s.id, name: s.name }))} />
      <ModeBadge mode={mode} className="ml-auto" />
    </div>
    </>
  );
  if (total === 0) return <>{filters}<EmptyState title={t("stats.empty")} detail={t("stats.emptyDetail")} /></>;
  const wins = stats.reduce((a, s) => a + s.wins, 0);
  const pnl = stats.reduce((a, s) => a + s.totalPnlSol, 0);
  const worst = [...stats].filter((s) => s.count).sort((a, b) => a.totalPnlSol - b.totalPnlSol)[0];
  return (
    <>
      {filters}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("stats.closed")} value={f.int(total)} />
        <StatTile label={t("stats.winRate")} value={`${f.num((wins / total) * 100, 1)}%`} hint={t("stats.wins", { n: wins })} />
        <StatTile label={t("stats.total")} value={<Pnl sol={pnl} unit />} />
        <StatTile label={t("stats.costliest")} value={t(`exitReason.${worst.reason}`)} tone="warning" hint={<Pnl sol={worst.totalPnlSol} unit />} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("stats.byReason")}><ExitCountChart stats={stats} /></Card>
        <Card title={t("stats.avgPct")}><ExitPnlChart stats={stats} /></Card>
      </div>
      <Card title={t("stats.breakdown")} className="mt-4">
        <Table<ExitReasonStat>
          rows={stats}
          rowKey={(s) => s.reason}
          minWidth={720}
          columns={[
            { key: "r", header: t("stats.colReason"), cell: (s) => <span className="font-medium">{t(`exitReason.${s.reason}`)}</span> },
            { key: "c", header: t("stats.colCount"), numeric: true, cell: (s) => f.int(s.count) },
            { key: "w", header: t("stats.colWin"), numeric: true, cell: (s) => `${f.num(s.winRate * 100, 0)}%` },
            { key: "ap", header: t("stats.colAvgPct"), numeric: true, cell: (s) => <Pnl pct={s.avgPnlPct} /> },
            { key: "as", header: t("stats.colAvg"), numeric: true, cell: (s) => <Pnl sol={s.avgPnlSol} digits={4} /> },
            { key: "t", header: t("stats.colTotal"), numeric: true, cell: (s) => <Pnl sol={s.totalPnlSol} /> },
            { key: "h", header: t("stats.colHold"), numeric: true, cell: (s) => f.duration(s.avgHoldSeconds) },
            { key: "sh", header: t("stats.colShare"), numeric: true, cell: (s) => f.pct((s.count / total) * 100, 0, false) },
          ]}
        />
      </Card>
    </>
  );
}

export default function StatsPage(props: PageProps<"/stats">) {
  return (
    <>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-bg-surface" />}>
        <StatsBody searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
