import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getApi } from "@/lib/api";
import { listAllStrategies, modesOf, portfolioMode } from "@/lib/mode";
import type { ClosedTrade, TradingMode } from "@/lib/types";
import { parsePnlWindow, pnlReportFromSummary, sameLamports } from "@/lib/pnl-report";
import { shortMint } from "@/lib/format";
import { getT, getFmt } from "@/lib/i18n/server";
import { Card, EmptyState, PageHeader, Pnl, StatStrip, Table } from "@/components/ui";
import { PnlReport } from "@/components/PnlReport";
import { PnlFilters } from "@/components/PnlFilters";
import { PortfolioModeTabs } from "@/components/PortfolioModeTabs";
import { CoinAvatar } from "@/components/CoinAvatar";

export const metadata: Metadata = { title: "PnL report" };

const WINDOW_KEY = { "1h": "pnl.w1h", "24h": "pnl.w24h", "7d": "pnl.w7d", "30d": "pnl.w30d", all: "pnl.wAll" } as const;

async function Report({ searchParams }: { searchParams: PageProps<"/pnl">["searchParams"] }) {
  const api = getApi();
  const [sp, all, t] = await Promise.all([searchParams, listAllStrategies(api), getT()]);
  const modes = modesOf(all);
  const mode = portfolioMode(sp.mode, modes);
  const f = await getFmt(mode);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const strategies = all.filter((s) => s.mode === mode);
  const requested = one(sp.strategy);
  const strategyId = strategies.some((s) => s.id === requested) ? requested : undefined;
  const window = parsePnlWindow(one(sp.window));
  const cursor = one(sp.cursor)?.slice(0, 512) ?? null;
  /** Same filters, different ledger page (keyset cursor is opaque). */
  const listHref = (c: string | null) => {
    const q = new URLSearchParams();
    if (mode === "real") q.set("mode", "real");
    if (strategyId) q.set("strategy", strategyId);
    q.set("window", window);
    if (c) q.set("cursor", c);
    return `/pnl?${q}`;
  };
  /** D7: switching mode keeps the range and the bot filter; only the keyset cursor is dropped. */
  const modeHref = (m: TradingMode) => {
    const q = new URLSearchParams();
    if (m === "real") q.set("mode", "real");
    if (strategyId) q.set("strategy", strategyId);
    q.set("window", window);
    return `/pnl?${q}`;
  };

  const [summary, workspaceSummary, closedRes, overview, coins] = await Promise.all([
    api.getPnlSummary({ mode, strategyId, window }),
    // 0022 scope: realized/unrealized/total are workspace+mode totals and ignore `strategy_id`. Read the card
    // without the bot filter so its closed count / win rate cover exactly the same scope as its money.
    api.getPnlSummary({ mode, window: "all" }),
    // F5-WEB-01: an invalid/foreign cursor is a dead link, not a page crash. Fall back to the first page.
    api.listClosedTradesPage({ mode, strategyId, window, cursor, limit: 50 }).catch(async (e: unknown) => {
      const code = (e as { code?: unknown })?.code ?? (e as Error)?.message;
      if (cursor && (code === "CURSOR_INVALID" || (e as Error)?.name === "CursorInvalid")) {
        return { page: await api.listClosedTradesPage({ mode, strategyId, window, cursor: null, limit: 50 }), cursorReset: true };
      }
      throw e;
    }).then((r) => ("page" in r ? r : { page: r, cursorReset: false })),
    api.getOverview(mode).catch(() => null),
    api.listCoins(mode).catch(() => []),
  ]);
  const closed = closedRes.page;
  const cursorReset = closedRes.cursorReset;
  const allTime = pnlReportFromSummary(
    {
      realizedPnlSol: workspaceSummary.realizedPnlSol,
      unrealizedPnlSol: workspaceSummary.unrealizedPnlSol,
      totalPnlSol: workspaceSummary.totalPnlSol,
      closedCount: workspaceSummary.closedCount,
      winCount: workspaceSummary.winCount,
      winRatePct: workspaceSummary.winRatePct,
    },
    overview?.openPositions ?? null,
  );
  const coin = new Map(coins.map((c) => [c.mint, c]));
  const name = new Map(all.map((s) => [s.id, s.name]));
  const rows: ClosedTrade[] = closed.items.map((r) => {
    const c = coin.get(r.mint);
    return { ...r, symbol: r.symbol ?? c?.symbol ?? shortMint(r.mint), logoHash: r.logoHash ?? c?.logoHash ?? null };
  });
  /** Entry → exit in WIB; the exit day is shown only when the position crossed midnight (dense ledger). */
  const when = (r: ClosedTrade) =>
    f.sameDay(r.openedAt, r.closedAt)
      ? `${f.dateTimeShort(r.openedAt)} → ${f.time(r.closedAt)}`
      : `${f.dateTimeShort(r.openedAt)} → ${f.dateTimeShort(r.closedAt)}`;
  const exitsLink = (
    <Link href={mode === "real" ? "/stats?mode=real" : "/stats"} className="inline-flex h-9 items-center rounded-md border border-border-default px-3 text-label text-text-secondary hover:bg-bg-raised">
      {t("pnl.exitsLink")}
    </Link>
  );

  const rangeLabel = t(WINDOW_KEY[window]);
  const unit = t(mode === "practice" ? "overview.paperSol" : "overview.realSol");
  // 0022 scope: the card's realized/unrealized/total are workspace+mode totals. With a bot filter the
  // numbers below the filter come from that bot only, so say so instead of showing two "all-time" values.
  const botName = strategyId ? (name.get(strategyId) ?? shortMint(strategyId)) : null;
  // Lamport-exact: a 1-lamport difference must not read as "reconciled" just because floats are close.
  // F1: with no all-time snapshot there is nothing to reconcile — never compare against a made-up 0.
  const reconciled =
    summary.realizedWindowSol != null &&
    summary.realizedPnlSol != null &&
    sameLamports(summary.realizedWindowSol, summary.realizedPnlSol);
  const scopeNote = botName ? t("pnl.scopeAllBots", { bot: botName }) : null;
  // All-time realized can differ from the windowed value at any range (partial take-profits on open
  // positions, closes outside the range), including All. Show the note whenever they differ; a missing
  // side stays an em dash (Pnl / f.sol guard), never 0.00.
  const showReconcile = !botName && !reconciled && (summary.realizedPnlSol != null || summary.realizedWindowSol != null);

  return (
    <>
      <PageHeader
        title={t("pnl.title")}
        subtitle={t("pnl.subtitle")}
        actions={<PortfolioModeTabs mode={mode} modes={modes} href={modeHref} t={t} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PnlFilters strategies={strategies.map((s) => ({ id: s.id, name: s.name }))} />
        {exitsLink}
      </div>

      {cursorReset && (
        <p className="mt-2 rounded-md bg-bg-sunken p-3 text-caption text-text-secondary" data-testid="pnl-cursor-reset" role="status">
          {t("apiError.CURSOR_INVALID")}
        </p>
      )}

      <PnlReport report={allTime} mode={mode} t={t} f={f} href={null} layout="strip" heading={botName ? t("pnl.allBotsHeading") : t("pnl.allTime")} />

      {scopeNote && (
        <p className="mt-2 text-caption text-text-tertiary" data-testid="pnl-scope">
          {scopeNote}
        </p>
      )}

      <StatStrip
        className="mt-4"
        columns={5}
        label={t("pnl.rangeAria", { window: rangeLabel })}
        items={[
          { label: t("pnl.realizedIn", { window: rangeLabel }), value: summary.realizedWindowSol != null ? <Pnl sol={summary.realizedWindowSol} mode={mode} unit wrapUnit /> : "—", hint: t("pnl.realizedHint") },
          { label: t("pnl.closed"), value: f.int(summary.closedCount), hint: t("pnl.wins", { n: summary.winCount }) },
          { label: t("pnl.winRate"), value: summary.winRatePct != null ? `${f.num(summary.winRatePct, 1)}%` : "—", hint: summary.winRatePct != null ? t("pnl.ofClosed", { n: summary.closedCount }) : t("pnl.noClosedShort") },
          // NBSP keeps "9 mnt" together but lets a narrow 5-cell strip break between the two groups.
          { label: t("pnl.avgHold"), value: summary.avgHoldSeconds != null ? f.duration(summary.avgHoldSeconds).replace(/(\p{L})\u00A0(?=\d)/gu, "$1 ") : "—" },
          {
            label: t("pnl.fees"),
            value: summary.feesSol != null
              ? <>{f.sol(summary.feesSol, { unit: false })}<span className="text-caption font-normal"> {t(mode === "practice" ? "overview.paperSol" : "overview.realSol")}</span></>
              : "—",
            hint: t("pnl.feesHint"),
          },
        ]}
      />

      {(summary.bestPnlSol != null || summary.worstPnlSol != null) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-tertiary">
          {summary.bestPnlSol != null && <span>{t("pnl.best")}: <Pnl sol={summary.bestPnlSol} mode={mode} unit /></span>}
          {summary.worstPnlSol != null && <span>{t("pnl.worst")}: <Pnl sol={summary.worstPnlSol} mode={mode} unit /></span>}
        </p>
      )}

      {showReconcile && (
        <p className="mt-3 rounded-md bg-bg-sunken p-3 text-caption text-text-secondary" data-testid="pnl-reconcile">
          {t("pnl.reconcile", { all: summary.realizedPnlSol != null ? f.sol(summary.realizedPnlSol) : "—", range: summary.realizedWindowSol != null ? f.sol(summary.realizedWindowSol) : "—", window: rangeLabel })}
        </p>
      )}

      <Card
        className="mt-4"
        title={t("pnl.ledger")}
        action={
          <span className="text-caption text-text-tertiary">
            {cursor ? t("pnl.pageCount", { n: rows.length }) : t("pnl.latest", { n: rows.length })}
          </span>
        }
      >
        <p className="mb-2 text-caption text-text-tertiary">
          {t("pnl.ledgerNote", { unit })}
          <span className="hidden sm:inline xl:hidden"> · {t("pnl.scrollHint")}</span>
        </p>
        <Table<ClosedTrade>
          rows={rows}
          rowKey={(r) => r.id}
          minWidth={900}
          dense
          mobile="cards"
          labels={{ expand: t("table.expand"), scrollHint: t("table.scrollHint") }}
          empty={
            <EmptyState
              title={cursor ? t("pnl.emptyPage") : t("pnl.empty")}
              detail={cursor ? t("pnl.newer") : summary.closedCount > 0 ? t("pnl.emptyCapped") : t("pnl.emptyDetail")}
            />
          }
          columns={[
            {
              key: "coin",
              header: t("pnl.colCoin"),
              cell: (r) => (
                <Link href={`/coins/${r.mint}`} className="inline-flex min-h-11 items-center gap-2 hover:underline">
                  <CoinAvatar mint={r.mint} logoHash={r.logoHash} symbol={r.symbol ?? undefined} />
                  <span className="font-medium text-text-primary">{r.symbol ?? shortMint(r.mint)}</span>
                </Link>
              ),
            },
            { key: "strategy", header: t("pnl.colStrategy"), cell: (r) => <div className="max-w-[8.5rem] truncate" title={r.strategyId ? name.get(r.strategyId) : undefined}>{r.strategyId ? name.get(r.strategyId) ?? "—" : "—"}</div> },
            { key: "in", header: t("pnl.colIn"), numeric: true, cell: (r) => (r.solInSol != null ? f.sol(r.solInSol, { unit: false }) : "—") },
            { key: "out", header: t("pnl.colOut"), numeric: true, cell: (r) => (r.solOutSol != null ? f.sol(r.solOutSol, { unit: false }) : "—") },
            { key: "pnl", header: t("pnl.colRealized"), numeric: true, cell: (r) => <Pnl sol={r.pnlSol} mode={mode} /> },
            { key: "pct", header: t("pnl.colPct"), numeric: true, cell: (r) => (r.pnlPct != null ? <Pnl pct={r.pnlPct} mode={mode} /> : "—") },
            { key: "fees", header: t("pnl.colFees"), numeric: true, headerWrap: true, cell: (r) => (r.feesSol != null ? f.sol(r.feesSol, { unit: false }) : "—") },
            { key: "window", header: t("pnl.colWindow"), nowrap: true, cell: (r) => <span className="text-text-secondary">{when(r)}</span> },
            { key: "hold", header: t("pnl.colHold"), numeric: true, cell: (r) => (r.holdSeconds != null ? f.duration(r.holdSeconds) : "—") },
            { key: "exit", header: t("pnl.colExit"), nowrap: true, headerWrap: true, cell: (r) => (r.exitReason ? t(`exitReason.${r.exitReason}`) : "—") },
          ]}
        />
      </Card>

      {(cursor || closed.nextCursor) && (
        <nav className="mt-3 flex items-center justify-between gap-3" aria-label={t("pnl.ledger")}>
          {cursor ? (
            <Link href={listHref(null)} className="tap text-caption text-brand-primary hover:underline">
              {t("pnl.newer")}
            </Link>
          ) : <span />}
          {closed.nextCursor && (
            <Link href={listHref(closed.nextCursor)} className="tap text-caption text-brand-primary hover:underline">
              {t("pnl.older")} →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

export default function PnlReportPage({ searchParams }: PageProps<"/pnl">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-bg-surface" />}>
      <Report searchParams={searchParams} />
    </Suspense>
  );
}