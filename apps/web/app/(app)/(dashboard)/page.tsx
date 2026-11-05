import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Info, Plus } from "lucide-react";
import { getApi } from "@/lib/api";
import { acrossModes, listAllStrategies, modesOf, portfolioMode } from "@/lib/mode";
import type { Strategy } from "@/lib/types";

import { Badge, Card, PageHeader, Pnl, Sparkline, StatStrip, Table } from "@/components/ui";
import { ApprovalModeBadge, severityTone, StatusBadge, StrategyModeChips } from "@/components/domain";
import { PortfolioModeTabs } from "@/components/PortfolioModeTabs";
import { EquityChart } from "@/components/charts/EquityChart";
import { OverviewFeed } from "@/components/OverviewFeed";
import { CoinTrailSteps } from "@/components/CoinTrailSteps";
import { PnlReport } from "@/components/PnlReport";
import { closedTradeCounts } from "@/lib/pnl-report";
import { getT, getFmt } from "@/lib/i18n/server";
import { CoinAvatar } from "@/components/CoinAvatar";

/**
 * Overview. Per-strategy mode (contracts 1.1.6): the strategies table lists every strategy with its own Paper/Real chip;
 * the activity feed merges both modes (each row badged). Money (cash, PnL, equity) stays per mode on the wire, so the
 * portfolio tiles show one mode (`?mode=`; Paper unless a Real strategy exists and Real is picked).
 */
