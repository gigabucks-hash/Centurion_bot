import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Copy, Pencil, Plus } from "lucide-react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import { fmtDuration, fmtNum, fmtPct, fmtSol, fmtTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Pnl, Sparkline } from "@/components/ui";
import { ApprovalModeBadge, ModeBadge, StatusBadge } from "@/components/domain";
import { getT } from "@/lib/i18n/server";
import { Funnel } from "@/components/Funnel";

export const metadata: Metadata = { title: "Strategies" };

const linkBtn = "inline-flex h-8 items-center gap-1 rounded-md border border-border-default px-3 text-label hover:bg-bg-raised";

async function List() {
  const [mode, t] = await Promise.all([getMode(), getT()]);
  const strategies = await getApi().listStrategies(mode);
  if (strategies.length === 0) return <EmptyState title={t("strategies.empty")} detail={t("strategies.emptyDetail")} />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {strategies.map((s) => {
        const winRate = s.trades ? Math.round((s.wins / s.trades) * 100) : 0;
        const plan = t(`exitPlan.${s.settings.exit.plan}`);
        return (
          <Card
            key={s.id}
            className={s.status === "archived" ? "opacity-60" : undefined}
            title={<span className="flex flex-wrap items-center gap-2">{s.name} <StatusBadge status={s.status} /> <ApprovalModeBadge mode={s.settings.approvalMode} /></span>}
            subtitle={`${t(`approvalMode.${s.settings.approvalMode}`)} (${t("approvalMode.perStrategy").toLowerCase()}) · ${t("strategies.rev", { rev: s.rev })}`}
            action={<Sparkline values={s.pnlSpark} label={t("overview.trend", { name: s.name })} />}
          >
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-caption sm:grid-cols-4">
              <div><dt className="text-text-tertiary">{t("strategies.realized")}</dt><dd><Pnl sol={s.realizedPnlSol} /></dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.winRate")}</dt><dd className="num text-numSm">{s.trades ? `${winRate}%` : "—"} <span className="text-text-tertiary">({s.wins}/{s.trades})</span></dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.maxDd")}</dt><dd className="num text-numSm">{s.trades ? fmtPct(-s.maxDrawdownPct) : "—"}</dd></div>
              <div><dt className="text-text-tertiary">{t("strategies.avgHold")}</dt><dd className="num text-numSm">{s.trades ? fmtDuration(s.avgHoldSeconds) : "—"}</dd></div>
            </dl>
            {s.status === "draft" ? <p className="mb-2 text-caption text-text-tertiary">{t("strategies.draftNote")}</p> : <Funnel funnel={s.funnel} />}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {s.settings.screener.streams.map((st) => <Badge key={st}>{st === "bonding" ? t("builder.bonding") : t("builder.graduated")}</Badge>)}
              <Badge tone="brand">{t("strategies.exit", { plan })}</Badge>
              <Badge>{t("strategies.perTrade", { sol: fmtSol(s.settings.sizing.tradeSol, { digits: 2 }) })}</Badge>
              <Badge>{t("strategies.open", { n: s.openPositions, max: s.settings.sizing.maxOpen })}</Badge>
              <Badge tone="guard">{t("strategies.guard", { preset: t(`guardPreset.${s.settings.guard.preset}`) })}</Badge>
            </div>
            {s.funnel.rejections.length > 0 && (
              <details className="mt-3 text-caption">
                <summary className="cursor-pointer text-text-secondary hover:text-text-primary">{t("strategies.rejections")}</summary>
                <ul className="mt-2 space-y-1">
                  {s.funnel.rejections.map((r) => (
                    <li key={r.reason} className="flex justify-between text-text-secondary"><span>{r.reason}</span><span className="num text-text-primary">{fmtNum(r.count, 0)}</span></li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-4 flex items-center gap-2 border-t border-border-subtle pt-3">
              <Link href={`/strategies/${s.id}/edit`} className={linkBtn}><Pencil size={13} /> {t("strategies.edit")}</Link>
              <Link href={`/strategies/new?from=${s.id}`} className={linkBtn}><Copy size={13} /> {t("strategies.duplicate")}</Link>
              <span className="ml-auto text-caption text-text-tertiary">{t("strategies.updated", { time: fmtTime(s.updatedAt, true, false) })}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

async function Header() {
  const [mode, t] = await Promise.all([getMode(), getT()]);
  return (
    <PageHeader
      title={t("strategies.title")}
      subtitle={t("strategies.subtitle")}
      actions={
        <>
          <ModeBadge mode={mode} />
          <Link href="/strategies/new" className="inline-flex h-10 items-center gap-1 rounded-md bg-brand-primary px-4 text-label font-medium text-text-onAccent hover:bg-brand-primaryHover"><Plus size={14} /> {t("overview.newStrategy")}</Link>
        </>
      }
    />
  );
}

export default function StrategiesPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-bg-surface" />}>
      <Header />
      <List />
    </Suspense>
  );
}
