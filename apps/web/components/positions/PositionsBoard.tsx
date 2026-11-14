"use client";
import { ApiError, errorText } from "@/lib/errors";
import { NotTradeableCta } from "@/components/NotTradeable";
import { isOrderFailReason, orderFailedText } from "@/lib/notify";
import { solToLamports } from "@/lib/contracts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Keyboard } from "lucide-react";
import type { OpenPosition, TradingMode } from "@/lib/types";
import { closePositionClient } from "@/lib/client";
import { useFmtFor, useT } from "@/lib/i18n/client";
import { Badge, Button, Card, EmptyState, Pnl, cn } from "@/components/ui";
import { HoldButton, Segmented, useNow, useToast } from "@/components/ui/client";
import { ModeBadge } from "@/components/domain";
import { VirtualTbody } from "@/components/ui/VirtualList";
import { useMarks } from "@/components/shell/RealtimeProvider";
import { applyMark } from "@/lib/marks";
import { CoinAvatar } from "@/components/CoinAvatar";
import { sellHoldHint } from "@/lib/hold-hint";

/** QA-11 (decision C1): Sell is always a hold — 1.2 s Practice / 2.5 s Real, on every platform. */
const SELL_HOLD_MS: Record<TradingMode, number> = { practice: 1200, real: 2500 };
const PCTS = ["25", "50", "100"] as const;

/**
 * Positions (WF-11/12). Desktop: table + detail/sell panel. Mobile (< 640 px): sticky first column +
 * horizontal scroll (MOBILE_TABLES pattern B, users compare numbers across rows).
 * Keyboard: J/K move · Space details · ↵ chart · ⇧X sell focused · Esc close.
 */
