import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Copy, Pencil, Plus } from "lucide-react";
import { getApi } from "@/lib/api";
import { DEFAULT_TRADING } from "@/lib/trading";
import { listAllStrategies } from "@/lib/mode";
import type { Strategy, TradingMode } from "@/lib/types";
import { cn } from "@/components/ui";

import { Card, EmptyState, PageHeader, Pnl, Sparkline } from "@/components/ui";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { StatusBadge, StrategyModeChips } from "@/components/domain";
import { getT, getFmt } from "@/lib/i18n/server";
import { Funnel } from "@/components/Funnel";
import { StrategyStatusActions } from "@/components/strategy/StrategyStatusActions";
import { BuyingPausedBanner } from "@/components/BuyingPausedBanner";

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
            title={s.name}
            subtitle={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge status={s.status} />
                <StrategyModeChips mode={s.mode} realLocked={s.realLocked} realLockedReason={s.realLockedReason} />
                <span>{t(`approvalMode.${s.settings.approvalMode}`)} · {t("strategies.rev", { rev: s.rev })}</span>
              </span>
            }
            action={<Sparkline values={s.pnlSpark} label={t("overview.trend", { name: s.name })} />}
          >
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-caption sm:grid-cols-4">
              <div><dt className="text-text-tertiary">{t("strategies.realized")}</dt><dd><Pnl sol={s.realizedPnlSol} mode={s.mode} /></dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.winRate")}</dt><dd className="num text-numSm">{s.trades ? `${winRate}%` : "—"} <span className="text-text-tertiary">({s.wins}/{s.trades})</span></dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.maxDd")}</dt><dd className="num text-numSm">{s.trades ? f.pct(-s.maxDrawdownPct) : "—"}</dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.avgHold")}</dt><dd className="num text-numSm">{s.trades ? f.duration(s.avgHoldSeconds) : "—"}</dd></div>
            </dl>
            {s.status === "draft" ? <p className="mb-2 text-caption text-text-tertiary">{t("strategies.draftNote")}</p> : <Funnel funnel={s.funnel} />}
            <p className="mt-3 text-caption text-text-secondary">
              {[
                s.settings.screener.streams.map((st) => (st === "curve" ? t("builder.bonding") : t("builder.graduated"))).join(", "),
                t("strategies.exit", { plan }),
                t("strategies.perTrade", { amount_lamports: f.amount(s.settings.sizing.tradeSol) }),
                t("strategies.open", { n: s.openPositions ?? "—", max: s.settings.sizing.maxOpen }),
                t("strategies.guard", { preset: t(`guardPreset.${s.settings.guard.preset}`) }),
              ].join(" · ")}
            </p>
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
              <StrategyStatusActions id={s.id} name={s.name} status={s.status} rev={s.rev} />
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
  const chip = (on: boolean) => cn("chip hover:text-text-primary", on && "chip-on");
  // D3: the UX catalog's strategy.list.filter.* keys are not in @centurion/i18n yet, so use the
  // app's own mode labels plus the live counts instead of rendering the raw key.
  const filters: { id: Filter; label: string; href: string }[] = [
    { id: "all", label: `${t("common.all")} · ${live.length}`, href: "/strategies" },
    { id: "practice", label: `${t("mode.practiceShort")} · ${live.length - real}`, href: "/strategies?mode=practice" },
    { id: "real", label: `${t("mode.realShort")} · ${real}`, href: "/strategies?mode=real" },
  ];
  return (
    <>
    <PageHeader
      title={t("strategies.title")}
      subtitle={`${t("strategies.subtitle")} · ${t.ux("strategy.list.summary", { real_count: real, paper_count: live.length - real })}`}
      actions={
        <>
          <Link href="/strategies/new" className="inline-flex h-8 items-center gap-1 rounded-md bg-brand-primary px-2.5 text-label font-medium text-text-onAccent hover:bg-brand-primaryHover"><Plus size={14} strokeWidth={1.75} /> {t("overview.newStrategy")}</Link>
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
  const [all, sp, trading] = await Promise.all([listAllStrategies(getApi()), searchParams, getApi().getTrading().catch(() => DEFAULT_TRADING)]);
  const filter = filterOf(sp.mode);
  return (
    <>
      <BuyingPausedBanner trading={trading} />
      <Header all={all} filter={filter} />
      <List all={all} filter={filter} />
    </>
  );
}

export default function StrategiesPage(props: PageProps<"/strategies">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Page searchParams={props.searchParams} />
    </Suspense>
  );
}
