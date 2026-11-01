import { NOT_TRADEABLE } from "@/lib/types";
import { NotTradeableChip, NotTradeableCta, NotTradeableReason } from "@/components/NotTradeable";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import type { Position } from "@/lib/types";
import { shortMint } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Pnl, StatTile, Table } from "@/components/ui";
import { Mcap } from "@/components/Mcap";
import { eventKindMeta, ModeBadge } from "@/components/domain";
import { getT, getFmt } from "@/lib/i18n/server";
import { CoinTrailSteps } from "@/components/CoinTrailSteps";
import { EventTitle } from "@/components/EventTitle";
import { PriceChart } from "@/components/charts/PriceChartLazy";

export const metadata: Metadata = { title: "Coin trail" };

async function Trail({ params }: { params: PageProps<"/coins/[mint]">["params"] }) {
  const [{ mint }, mode, t] = await Promise.all([params, getMode(), getT()]);
  const f = await getFmt(mode);
  const trail = await getApi().getCoinTrail(mint);
  if (!trail) notFound();
  if (trail.mode !== mode) {
    return <EmptyState title={t("mode.otherWorkspace", { mode: t(trail.mode === "real" ? "mode.realShort" : "mode.practiceShort") })} detail={t("mode.otherWorkspaceDetail")} />;
  }
  const { coin, positions, events } = trail;
  const pos = positions[0];
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const holdS = pos ? Math.round(((pos.closedAt ?? ordered[ordered.length - 1].ts) - pos.openedAt) / 1000) : 0;

  const notTradeable = trail.screenerState === NOT_TRADEABLE || trail.events.some((e) => e.reasonCode === NOT_TRADEABLE);
  return (
    <>
      <Link href="/coins" className="mb-3 inline-flex items-center gap-1 text-caption text-text-secondary hover:text-text-primary"><ArrowLeft size={14} /> {t("trail.all")}</Link>
      <PageHeader
        title={t("trail.title", { symbol: coin.untrusted.symbol })}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="num text-caption" title={coin.mint}>{shortMint(coin.mint)}</span>
            <Badge>{coin.launchpad}</Badge>
            <Badge>{coin.venue}</Badge>
            {notTradeable && <NotTradeableChip label={t("screener.notTradeable")} />}
            <span>{t("trail.strategy", { name: trail.strategyName })}</span>
            <Mcap m={trail.mcap} t={t} locale={t.locale} time={f.dateTime} />
          </span>
        }
        actions={<ModeBadge mode={trail.mode} />}
      />
      {notTradeable && (
        // WF-20/21 detail: reason first, facts (reason_code for support), chart stays read-only, disabled labelled CTA.
        <section className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-label={t("screener.notTradeable")}>
          <NotTradeableReason text={t("screener.notTradeableDetail")} />
          <div className="row-span-2">
            <dl className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-bg-surface text-body">
              {[
                [t("notTradeable.quotePair"), t("notTradeable.quoteValue", { quote_symbol: trail.quoteSymbol ?? "?" })],
                [t("notTradeable.solPair"), t("notTradeable.none")],
                [t("notTradeable.score"), trail.score ? t("notTradeable.scoreValueInfo", { score: trail.score.value, max_score: 100 }) : "—"],
                [t("notTradeable.guard"), t("notTradeable.guardNotRun")],
                [t("notTradeable.reasonCode"), <span key="rc" className="font-mono text-caption">UNSUPPORTED_QUOTE_MINT</span>],
              ].map(([k, v], i) => (
                <div key={i} className="flex min-h-11 items-center justify-between gap-3 px-3">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="text-right text-text-tertiary">{v}</dd>
                </div>
              ))}
            </dl>
            <NotTradeableCta label={t("notTradeable.cta")} note={t("notTradeable.ctaNote")} />
          </div>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("trail.score")} value={trail.score ? `${trail.score.value} / ${trail.score.passMark}` : "—"} tone={trail.score && trail.score.value >= trail.score.passMark ? "profit" : "warning"} />
        <StatTile label={t("trail.size")} value={pos ? f.sol(pos.solIn) : "—"} hint={pos ? t("trail.fee", { bps: pos.feeBps }) : t("trail.notEntered")} />
        <StatTile label={pos?.status === "open" ? t("trail.unrealized") : t("trail.pnl")} value={pos ? <Pnl sol={pos.pnlSol} unit /> : "—"} hint={pos ? t("trail.peak", { pct: f.num(pos.pnlPct, 1), peak: f.num(pos.peakGainPct, 1) }) : undefined} />
        <StatTile label={t("trail.hold")} value={pos ? f.duration(holdS) : "—"} hint={pos?.exitReason ? t(`exitReason.${pos.exitReason}`) : pos ? t("trail.stillOpen") : undefined} />
      </div>

      <Card title={t("trail.trail")} className="mt-4"><CoinTrailSteps trail={trail} /></Card>

      <Card title={notTradeable ? t("notTradeable.chartReadonly") : t("trail.price")} subtitle={notTradeable ? t("notTradeable.chartNote") : t("trail.priceNote")} className="mt-4">
        {trail.prices.length > 1 ? <PriceChart prices={trail.prices} events={ordered} /> : <p className="text-body text-text-secondary">{t("trail.noPrice")}</p>}
        {pos && (
          <p className="num mt-2 text-caption text-text-secondary">
            {t("trail.entryExit", { entry: f.usd(pos.entryPriceUsd) })}{pos.exitPriceUsd ? t("trail.exitAt", { exit: f.usd(pos.exitPriceUsd) }) : ""}
          </p>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title={t("trail.timeline")} className="lg:col-span-2">
          <ol className="relative ml-2 border-l border-border-default">
            {ordered.map((e) => (
              <li key={e.id} className="mb-5 ml-5 last:mb-0">
                <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-bg-surface ${eventKindMeta[e.kind].dot}`} aria-hidden />
                <div className="flex flex-wrap items-center gap-2 text-overline uppercase tracking-wide text-text-tertiary">
                  <span>{t(`actor.${e.actor}`)} · {t(`kind.${e.kind}`)}</span>
                  <span className="num normal-case">{f.time(e.ts)}</span>
                  {e.rev != null && <span className="normal-case">rev {e.rev}</span>}
                </div>
                <p className="mt-0.5 text-body font-semibold"><EventTitle e={e} /> {e.pnlSol != null && <Pnl sol={e.pnlSol} className="ml-1 text-caption font-normal" />}</p>
                {e.reason && <p className="text-caption text-text-secondary">{e.reason}</p>}
                {e.checks && (
                  <ul className="mt-2 grid gap-1 rounded-md bg-bg-sunken p-2 text-caption sm:grid-cols-2">
                    {e.checks.map((c) => (
                      <li key={c.name} className="flex items-center gap-1.5">
                        {c.passed ? <Check size={12} className="text-semantic-profit" aria-label={t("trail.passed")} /> : <X size={12} className="text-semantic-loss" aria-label={t("trail.failed")} />}
                        <span>{c.name}</span>
                        {c.hard && <span className="text-overline uppercase text-text-tertiary">{t("trail.hard")}</span>}
                        <span className="num ml-auto text-text-secondary">{c.measured} <span className="text-text-tertiary">({c.threshold})</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Card>
        <Card title={t("trail.positions")}>
          {positions.length === 0 ? (
            <p className="text-body text-text-secondary">{t("trail.noPosition")}</p>
          ) : (
            <Table<Position>
              rows={positions}
              rowKey={(p) => p.key}
              minWidth={280}
              columns={[
                { key: "k", header: "#", cell: (p) => <span className="num text-caption">{p.key.split(".").pop()}</span> },
                { key: "in", header: t("trail.colIn"), numeric: true, cell: (p) => f.num(p.solIn, 3) },
                { key: "out", header: t("trail.colOut"), numeric: true, cell: (p) => f.num(p.solOut, 3) },
                { key: "pnl", header: t("trail.colPnl"), numeric: true, cell: (p) => <Pnl sol={p.pnlSol} /> },
              ]}
            />
          )}
          <p className="mt-3 text-caption text-text-tertiary">{t("trail.untrusted")}</p>
        </Card>
      </div>
    </>
  );
}

export default function CoinTrailPage(props: PageProps<"/coins/[mint]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-bg-surface" />}>
      <Trail params={props.params} />
    </Suspense>
  );
}
