import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { listAllStrategies, modesOf, portfolioMode } from "@/lib/mode";
import { PortfolioModeTabs } from "@/components/PortfolioModeTabs";
import type { ExitReasonStat } from "@/lib/types";

import { Card, EmptyState, PageHeader, Pnl, StatStrip, Table } from "@/components/ui";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ExitCountChart, ExitPnlChart } from "@/components/charts/ExitCharts";
import { StatsFilters } from "@/components/StatsFilters";
import { getT, getFmt } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Exit stats" };

async function StatsBody({ searchParams }: { searchParams: PageProps<"/stats">["searchParams"] }) {
  const api = getApi();
  const [sp, all, t] = await Promise.all([searchParams, listAllStrategies(api), getT()]);
  // Exit stats aggregate money, so they stay per mode (`?mode=`; Paper unless a Real strategy exists and Real is picked).
  const modes = modesOf(all);
  const mode = portfolioMode(sp.mode, modes);
  const f = await getFmt(mode);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const strategies = all.filter((s) => s.mode === mode);
  const strategyId = one(sp.strategy);
  const stats = await api.getExitStats({ mode, strategyId: strategies.some((s) => s.id === strategyId) ? strategyId : undefined, windowHours: Number(one(sp.window)) || undefined });
  const total = stats.reduce((a, s) => a + s.count, 0);
  const filters = (
    <>
    <PageHeader
      title={t("stats.title")}
      subtitle={t("stats.subtitle")}
      actions={<Link href={mode === "real" ? "/pnl?mode=real" : "/pnl"} className="inline-flex h-9 items-center rounded-md border border-border-default px-3 text-label text-text-secondary hover:bg-bg-raised">{t("pnl.ledger")} →</Link>}
    />
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <StatsFilters strategies={strategies.map((s) => ({ id: s.id, name: s.name }))} />
      <span className="ml-auto"><PortfolioModeTabs mode={mode} modes={modes} href={(m) => (m === "practice" ? "/stats" : "/stats?mode=real")} t={t} /></span>
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
      <StatStrip
        items={[
          { label: t("stats.closed"), value: f.int(total) },
          { label: t("stats.winRate"), value: `${f.num((wins / total) * 100, 1)}%`, hint: t("stats.wins", { n: wins }) },
          { label: t("stats.total"), value: <Pnl mode={mode} sol={pnl} unit /> },
          { label: t("stats.costliest"), value: t(`exitReason.${worst.reason}`), tone: "warning", hint: <Pnl mode={mode} sol={worst.totalPnlSol} unit /> },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("stats.byReason")}><ExitCountChart stats={stats} t={t} f={f} /></Card>
        <Card title={t("stats.avgPct")}><ExitPnlChart stats={stats} t={t} f={f} /></Card>
      </div>
      <Card title={t("stats.breakdown")} className="mt-4">
        <Table<ExitReasonStat>
          rows={stats}
          rowKey={(s) => s.reason}
          minWidth={720}
          labels={{ expand: t("table.expand"), scrollHint: t("table.scrollHint") }}
          columns={[
            { key: "r", header: t("stats.colReason"), cell: (s) => <span className="font-medium">{t(`exitReason.${s.reason}`)}</span> },
            { key: "c", header: t("stats.colCount"), numeric: true, cell: (s) => f.int(s.count) },
            { key: "w", header: t("stats.colWin"), numeric: true, cell: (s) => (s.winRate == null ? "—" : `${f.num(s.winRate * 100, 0)}%`) },
            { key: "ap", header: t("stats.colAvgPct"), numeric: true, cell: (s) => <Pnl mode={mode} pct={s.avgPnlPct} /> },
            { key: "as", header: t("stats.colAvg"), numeric: true, cell: (s) => <Pnl mode={mode} sol={s.avgPnlSol} digits={4} /> },
            { key: "t", header: t("stats.colTotal"), numeric: true, cell: (s) => <Pnl mode={mode} sol={s.totalPnlSol} /> },
            { key: "h", header: t("stats.colHold"), numeric: true, cell: (s) => (s.avgHoldSeconds == null ? "—" : f.duration(s.avgHoldSeconds)) },
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
      <Suspense fallback={<PageSkeleton variant="dashboard" />}>
        <StatsBody searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
