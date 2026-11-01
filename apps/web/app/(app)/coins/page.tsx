import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import type { CoinSummary } from "@/lib/types";
import { shortMint } from "@/lib/format";
import { getT, getFmt } from "@/lib/i18n/server";
import { Badge, Card, EmptyState, PageHeader, Pnl, Table, cn, type Tone } from "@/components/ui";
import { NotTradeableChip } from "@/components/NotTradeable";
import { CoinsVirtualList } from "@/components/CoinsVirtualList";
import { Mcap } from "@/components/Mcap";

/** Past this many rows the screener list is window-virtualized on the client (TanStack Virtual). */
const VIRTUAL_COINS = 120;

export const metadata: Metadata = { title: "Coins" };
const statusTone: Record<CoinSummary["status"], Tone> = { open: "profit", closed: "info", watching: "brand", rejected: "neutral" };

async function List({ searchParams }: { searchParams: PageProps<"/coins">["searchParams"] }) {
  const [sp, mode, t] = await Promise.all([searchParams, getMode(), getT()]);
  const f = await getFmt(mode);
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const status = typeof sp.status === "string" ? sp.status : "all";
  const only = status === "not_tradeable";
  // 1.1.4 cursor paging: unfiltered → first keyset page + client load-more; filters run locally → whole list
  // (proposed to Backend: server-side ?q=&status= so filtered views can page too).
  const filtered = !!q || status !== "all";
  const first = filtered ? null : await getApi().listCoinsPage(mode, { limit: 100 });
  const coins = (first ? first.items : await getApi().listCoins(mode))
    .filter((c) => !q || c.symbol.toLowerCase().includes(q) || c.mint.toLowerCase().startsWith(q) || c.strategyName.toLowerCase().includes(q))
    .filter((c) => (only ? c.screenerState === "UNSUPPORTED_QUOTE_MINT" : status === "passed" ? c.status !== "rejected" : status === "rejected" ? c.status === "rejected" : true));
  const nt = (c: CoinSummary) => c.screenerState === "UNSUPPORTED_QUOTE_MINT";
  const chip = (active: boolean) => cn("inline-flex min-h-8 items-center rounded-full border px-3 text-caption", active ? "border-brand-primary bg-brand-primaryContainer text-brand-onPrimaryContainer" : "border-border-default text-text-secondary hover:text-text-primary");
  return (
    <>
    <PageHeader title={t("screener.title")} subtitle={`${t("coins.subtitle")} ${t("screener.legend")}`} />
    <Card subtitle={q ? t("coins.resultsFor", { q }) : undefined}>
      {/* WF-20: filter chip; not-tradeable rows stay visible for screener transparency. */}
      <nav aria-label={t("coins.colStatus")} className="mb-3 flex flex-wrap gap-2">
        {(["all", "passed", "rejected"] as const).map((k) => (
          <Link key={k} href={k === "all" ? "/coins" : `/coins?status=${k}`} aria-current={status === k ? "page" : undefined} className={chip(status === k)}>
            {t(k === "all" ? "screener.filterAll" : k === "passed" ? "screener.filterPassed" : "screener.filterRejected")}
          </Link>
        ))}
        <Link href="/coins?status=not_tradeable" aria-current={only ? "page" : undefined} className={chip(only)}>{t("notTradeable.filter")}</Link>
      </nav>
      {coins.length > VIRTUAL_COINS || first?.nextCursor ? <CoinsVirtualList coins={coins} nextCursor={first?.nextCursor ?? null} mode={mode} /> : <Table<CoinSummary>
        rows={coins}
        rowKey={(c) => `${c.mint}-${c.strategyId}`}
        empty={<EmptyState title={q ? t("coins.empty") : t("screener.empty")} detail={q ? t("coins.emptyDetail") : undefined} />}
        mobile="cards"
        labels={{ expand: t("table.expand"), scrollHint: t("table.scrollHint") }}
        columns={[
          { key: "sym", header: t("screener.colCoin"), cell: (c) => <Link href={`/coins/${c.mint}`} className={cn("tap font-semibold hover:underline", nt(c) ? "text-text-tertiary" : "text-brand-primary")}>${c.symbol}</Link> },
          { key: "mint", header: t("coins.colMint"), cell: (c) => <span className="num text-caption text-text-secondary">{shortMint(c.mint)}</span> },
          { key: "strat", header: t("coins.colStrategy"), cell: (c) => c.strategyName },
          { key: "status", header: t("screener.colStatus"), mobile: "status", nowrap: true, cell: (c) => (nt(c) ? <NotTradeableChip label={t("screener.notTradeable")} /> : <Badge tone={statusTone[c.status]}>{c.status === "rejected" ? t("screener.statusRejected") : t(`coins.status.${c.status}`)}</Badge>) },
          { key: "pnl", header: t("coins.colPnl"), numeric: true, mobile: "primary", cell: (c) => (c.pnlSol != null && !nt(c) ? <Pnl sol={c.pnlSol} /> : <span className="text-text-tertiary">—</span>) },
          { key: "mcap", header: t.ux("screener.col.mcap"), numeric: true, cell: (c) => <Mcap m={c.mcap} t={t} locale={t.locale} time={f.time} compact /> },
          { key: "t", header: t("coins.colLast"), numeric: true, cell: (c) => f.time(c.lastEventAt) },
        ]}
      />}
    </Card>
    </>
  );
}

export default function CoinsPage(props: PageProps<"/coins">) {
  return (
    <>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-bg-surface" />}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