export function PositionsBoard({ initial }: { initial: OpenPosition[] }) {
  const t = useT();
  const fmtFor = useFmtFor();
  // QA-04: Paper amounts always say "paper SOL" (column headers included). Per-strategy mode: rows carry their own mode;
  // a mixed list uses the plain unit in headers and every row shows its Paper/Real chip.
  const mixed = initial.some((r) => r.mode === "real");
  const unit = t(mixed ? "overview.realSol" : "overview.paperSol");
  const toast = useToast();
  const router = useRouter();
  const now = useNow(1000);
  const [rows, setRows] = useState(initial);
  // Live marks (rAF-batched in RealtimeProvider) only change what is displayed, never the stored rows.
  const marks = useMarks();
  const view = useMemo(() => rows.map((r) => applyMark(r, marks.get(r.mint))), [rows, marks]);
  const [focusId, setFocusId] = useState<string | null>(initial[0]?.key ?? null);
  const [sellOpen, setSellOpen] = useState(false);
  const [pct, setPct] = useState<(typeof PCTS)[number]>("100");
  /** D8: the "released early" note only appears after the user releases a hold on this row, never on idle. */
  const [releasedFor, setReleasedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const focused = view.find((r) => r.key === focusId) ?? null;
  /** Real safety rules follow the focused position's own strategy mode. */
  const mode: TradingMode = focused?.mode ?? "practice";
  const f = fmtFor(mode);
  const sellRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({ rows, focused });
  useEffect(() => {
    stateRef.current = { rows, focused };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const { rows: list, focused: cur } = stateRef.current;
      const i = cur ? list.findIndex((r) => r.key === cur.key) : -1;
      if (e.key === "j" || e.key === "ArrowDown") setFocusId(list[Math.min(list.length - 1, i + 1)]?.key ?? null);
      else if (e.key === "k" || e.key === "ArrowUp") setFocusId(list[Math.max(0, i - 1)]?.key ?? null);
      else if (e.key === " " && cur) setSellOpen(false);
      else if (e.key === "Enter" && cur) router.push(`/coins/${cur.mint}#chart`);
      else if ((e.key === "X" || e.key === "x") && e.shiftKey && cur) {
        setReleasedFor(null);
        setSellOpen(true);
        setTimeout(() => sellRef.current?.querySelector<HTMLElement>("[role=radio]")?.focus(), 0);
      } else if (e.key === "Escape") setSellOpen(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Balances never mix modes: one total per mode.
  const totals = useMemo(
    () =>
      (["practice", "real"] as const)
        .map((m) => {
          const vs = view.filter((r) => r.mode === m);
          return { mode: m, n: vs.length, cost: vs.reduce((s, r) => s + r.solIn * (1 - r.soldPct / 100), 0), unreal: vs.every((r) => !r.markUnknown) ? vs.reduce((s, r) => s + r.pnlSol * (1 - r.soldPct / 100), 0) : null };
        })
        .filter((x) => x.n > 0),
    [view],
  );
  const openSell = useCallback((k: string) => {
    setFocusId(k);
    setReleasedFor(null);
    setSellOpen(true);
  }, []);

  async function sell(heldMs: number) {
    if (!focused) return;
    setBusy(true);
    setReleasedFor(null);
    try {
      void heldMs; // hold-to-confirm is a client gesture; 1.1.2 close carries only fraction_bps + If-Match
      const r = await closePositionClient(focused, Number(pct));
      toast({ kind: "success", text: t("positions.soldToast", { symbol: focused.symbol, pct: f.pct(Number(pct), 0, false) }) });
      setRows((p) => (r.position.soldPct >= 100 ? p.filter((x) => x.key !== focused.key) : p.map((x) => (x.key === focused.key ? r.position : x))));
      setSellOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "VERSION_CONFLICT") {
        // 1.1.2: stale position rev → adopt error.current_rev and let the user retry with fresh data.
        const cur = Number(e.details.current_rev);
        if (Number.isInteger(cur)) setRows((p) => p.map((x) => (x.key === focused.key ? { ...x, rev: cur } : x)));
        toast({ kind: "error", text: errorText(t, e) });
      } else if (e instanceof ApiError && isOrderFailReason(e.code)) {
        const n = orderFailedText(t, { side: "sell", symbol: focused.symbol, reason_code: e.code, mode, amount_lamports: solToLamports(focused.solIn * (1 - focused.soldPct / 100) * (Number(pct) / 100)) });
        toast({ kind: "error", text: `${n.title} · ${n.body}` });
      } else toast({ kind: "error", text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) return <EmptyState title={t("positions.empty")} detail={t("positions.emptyDetail")} />;
  const remaining = (r: OpenPosition) => 1 - r.soldPct / 100;
  const holdS = (r: OpenPosition) => Math.max(0, Math.round(((now ?? r.openedAt) - r.openedAt) / 1000));

  return (
    <>
      {totals.map((x) => (
        <p key={x.mode} className="mb-3 flex flex-wrap items-center gap-2 text-body text-text-secondary">
          {mixed && <ModeBadge mode={x.mode} />}
          <span>{t("positions.summary", { open: t.ux("positions.open_count", { count: x.n }), cost: fmtFor(x.mode).sol(x.cost) })} · <Pnl sol={x.unreal} unit mode={x.mode} /></span>
        </p>
      ))}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <p className="mb-1 text-caption text-text-tertiary sm:hidden">{t("table.scrollHint")} →</p>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full table-fixed text-body">
              <colgroup>
                <col style={{ width: "13%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "11%" }} />
              </colgroup>
              <thead>
                <tr className="text-left text-caption text-text-tertiary">
                  <th scope="col" className="sticky top-0 left-0 z-30 border-b border-border-subtle bg-bg-surface px-2 py-2 font-medium sm:left-auto">{t("positions.colCoin")}</th>
                  <th scope="col" className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface px-2 py-2 font-medium">{t("positions.colStrategy")}</th>
                  <th scope="col" className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface px-2 py-2 text-right font-medium whitespace-normal">{t("positions.colSize", { unit })}</th>
                  <th scope="col" className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface px-2 py-2 text-right font-medium whitespace-nowrap">{t("positions.colPrice")}</th>
                  <th scope="col" className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface px-2 py-2 text-right font-medium whitespace-normal">{t("positions.colPnlSol", { unit })}</th>
                  <th scope="col" className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface px-2 py-2 text-right font-medium whitespace-nowrap">{t("positions.colPnlPct")}</th>
                  <th scope="col" className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface px-2 py-2 text-right font-medium whitespace-nowrap">{t("positions.colHold")}</th>
                  <th scope="col" className="sticky top-0 z-20 border-b border-border-subtle bg-bg-surface px-2 py-2"><span className="sr-only">{t("positions.sell")}</span></th>
                </tr>
              </thead>
              <VirtualTbody
                count={view.length}
                rowHeight={44}
                colSpan={8}
                render={(i) => {
                  const r = view[i];
                  return <PositionRow key={r.key} r={r} focused={r.key === focusId} holdS={holdS(r)} onFocus={setFocusId} onSell={openSell} />;
                }}
              />
            </table>
          </div>
          <div className="mt-3 hidden flex-wrap gap-x-4 gap-y-1 text-caption text-text-tertiary lg:flex">
            <Keyboard size={14} aria-hidden />
            {([["J / K", "shortcut.jk"], ["Space", "shortcut.space"], ["↵", "shortcut.enter"], ["⇧X", "shortcut.shift_x"], ["Esc", "shortcut.esc"]] as const).map(([k, key]) => (
              <span key={k}><kbd className="num text-text-primary">{k}</kbd> {t.ux(key)}</span>
            ))}
          </div>
        </Card>

        {focused && (
          <Card title={<span className="inline-flex items-center gap-2"><CoinAvatar mint={focused.mint} logoHash={focused.logoHash} symbol={focused.symbol} size="md" />{focused.symbol} · {focused.strategyName}</span>} action={<ModeBadge mode={mode} />}>
            <dl className="grid grid-cols-2 gap-2 text-caption">
              <div className="rounded-md bg-bg-sunken px-2 py-1.5"><dt className="text-text-tertiary">{t("positions.colSize", { unit })}</dt><dd className="num whitespace-nowrap">{f.sol(focused.solIn * remaining(focused))}</dd></div>
              <div className="rounded-md bg-bg-sunken px-2 py-1.5"><dt className="text-text-tertiary">{t("positions.colPnlSol", { unit })}</dt><dd><Pnl sol={focused.markUnknown ? null : focused.pnlSol * remaining(focused)} unit mode={mode} /></dd></div>
              <div className="rounded-md bg-bg-sunken px-2 py-1.5"><dt className="text-text-tertiary">{t("positions.lossGuard")}</dt><dd className="num">{focused.markUnknown ? "—" : f.pct(-focused.stopLossPct, 0)}</dd></div>
              <div className="rounded-md bg-bg-sunken px-2 py-1.5"><dt className="text-text-tertiary">{t("positions.trail")}</dt><dd className="num">{focused.markUnknown ? "—" : f.pct(-focused.trailingPct, 0)}</dd></div>
            </dl>
            {focused.soldPct > 0 && <p className="mt-2 text-caption text-text-secondary">{t("positions.alreadySold", { pct: f.pct(focused.soldPct, 0, false) })}</p>}
            <Link href={`/coins/${focused.mint}`} className="mt-3 inline-block text-label text-brand-primary hover:underline">{t("approvals.openTrail")}</Link>

            {sellOpen ? (
              <div ref={sellRef} className={cn("mt-4 rounded-md border p-3", mode === "real" ? "border-mode-real" : "border-border-default")}>
                <p className="text-titleSm">{t.ux("positions.sell.title", { symbol: focused.symbol })}</p>
                <div className="mt-2"><Segmented label={t("positions.sellShare")} value={pct} onChange={(v) => { setPct(v); setReleasedFor(null); }} options={PCTS.map((p) => ({ value: p, label: f.pct(Number(p), 0, false) }))} /></div>
                <p className="mt-3 flex justify-between text-caption"><span className="text-text-tertiary">{t.ux("positions.sell.estimate")}</span><span className="num">≈ {focused.markUnknown ? "—" : f.sol(focused.solIn * remaining(focused) * (1 + focused.pnlPct / 100) * (Number(pct) / 100))}</span></p>
                <p className="mt-1 text-caption text-text-secondary">{pct === "100" ? t.ux("positions.sell.plan_cancelled") : t.ux("positions.sell.remaining_plan")}</p>
                <div className="sticky bottom-[calc(3rem+env(safe-area-inset-bottom))] z-20 -mx-3 mt-3 grid gap-2 border-t border-border-subtle bg-bg-surface/95 px-3 pt-3 backdrop-blur sm:grid-cols-2 lg:bottom-0">
                  <HoldButton durationMs={SELL_HOLD_MS[mode]} variant={mode === "real" ? "real" : "warning"} disabled={busy || mode === "real" || !!focused.screenerState} onConfirm={(ms) => { setReleasedFor(null); void sell(ms); }} onHoldChange={(holding) => { if (!holding) setReleasedFor(focused.key); }} hint={sellHoldHint(t, releasedFor === focused.key)}>
                    {t.ux(mode === "real" ? "positions.sell.hold.real" : "positions.sell.hold.practice", { pct: f.pct(Number(pct), 0, false) })}
                  </HoldButton>
                  <Button variant="primary" size="lg" onClick={() => setSellOpen(false)}>{t("common.cancelEsc")}</Button>
                </div>
                {/* Contract: manual close is Paper-only for now (backend answers 403 MODE_NOT_ALLOWED on Real). */}
                {mode === "real" && <p className="mt-2 text-caption text-text-secondary" data-close-disabled>{t.ux("positions.sell.unavailable")} {t("strategyMode.realSellNote")}</p>}
                <p className="mt-2 text-caption text-text-tertiary">{t.ux("positions.sell.never_from_notification")}</p>
              </div>
            ) : (
              focused.screenerState ? (
                <NotTradeableCta label={t("notTradeable.sellUnavailable")} note={t("notTradeable.sellDetail")} />
              ) : (
                <Button className="mt-4 min-h-12 w-full sm:min-h-0" variant={mode === "real" ? "real" : "secondary"} onClick={() => { setReleasedFor(null); setSellOpen(true); }}>{t("positions.sell")}…</Button>
              )
            )}
            {mode === "practice" && <Badge className="mt-3">{t("positions.simulated")}</Badge>}
          </Card>
        )}
      </div>
    </>
  );
}

/** One positions row. Memoized: focus/sell-panel changes elsewhere don't re-render every row. */
const PositionRow = memo(function PositionRow({ r, focused, holdS, onFocus, onSell }: { r: OpenPosition; focused: boolean; holdS: number; onFocus: (k: string) => void; onSell: (k: string) => void }) {
  const t = useT();
  const f = useFmtFor()(r.mode);
  const remaining = 1 - r.soldPct / 100;
  return (
    <tr
      onClick={() => onFocus(r.key)}
      aria-selected={focused}
      className={cn("group h-11 cursor-pointer hover:bg-bg-raised", focused && "bg-bg-raised")}
    >
      <th scope="row" className={cn("sticky left-0 z-10 border-b border-border-subtle bg-bg-surface px-2 text-left font-medium group-hover:bg-bg-raised sm:static", focused && "bg-bg-raised")}>
        <Link href={`/coins/${r.mint}`} className="inline-flex min-h-11 items-center gap-2 truncate hover:underline"><CoinAvatar mint={r.mint} logoHash={r.logoHash} symbol={r.symbol} />{r.symbol}</Link>
      </th>
      <td className="border-b border-border-subtle px-2 text-text-secondary"><span className="block truncate">{r.strategyName}</span><ModeBadge mode={r.mode} /></td>
      <td className="num border-b border-border-subtle px-2 text-right text-numSm whitespace-nowrap">{f.sol(r.solIn * remaining, { unit: false })}</td>
      <td className="num border-b border-border-subtle px-2 text-right text-caption whitespace-normal text-text-secondary">{(r.priceUnknown || r.markUnknown) ? "—" : <>{f.usd(r.entryPriceUsd)}<span className="text-text-tertiary"> → </span>{f.usd(r.nowPriceUsd)}</>}</td>
      <td className="border-b border-border-subtle px-2 text-right whitespace-nowrap"><Pnl sol={r.markUnknown ? null : r.pnlSol * remaining} mode={r.mode} /></td>
      <td className="border-b border-border-subtle px-2 text-right whitespace-nowrap"><Pnl pct={r.markUnknown ? null : r.pnlPct} mode={r.mode} /></td>
      <td className="num border-b border-border-subtle px-2 text-right text-numSm whitespace-nowrap">{f.duration(holdS)}</td>
      <td className="border-b border-border-subtle px-2 text-right">
        <Button size="sm" variant="secondary" className="min-h-11 whitespace-nowrap" disabled={!!r.screenerState} onClick={(e) => { e.stopPropagation(); onSell(r.key); }}>
          {t("positions.sell")} <kbd className="num hidden text-caption opacity-70 lg:inline">⇧X</kbd>
        </Button>
      </td>
    </tr>
  );
});
