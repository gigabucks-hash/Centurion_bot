"use client";
import { ApiError, codeText, errorText } from "@/lib/errors";
import { NotTradeableCta } from "@/components/NotTradeable";
import { isOrderFailReason, orderFailedText } from "@/lib/notify";
import { solToLamports } from "@/lib/contracts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Keyboard } from "lucide-react";
import type { OpenPosition, TradingMode } from "@/lib/types";
import { closePositionClient } from "@/lib/client";
import { useFmt, useT } from "@/lib/i18n/client";
import { Badge, Button, Card, EmptyState, Pnl, cn } from "@/components/ui";
import { HoldButton, Segmented, useNow, useToast } from "@/components/ui/client";
import { ModeBadge } from "@/components/domain";
import { VirtualTbody } from "@/components/ui/VirtualList";
import { useMarks } from "@/components/shell/RealtimeProvider";
import { applyMark } from "@/lib/marks";
import { CoinAvatar } from "@/components/CoinAvatar";

/** QA-11 (decision C1): Sell is always a hold — 1.2 s Practice / 2.5 s Real, on every platform. */
const SELL_HOLD_MS: Record<TradingMode, number> = { practice: 1200, real: 2500 };
const PCTS = ["25", "50", "100"] as const;

/**
 * Positions (WF-11/12). Desktop: table + detail/sell panel. Mobile (< 640 px): sticky first column +
 * horizontal scroll (MOBILE_TABLES pattern B, users compare numbers across rows).
 * Keyboard: J/K move · Space details · ↵ chart · ⇧X sell focused · Esc close.
 */
