import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { getMode } from "@/lib/mode";
import type { CoinSummary } from "@/lib/types";
import { fmtTime, shortMint } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Badge, Card, EmptyState, PageHeader, Pnl, Table, type Tone } from "@/components/ui";

export const metadata: Metadata = { title: "Coins" };
const statusTone: Record<CoinSummary["status"], Tone> = { open: "profit", closed: "info", watching: "brand", rejected: "neutral" };

async function List({ searchParams }: { searchParams: PageProps<"/coins">["searchParams"] }) {
  const [sp, mode, t] = await Promise.all([searchParams, getMode(), getT()]);
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const coins = (await getApi().listCoins(mode)).filter((c) => !q || c.symbol.toLowerCase().includes(q) || c.mint.toLowerCase().startsWith(q) || c.strategyName.toLowerCase().includes(q));
  return (
    <>
    <PageHeader title={t("coins.title")} subtitle={t("coins.subtitle")} />
    <Card subtitle={q ? t("coins.resultsFor", { q }) : undefined}>
      <Table<CoinSummary>
        rows={coins}
        rowKey={(c) => `${c.mint}-${c.strategyId}`}
        empty={<EmptyState title={t("coins.empty")} detail={q ? t("coins.emptyDetail") : undefined} />}
        columns={[
          { key: "sym", header: t("coins.colCoin"), cell: (c) => <Link href={`/coins/${c.mint}`} className="font-semibold text-brand-primary hover:underline">${c.symbol}</Link> },
          { key: "mint", header: t("coins.colMint"), cell: (c) => <span className="num text-caption text-text-secondary">{shortMint(c.mint)}</span> },
          { key: "strat", header: t("coins.colStrategy"), cell: (c) => c.strategyName },
          { key: "status", header: t("coins.colStatus"), cell: (c) => <Badge tone={statusTone[c.status]}>{t(`coins.status.${c.status}`)}</Badge> },
          { key: "pnl", header: t("coins.colPnl"), numeric: true, cell: (c) => (c.pnlSol != null ? <Pnl sol={c.pnlSol} /> : "—") },
          { key: "t", header: t("coins.colLast"), numeric: true, cell: (c) => fmtTime(c.lastEventAt) },
        ]}
      />
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
