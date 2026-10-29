"use client";
import Link from "next/link";
import { memo } from "react";
import type { CoinSummary } from "@/lib/types";
import { shortMint } from "@/lib/format";
import { useFmt, useT } from "@/lib/i18n/client";
import { Badge, Pnl, cn, type Tone } from "@/components/ui";
import { NotTradeableChip } from "@/components/NotTradeable";
import { VirtualList } from "@/components/ui/VirtualList";
import { safeText } from "@/lib/untrusted";

const statusTone: Record<CoinSummary["status"], Tone> = { open: "profit", closed: "info", watching: "brand", rejected: "neutral" };

/**
 * Screener list for large result sets (> 120 rows, decided by the server page): window-virtualized (TanStack Virtual) and memoized
 * rows. Small sets keep the server-rendered <Table>. Same columns, same copy; one compact row layout that
 * also works on mobile (WF-19 card density).
 */
const Row = memo(function Row({ c }: { c: CoinSummary }) {
  const t = useT();
  const f = useFmt();
  const nt = c.screenerState === "UNSUPPORTED_QUOTE_MINT";
  return (
    <div role="row" className="grid min-h-12 grid-cols-[minmax(5rem,1fr)_auto_auto] items-center gap-3 border-b border-border-subtle px-1 py-2 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_8rem_7rem_5rem]">
      <span role="cell"><Link href={`/coins/${c.mint}`} className={cn("inline-flex min-h-11 items-center font-semibold hover:underline", nt ? "text-text-tertiary" : "text-brand-primary")}>${safeText(c.symbol, 16)}</Link></span>
      <span role="cell" className="num hidden text-caption text-text-secondary sm:block">{shortMint(c.mint)}</span>
      <span role="cell" className="hidden truncate text-text-secondary sm:block">{c.strategyName}</span>
      <span role="cell" className="whitespace-nowrap">{nt ? <NotTradeableChip label={t("screener.notTradeable")} /> : <Badge tone={statusTone[c.status]}>{c.status === "rejected" ? t("screener.statusRejected") : t(`coins.status.${c.status}`)}</Badge>}</span>
      <span role="cell" className="num whitespace-nowrap text-right">{c.pnlSol != null && !nt ? <Pnl sol={c.pnlSol} /> : <span className="text-text-tertiary">—</span>}</span>
      <span role="cell" className="num hidden whitespace-nowrap text-right text-text-tertiary sm:block">{f.time(c.lastEventAt)}</span>
    </div>
  );
});

export function CoinsVirtualList({ coins }: { coins: CoinSummary[] }) {
  return (
    <div role="table" aria-rowcount={coins.length}>
      <VirtualList count={coins.length} threshold={0} estimate={() => 52} render={(i) => <Row key={`${coins[i].mint}-${coins[i].strategyId}`} c={coins[i]} />} />
    </div>
  );
}