async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const api = getApi();
  const [t, all, sp] = await Promise.all([getT(), listAllStrategies(api), searchParams]);
  const modes = modesOf(all);
  const mode = portfolioMode(sp.mode, modes);
  const f = await getFmt(mode);
  const [o, events, coins] = await Promise.all([
    api.getOverview(mode),
    acrossModes(modes, async (m) => (await api.listRecentEvents(m, 30)).map((e) => ({ ...e, mode: e.mode ?? m }))),
    api.listCoins(mode),
  ]);
  events.sort((a, b) => b.ts - a.ts);
  const strategies = all;
  const names: Record<string, string> = Object.fromEntries(strategies.map((s) => [s.id, s.name]));
  const latestClosed = coins.find((c) => c.status === "closed");
  const trail = latestClosed ? await api.getCoinTrail(latestClosed.mint) : null;
  const realizedPct = (o.realizedPnlSol / o.startingCashSol) * 100;
  // Closed trades come from the same mode's strategies; the PnL report never mixes modes.
  const closed = closedTradeCounts(strategies, mode);

  return (
    <>
      <PageHeader
        title={t("overview.title")}
        subtitle={t("overview.subtitle", { workspace: t(mode === "practice" ? "mode.practiceShort" : "mode.realShort"), start: f.sol(o.startingCashSol) })}
        actions={<PortfolioModeTabs mode={mode} modes={modes} href={(m) => (m === "practice" ? "/" : "/?mode=real")} t={t} />}
      />

      <StatStrip
        items={[
          { label: t("overview.cash"), value: <>{f.sol(o.cashSol, { unit: false })}<span className="text-caption font-normal"> {t(mode === "practice" ? "overview.paperSol" : "overview.realSol")}</span></>, hint: t("overview.inPositions", { amount_lamports: f.amount(o.inPositionsSol) }) },
          { label: t("overview.realized"), value: <Pnl mode={mode} sol={o.realizedPnlSol} unit />, hint: t("overview.vsStart", { pct: f.pct(realizedPct) }) },
          { label: t("overview.openPositions"), value: `${o.openPositions} / ${o.openPositionsCap}`, hint: t("overview.openHint", { amount_lamports: f.amount(o.inPositionsSol), unreal: f.sol(o.unrealizedPnlSol, { sign: true }) }) },
          {
            label: t("overview.waiting"),
            value: f.int(o.pendingApprovals),
            tone: o.pendingApprovals ? "warning" : "neutral",
            hint: o.expiringSoon ? <span className="text-semantic-loss">{t("overview.expiringSoon", { n: o.expiringSoon })}</span> : t("overview.noneExpiring"),
            href: "/approvals",
          },
        ]}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          <Card
            title={t("overview.strategies")}
            action={
              <Link href="/strategies/new" className="inline-flex h-9 items-center gap-1 rounded-md bg-brand-primary px-3 text-label font-medium text-text-onAccent hover:bg-brand-primaryHover">
                <Plus size={14} /> {t("overview.newStrategy")}
              </Link>
            }
          >
            <Table<Strategy>
              rows={strategies.filter((s) => s.status !== "archived")}
              rowKey={(s) => s.id}
              minWidth={820}
              mobile="cards"
              labels={{ expand: t("table.expand"), scrollHint: t("table.scrollHint") }}
              columns={[
                { key: "name", header: t("overview.colName"), cell: (s) => <Link href={`/strategies/${s.id}/edit`} className="tap font-medium text-text-primary hover:underline">{s.name}</Link> },
                { key: "mode", header: t.ux("strategy.mode.label"), mobile: "status", nowrap: true, cell: (s) => <StrategyModeChips mode={s.mode} realLocked={s.realLocked} realLockedReason={s.realLockedReason} short /> },
                { key: "status", header: t("overview.colStatus"), mobile: "status", nowrap: true, cell: (s) => <StatusBadge status={s.status} /> },
                { key: "ap", header: t("overview.colApproval"), mobile: "status", nowrap: true, cell: (s) => (s.status === "draft" ? "—" : <ApprovalModeBadge mode={s.settings.approvalMode} />) },
                { key: "pnl", header: t("overview.colPnl"), numeric: true, mobile: "primary", cell: (s) => (s.status === "draft" ? "—" : <Pnl sol={s.realizedPnlSol} mode={s.mode} />) },
                { key: "wr", header: t("overview.colWin"), numeric: true, cell: (s) => (s.trades ? f.pct((s.wins / s.trades) * 100, 0, false) : "—") },
                { key: "dd", header: t("overview.colDd"), numeric: true, cell: (s) => (s.trades ? f.pct(-s.maxDrawdownPct) : "—") },
                { key: "hold", header: t("overview.colHold"), numeric: true, cell: (s) => (s.trades ? f.duration(s.avgHoldSeconds) : "—") },
                { key: "spark", header: <span className="sr-only">{t("overview.colTrend")}</span>, align: "right", cell: (s) => <Sparkline values={s.pnlSpark} label={t("overview.trend", { name: s.name })} /> },
              ]}
            />
            <p className="mt-3 text-caption text-text-tertiary">{t("overview.approvalNote")}</p>
          </Card>

          {trail && (
            <Card
              title={<span className="inline-flex items-center gap-2"><CoinAvatar mint={trail.coin.mint} logoHash={trail.coin.logoHash} symbol={trail.coin.untrusted.symbol} size="md" />{t("overview.coinTrail", { symbol: trail.coin.untrusted.symbol, strategy: trail.strategyName })}</span>}
              action={trail.positions[0] && <Link href={`/coins/${trail.coin.mint}`} className="tap text-caption"><Pnl mode={trail.mode} sol={trail.positions[0].pnlSol} unit /> · {t("common.details")}</Link>}
            >
              <CoinTrailSteps trail={trail} />
              <p className="mt-3 rounded-md bg-bg-sunken p-3 text-caption text-text-secondary">
                {t("overview.snapshot", { rev: trail.events[0]?.rev ?? "—" })}
              </p>
            </Card>
          )}

          <Card title={t("overview.equity", { unit: t(mode === "practice" ? "overview.paperSol" : "overview.realSol") })}>
            <EquityChart data={o.equityCurve} f={f} t={t} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <PnlReport
            realized={o.realizedPnlSol}
            unrealized={o.unrealizedPnlSol}
            openPositions={o.openPositions}
            trades={closed.trades}
            wins={closed.wins}
            mode={mode}
            t={t}
            f={f}
          />
          <Card title={t("overview.activity")} action={<Link href="/activity" className="tap text-caption text-brand-primary hover:underline">{t("common.seeAll")}</Link>}>
            <OverviewFeed initial={events} names={names} />
          </Card>
          <Card title={t("overview.warnings")} action={<Badge tone={o.alerts.some((a) => a.severity === "critical") ? "loss" : "warning"}>{o.alerts.length}</Badge>} bodyClassName="px-0 pb-1">
            <ul>
              {o.alerts.map((a) => (
                <li key={a.id} className="border-t border-border-subtle px-4 py-3">
                  <Link href={a.href ?? "#"} className="group flex gap-3">
                    {a.severity === "info" ? <Info size={16} className="mt-0.5 shrink-0 text-semantic-info" /> : <AlertTriangle size={16} className={a.severity === "critical" ? "mt-0.5 shrink-0 text-semantic-loss" : "mt-0.5 shrink-0 text-semantic-warning"} />}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-label text-text-primary group-hover:underline">
                        {a.title} <Badge tone={severityTone[a.severity]}>{t(`severity.${a.severity}`)}</Badge>
                      </span>
                      <span className="mt-0.5 block text-caption text-text-secondary">{a.detail}</span>
                      <span className="mt-1 block text-caption text-text-tertiary">{f.time(a.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-caption text-text-tertiary">
            {t("overview.footer", { dd: f.num(o.drawdownPct, 1), stop: o.lossStopPct, engine: t(o.engine.online ? "overview.online" : "overview.offline") })}
          </p>
        </div>
      </div>
    </>
  );
}

export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-bg-surface" />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}
