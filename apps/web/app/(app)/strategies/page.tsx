import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Copy, Pencil, Plus } from "lucide-react";
import { getApi } from "@/lib/api";
import { listAllStrategies } from "@/lib/mode";
import type { Strategy, TradingMode } from "@/lib/types";
import { cn } from "@/components/ui";

import { Badge, Card, EmptyState, PageHeader, Pnl, Sparkline } from "@/components/ui";
import { ApprovalModeBadge, StatusBadge, StrategyModeChips } from "@/components/domain";
import { getT, getFmt } from "@/lib/i18n/server";
import { Funnel } from "@/components/Funnel";

export const metadata: Metadata = { title: "Strategies" };

const linkBtn = "inline-flex h-8 items-center gap-1 rounded-md border border-border-default px-3 text-label hover:bg-bg-raised";

type Filter = "all" | TradingMode;
const filterOf = (v: unknown): Filter => (v === "practice" || v === "real" ? v : "all");

/**
 * All strategies, both modes, one list (per-strategy Paper/Real, contracts 1.1.6). Each card carries its own mode chip
 * (+ "Real locked" while Real is gated). Filter chips (UX strategy.list.filter.*) narrow by mode via `?mode=`.
 */
async function List({ all, filter }: { all: Strategy[]; filter: Filter }) {
  const t = await getT();
  const fp = await getFmt("practice");
  const fr = await getFmt("real");
  const strategies = filter === "all" ? all : all.filter((s) => s.mode === filter);
  if (strategies.length === 0) return <EmptyState title={t("strategies.empty")} detail={t("strategies.emptyDetail")} />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {strategies.map((s) => {
        const f = s.mode === "real" ? fr : fp;
        const winRate = s.trades ? Math.round((s.wins / s.trades) * 100) : 0;
        const plan = t(`exitPlan.${s.settings.exit.plan}`);
        return (
          <Card
            key={s.id}
            className={s.status === "archived" ? "opacity-60" : undefined}
            title={<span className="flex flex-wrap items-center gap-2">{s.name} <StrategyModeChips mode={s.mode} realLocked={s.realLocked} realLockedReason={s.realLockedReason} short /> <StatusBadge status={s.status} /> <ApprovalModeBadge mode={s.settings.approvalMode} /></span>}
            subtitle={`${t(`approvalMode.${s.settings.approvalMode}`)} (${t("approvalMode.perStrategy").toLowerCase()}) · ${t("strategies.rev", { rev: s.rev })}`}
            action={<Sparkline values={s.pnlSpark} label={t("overview.trend", { name: s.name })} />}
          >
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-caption sm:grid-cols-4">
              <div><dt className="text-text-tertiary">{t("strategies.realized")}</dt><dd><Pnl sol={s.realizedPnlSol} mode={s.mode} /></dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.winRate")}</dt><dd className="num text-numSm">{s.trades ? `${winRate}%` : "—"} <span className="text-text-tertiary">({s.wins}/{s.trades})</span></dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.maxDd")}</dt><dd className="num text-numSm">{s.trades ? f.pct(-s.maxDrawdownPct) : "—"}</dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.avgHold")}</dt><dd className="num text-numSm">{s.trades ? f.duration(s.avgHoldSeconds) : "—"}</dd></div>
            </dl>
            {s.status === "draft" ? <p className="mb-2 text-caption text-text-tertiary">{t("strategies.draftNote")}</p> : <Funnel funnel={s.funnel} />}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {s.settings.screener.streams.map((st) => <Badge key={st}>{st === "curve" ? t("builder.bonding") : t("builder.graduated")}</Badge>)}
              <Badge tone="brand">{t("strategies.exit", { plan })}</Badge>
              <Badge>{t("strategies.perTrade", { amount_lamports: f.amount(s.settings.sizing.tradeSol) })}</Badge>
              <Badge>{t("strategies.open", { n: s.openPositions, max: s.settings.sizing.maxOpen })}</Badge>
              <Badge tone="guard">{t("strategies.guard", { preset: t(`guardPreset.${s.settings.guard.preset}`) })}</Badge>
            </div>
            {s.funnel.rejections.length > 0 && (
              <details className="mt-3 text-caption">
                <summary className="cursor-pointer text-text-secondary hover:text-text-primary">{t("strategies.rejections")}</summary>
                <ul className="mt-2 space-y-1">
                  {s.funnel.rejections.map((r) => (
                    <li key={r.reason} className="flex justify-between text-text-secondary"><span>{r.reason}</span><span className="num text-text-primary">{f.num(r.count, 0)}</span></li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3">
              <Link href={`/strategies/${s.id}/edit`} className={linkBtn}><Pencil size={13} /> {t("strategies.edit")}</Link>
              <Link href={`/strategies/new?from=${s.id}`} className={linkBtn}><Copy size={13} /> {t("strategies.duplicate")}</Link>
              <span className="ml-auto text-caption text-text-tertiary">{t("strategies.updated", { time: f.dateTime(s.updatedAt) })}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

async function Header({ all, filter }: { all: Strategy[]; filter: Filter }) {
  const t = await getT();
  const live = all.filter((s) => s.status !== "archived");
  const real = live.filter((s) => s.mode === "real").length;
  const chip = (on: boolean) => cn("inline-flex min-h-8 items-center rounded-full border px-3 text-caption", on ? "border-brand-primary bg-brand-primaryContainer text-brand-onPrimaryContainer" : "border-border-default text-text-secondary hover:text-text-primary");
  const filters: { id: Filter; label: string; href: string }[] = [
    { id: "all", label: t.ux("strategy.list.filter.all"), href: "/strategies" },
    { id: "practice", label: t.ux("strategy.list.filter.paper"), href: "/strategies?mode=practice" },
    { id: "real", label: t.ux("strategy.list.filter.real"), href: "/strategies?mode=real" },
  ];
  return (
    <>
    <PageHeader
      title={t("strategies.title")}
      subtitle={`${t("strategies.subtitle")} · ${t.ux("strategy.list.summary", { real_count: real, paper_count: live.length - real })}`}
      actions={
        <>
          <Link href="/strategies/new" className="inline-flex h-10 items-center gap-1 rounded-md bg-brand-primary px-4 text-label font-medium text-text-onAccent hover:bg-brand-primaryHover"><Plus size={14} /> {t("overview.newStrategy")}</Link>
        </>
      }
    />
    <nav aria-label={t.ux("strategy.mode.label")} className="mb-4 flex flex-wrap items-center gap-2">
      {filters.map((x) => (
        <Link key={x.id} href={x.href} aria-current={filter === x.id ? "page" : undefined} className={chip(filter === x.id)}>{x.label}</Link>
      ))}
      <span className="text-caption text-text-tertiary">{t.ux("strategy.real_locked.list_note")}</span>
    </nav>
    </>
  );
}

async function Page({ searchParams }: { searchParams: PageProps<"/strategies">["searchParams"] }) {
  const [all, sp] = await Promise.all([listAllStrategies(getApi()), searchParams]);
  const filter = filterOf(sp.mode);
  return (
    <>
      <Header all={all} filter={filter} />
      <List all={all} filter={filter} />
    </>
  );
}

export default function StrategiesPage(props: PageProps<"/strategies">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-bg-surface" />}>
      <Page searchParams={props.searchParams} />
    </Suspense>
  );
}