export function PositionsBoard({ initial, mode }: { initial: OpenPosition[]; mode: TradingMode }) {
  const t = useT();
  const f = useFmt();
  // QA-04: Practice amounts always say "paper SOL" (column headers included).
  const unit = t(mode === "practice" ? "overview.paperSol" : "overview.realSol");
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
  const [busy, setBusy] = useState(false);
  const focused = view.find((r) => r.key === focusId) ?? null;
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
        setSellOpen(true);
        setTimeout(() => sellRef.current?.querySelector<HTMLElement>("[role=radio]")?.focus(), 0);
      } else if (e.key === "Escape") setSellOpen(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const totals = useMemo(() => ({ cost: view.reduce((s, r) => s + r.solIn * (1 - r.soldPct / 100), 0), unreal: view.reduce((s, r) => s + r.pnlSol * (1 - r.soldPct / 100), 0) }), [view]);
  const openSell = useCallback((k: string) => {
    setFocusId(k);
    setSellOpen(true);
  }, []);

  async function sell(heldMs: number) {
    if (!focused) return;
    setBusy(true);
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
      <p className="mb-3 text-body text-text-secondary">
        {t("positions.summary", { open: t.ux("positions.open_count", { count: rows.length }), cost: f.sol(totals.cost) })} · <Pnl sol={totals.unreal} unit />
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <p className="mb-1 text-caption text-text-tertiary sm:hidden">{t("table.scrollHint")} →</p>
          <div className="-mx-4 overflow-x-auto [mask-image:linear-gradient(to_right,black_90%,transparent)] sm:[mask-image:none]">
            <table className="w-full min-w-[720px] text-body">
              <thead>
                <tr className="border-b border-border-subtle text-left text-label text-text-tertiary">
                  <th scope="col" className="sticky left-0 z-10 bg-bg-surface px-4 py-2 font-medium shadow-[10px_0_10px_-10px_rgba(0,0,0,0.5)] sm:shadow-none">{t("positions.colCoin")}</th>
                  <th scope="col" className="px-4 py-2 font-medium">{t("positions.colStrategy")}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-medium">{t("positions.colSize", { unit })}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-medium">{t("positions.colPrice")}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-medium">{t("positions.colPnlSol", { unit })}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-medium">{t("positions.colPnlPct")}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-medium">{t("positions.colHold")}</th>
                  <th scope="col" className="px-4 py-2"><span className="sr-only">{t("positions.sell")}</span></th>
                </tr>
              </thead>
              <VirtualTbody
                count={view.length}
                rowHeight={52}
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
          <Card title={<span className="inline-flex items-center gap-2"><CoinAvatar mint={focused.mint} logoUrl={focused.logoUrl} size="md" />{focused.symbol} · {focused.strategyName}</span>} action={<ModeBadge mode={mode} />}>
            <dl className="grid grid-cols-2 gap-2 text-caption">
              <div className="rounded-md bg-bg-sunken px-2 py-1.5"><dt className="text-text-tertiary">{t("positions.colSize", { unit })}</dt><dd className="num whitespace-nowrap">{f.sol(focused.solIn * remaining(focused))}</dd></div>
              <div className="rounded-md bg-bg-sunken px-2 py-1.5"><dt className="text-text-tertiary">{t("positions.colPnlSol", { unit })}</dt><dd><Pnl sol={focused.pnlSol * remaining(focused)} unit /></dd></div>
              <div className="rounded-md bg-bg-sunken px-2 py-1.5"><dt className="text-text-tertiary">{t("positions.lossGuard")}</dt><dd className="num">{f.pct(-focused.stopLossPct, 0)}</dd></div>
              <div className="rounded-md bg-bg-sunken px-2 py-1.5"><dt className="text-text-tertiary">{t("positions.trail")}</dt><dd className="num">{f.pct(-focused.trailingPct, 0)}</dd></div>
            </dl>
            {focused.soldPct > 0 && <p className="mt-2 text-caption text-text-secondary">{t("positions.alreadySold", { pct: f.pct(focused.soldPct, 0, false) })}</p>}
            <Link href={`/coins/${focused.mint}`} className="mt-3 inline-block text-label text-brand-primary hover:underline">{t("approvals.openTrail")}</Link>

            {sellOpen ? (
              <div ref={sellRef} className={cn("mt-4 rounded-md border p-3", mode === "real" ? "border-mode-real" : "border-border-default")}>
                <p className="text-titleSm">{t.ux("positions.sell.title", { symbol: focused.symbol })}</p>
                <div className="mt-2"><Segmented label={t("positions.sellShare")} value={pct} onChange={setPct} options={PCTS.map((p) => ({ value: p, label: f.pct(Number(p), 0, false) }))} /></div>
                <p className="mt-3 flex justify-between text-caption"><span className="text-text-tertiary">{t.ux("positions.sell.estimate")}</span><span className="num">≈ {f.sol(focused.solIn * remaining(focused) * (1 + focused.pnlPct / 100) * (Number(pct) / 100))}</span></p>
                <p className="mt-1 text-caption text-text-secondary">{pct === "100" ? t.ux("positions.sell.plan_cancelled") : t.ux("positions.sell.remaining_plan")}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <HoldButton durationMs={SELL_HOLD_MS[mode]} variant={mode === "real" ? "real" : "warning"} disabled={busy || mode === "real" || !!focused.screenerState} onConfirm={sell} hint={t.ux("positions.sell.hold.released")}>
                    {t.ux(mode === "real" ? "positions.sell.hold.real" : "positions.sell.hold.practice", { pct: f.pct(Number(pct), 0, false) })}
                  </HoldButton>
                  <Button variant="primary" size="lg" onClick={() => setSellOpen(false)}>{t("common.cancelEsc")}</Button>
                </div>
                {mode === "real" && <p className="mt-2 text-caption text-text-secondary" data-close-disabled>{codeText(t, "MODE_NOT_ALLOWED")}</p>}
                <p className="mt-2 text-caption text-text-tertiary">{t.ux("positions.sell.never_from_notification")}</p>
              </div>
            ) : (
              focused.screenerState ? (
                <NotTradeableCta label={t("notTradeable.sellUnavailable")} note={t("notTradeable.sellDetail")} />
              ) : (
                <Button className="mt-4 min-h-12 w-full sm:min-h-0" variant={mode === "real" ? "real" : "secondary"} onClick={() => setSellOpen(true)}>{t("positions.sell")}…</Button>
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
  const f = useFmt();
  const remaining = 1 - r.soldPct / 100;
  return (
    <tr
      onClick={() => onFocus(r.key)}
      aria-selected={focused}
      className={cn("h-[52px] cursor-pointer border-b border-border-subtle last:border-0 hover:bg-bg-raised", focused && "bg-brand-primaryContainer/40")}
    >
      <th scope="row" className="sticky left-0 z-10 bg-bg-surface px-4 text-left font-semibold shadow-[10px_0_10px_-10px_rgba(0,0,0,0.5)] sm:shadow-none">
        <Link href={`/coins/${r.mint}`} className="inline-flex min-h-11 items-center gap-2 hover:underline"><CoinAvatar mint={r.mint} logoUrl={r.logoUrl} />{r.symbol}</Link>
      </th>
      <td className="whitespace-nowrap px-4 text-text-secondary">{r.strategyName}</td>
      <td className="num whitespace-nowrap px-4 text-right text-numSm">{f.sol(r.solIn * remaining, { unit: false })}</td>
      <td className="num whitespace-nowrap px-4 text-right text-numSm text-text-secondary">{f.usd(r.entryPriceUsd)} → {f.usd(r.nowPriceUsd)}</td>
      <td className="whitespace-nowrap px-4 text-right"><Pnl sol={r.pnlSol * remaining} /></td>
      <td className="whitespace-nowrap px-4 text-right"><Pnl pct={r.pnlPct} /></td>
      <td className="num whitespace-nowrap px-4 text-right text-numSm">{f.duration(holdS)}</td>
      <td className="px-4 text-right">
        <Button size="sm" variant="secondary" className="min-h-11 whitespace-nowrap" disabled={!!r.screenerState} onClick={(e) => { e.stopPropagation(); onSell(r.key); }}>
          {t("positions.sell")} <kbd className="num hidden text-caption opacity-70 lg:inline">⇧X</kbd>
        </Button>
      </td>
    </tr>
  );
});
