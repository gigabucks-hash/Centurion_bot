"use client";
import Link from "next/link";
import { memo, useCallback, useRef, useState } from "react";
import type { TradingMode } from "@/lib/types";
import { fetchCoinsPage } from "@/lib/client";
import { ApiError, errorText } from "@/lib/errors";
import type { CoinSummary } from "@/lib/types";
import { shortMint } from "@/lib/format";
import { useFmt, useT } from "@/lib/i18n/client";
import { Badge, Button, Pnl, cn, type Tone } from "@/components/ui";
import { NotTradeableChip } from "@/components/NotTradeable";
import { VirtualList } from "@/components/ui/VirtualList";
import { safeText } from "@/lib/untrusted";
import { Mcap } from "@/components/Mcap";

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
    <div role="row" className="grid min-h-12 grid-cols-[minmax(5rem,1fr)_auto_auto] items-center gap-3 border-b border-border-subtle px-1 py-2 sm:grid-cols-[8rem_8rem_minmax(0,1fr)_8rem_7rem_6rem_5rem]">
      <span role="cell"><Link href={`/coins/${c.mint}`} className={cn("inline-flex min-h-11 items-center font-semibold hover:underline", nt ? "text-text-tertiary" : "text-brand-primary")}>${safeText(c.symbol, 16)}</Link></span>
      <span role="cell" className="num hidden text-caption text-text-secondary sm:block">{shortMint(c.mint)}</span>
      <span role="cell" className="hidden truncate text-text-secondary sm:block">{c.strategyName}</span>
      <span role="cell" className="whitespace-nowrap">{nt ? <NotTradeableChip label={t("screener.notTradeable")} /> : <Badge tone={statusTone[c.status]}>{c.status === "rejected" ? t("screener.statusRejected") : t(`coins.status.${c.status}`)}</Badge>}</span>
      <span role="cell" className="num whitespace-nowrap text-right">{c.pnlSol != null && !nt ? <Pnl sol={c.pnlSol} /> : <span className="text-text-tertiary">—</span>}</span>
      <span role="cell" className="hidden text-right sm:block"><Mcap m={c.mcap} t={t} locale={t.locale} time={f.time} compact /></span>
      <span role="cell" className="num hidden whitespace-nowrap text-right text-text-tertiary sm:block">{f.time(c.lastEventAt)}</span>
    </div>
  );
});

/** + 1.1.4 keyset load-more: auto when the last rendered row comes into view, plus a labelled button (a11y). */
export function CoinsVirtualList({ coins: initial, nextCursor: initialCursor = null, mode = "practice" }: { coins: CoinSummary[]; nextCursor?: string | null; mode?: TradingMode }) {
  const t = useT();
  const [coins, setCoins] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const more = useCallback(async () => {
    if (!cursor || busy.current) return;
    busy.current = true;
    setLoading(true);
    setErr(null);
    try {
      const p = await fetchCoinsPage(mode, cursor);
      setCoins((c) => [...c, ...p.items]);
      setCursor(p.nextCursor);
    } catch (e) {
      if (e instanceof ApiError && e.code === "CURSOR_INVALID") {
        // The list changed under the cursor: start over from the first page.
        const p = await fetchCoinsPage(mode, null).catch(() => null);
        if (p) {
          setCoins(p.items);
          setCursor(p.nextCursor);
        }
      } else setErr(errorText(t, e));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [cursor, mode, t]);
  return (
    <div role="table" aria-rowcount={cursor ? -1 : coins.length} aria-busy={loading || undefined}>
      <VirtualList
        count={coins.length}
        threshold={0}
        estimate={() => 52}
        onEndReached={cursor ? more : undefined}
        render={(i) => <Row key={`${coins[i].mint}-${coins[i].strategyId}`} c={coins[i]} />}
      />
      {(cursor || err) && (
        <div className="mt-3 flex items-center justify-center gap-3">
          {err && <span className="text-caption text-semantic-loss">{err}</span>}
          {cursor && <Button className="min-h-11" loading={loading} onClick={more}>{t("common.loadMore")}</Button>}
        </div>
      )}
    </div>
  );
}
