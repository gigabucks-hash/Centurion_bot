import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ChartNoAxesColumn, Coins, ExternalLink, Settings as SettingsGlyph, SquareCheck, Wallet } from "lucide-react";
import { core, EVT, runtime, type PickView, type PositionView, type SellQuote } from "../api";
import { ApproveConfirm } from "../components/ApproveConfirm";
import { MockTtlBadge } from "../components/MockTtlBadge";
import { popupSupported, POPUP_DISABLED_REASON } from "../components/platform";
import { QuickLook, type QuickLookTarget } from "../components/QuickLook";
import { ActivityFeed } from "../components/ActivityFeed";
import { ModeChrome } from "../components/ModeChrome";
import { PositionsBar, PositionsSummary, PositionsTable } from "../components/PositionsTable";
import { PnlReport } from "../components/PnlReport";
import { PriceChart } from "../components/PriceChart";
import { SellConfirm } from "../components/SellConfirm";
import { SettingsDialog } from "../components/SettingsDialog";
import { SignalQueue, useServerNow } from "../components/SignalQueue";
import { ConflictToast } from "../components/ConflictToast";
import { CoinDetail } from "../components/CoinDetail";
import { CoinAvatar } from "../components/CoinAvatar";
import { Icon } from "../components/Icon";
import { useCoinLogo } from "../components/useCoinLogo";
import { isBlocked } from "../components/NotTradeable";
import { ScreenerTable } from "../components/ScreenerTable";
import { errorMessage, errorText, I18N_PACKAGE_VERSION, solText, useLang, useT } from "../i18n";
import { useHotkeys } from "../hooks/useHotkeys";
import { pendingSorted, useTerm } from "../state/store";

export function TerminalView() {
  const st = useTerm();
  const [quote, setQuote] = useState<SellQuote | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [realApprove, setRealApprove] = useState<PickView | null>(null);
  // Quick-look (C2 decided): which kind of row it shows; content stays live from the store.
  const [ql, setQl] = useState<{ kind: "signal" | "position"; mint: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Neutral status line (WF-20 D4): product limits like "not tradeable" are info, never red. */
  const [info, setInfoRaw] = useState<string | null>(null);
  const setInfo = (m: string) => { setErr(null); setInfoRaw(m); };
  // Center panel: chart (default) or WF-20 "Koin · screener" (C key / tab).
  const [center, setCenter] = useState<"chart" | "coins">(() => (new URLSearchParams(location.search).get("tab") === "coins" ? "coins" : "chart"));
  const [coinSel, setCoinSel] = useState<string | null>(null);
  const t = useT();
  const lang = useLang();
  const paper = st.mode === "practice";
  const pending = useMemo(() => pendingSorted(st.signals), [st.signals]);
  const now = useServerNow(1000);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      setErr(null);
      setInfoRaw(null);
      await fn();
    } catch (e) {
      setErr(errorText(e, lang));
    }
  }, [lang]);

  const cursorSig: PickView | undefined = pending.find((s) => s.mint === st.cursorMint) ?? pending[0];
  const cursorPos: PositionView | undefined = st.positions.find((p) => p.mint === st.cursorMint) ?? st.positions[0];
  const chartMint = st.cursorMint ?? cursorSig?.mint ?? null;
  const chartSym = st.signals.find((s) => s.mint === chartMint)?.symbol ?? st.positions.find((p) => p.mint === chartMint)?.symbol;
  const chartLogo = useCoinLogo(chartMint);

  // REAL SOL: approve always goes through dialog + hold 2.5 s (UX); Practice approves directly.
  const qlTarget: QuickLookTarget | null = (() => {
    if (!ql) return null;
    if (ql.kind === "position") {
      const p = st.positions.find((x) => x.mint === ql.mint);
      return p ? { kind: "position", item: p } : null;
    }
    const s = st.signals.find((x) => x.mint === ql.mint);
    return s ? { kind: "signal", item: s } : null;
  })();
  const toggleQuickLook = (row: { kind: "signal" | "position"; mint: string }) =>
    setQl((cur) => (cur && cur.kind === row.kind && cur.mint === row.mint ? null : row));
  // Row click = cursor + quick-look (C2); while open, the panel follows the cursor.
  const clickSignal = (mint: string) => { st.setCursor(mint); setQl({ kind: "signal", mint }); };
  const clickPosition = (mint: string) => { st.setCursor(mint); setQl({ kind: "position", mint }); };
  useEffect(() => {
    if (ql?.kind === "signal" && cursorSig && cursorSig.mint !== ql.mint) setQl({ kind: "signal", mint: cursorSig.mint });
  }, [cursorSig, ql]);

  /** WF-20: blocked in the UI first (Rust refuses too: NotTradeable). The reason is shown as text. */
  const ntMsg = (kind: "approve" | "sell") =>
    `${t(kind === "approve" ? "queue.pick.cannot_approve" : "positions.sell.unavailable")} — ${t(kind === "approve" ? "screener.not_tradeable.detail" : "positions.sell.not_tradeable_detail")}`;
  const approve = (s?: PickView) => {
    if (!s) return;
    if (isBlocked(s)) return setInfo(ntMsg("approve"));
    if (st.mode === "real") setRealApprove(s);
    else run(() => core.approveSignal(s.id));
  };

  // Popup hand-off ("Buka untuk approve ↗"): Rust focused this window; open the pick here.
  useEffect(() => {
    let un: (() => void) | undefined;
    core.on<string>(EVT.focusSignal, (id) => {
      const s = useTerm.getState().signals.find((x) => x.id === id && x.status === "pending");
      if (!s) return;
      useTerm.getState().setCursor(s.mint);
      if (useTerm.getState().mode === "real" && !isBlocked(s)) setRealApprove(s);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);
  const skip = (s?: PickView) => s && run(() => core.skipSignal(s.id));
  const approveSelected = () => {
    if (st.mode !== "practice") return setErr("Batch approve hanya untuk PRACTICE");
    const sel = pending.filter((s) => st.selectedIds.has(s.id));
    const ids = sel.filter((s) => !isBlocked(s)).map((s) => s.id);
    const skipped = sel.length - ids.length;
    if (ids.length) run(async () => { await core.approveMany(ids); st.clearSelected(); if (skipped) setInfo(t("queue.batch.excluded_not_tradeable", { count: skipped })); });
    else if (skipped) setInfo(t("queue.batch.excluded_not_tradeable", { count: skipped }));
  };
  const sell = (p?: PositionView, pct = 100) => {
    if (!p) return;
    if (isBlocked(p)) return setInfo(ntMsg("sell"));
    run(async () => setQuote(await core.requestSell(p.key, pct)));
  };
  const openQueue = (mint: string) => {
    st.setCursor(mint);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row="signal"][data-mint="${mint}"]`)?.focus());
  };
  const coin = st.screened.find((c) => c.mint === coinSel) ?? null;
  const move = (d: number) => {
    if (!pending.length) return;
    const i = Math.max(0, pending.findIndex((s) => s.mint === st.cursorMint));
    const mint = pending[(i + d + pending.length) % pending.length].mint;
    st.setCursor(mint);
    // Roving focus: J/K moves real DOM focus onto the row so Space/↵ have a row context (C13/C14).
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row="signal"][data-mint="${mint}"]`)?.focus());
  };
  /** Row under keyboard focus, if any (C13/C14: Space/↵ only act in list context). */
  const focusedRow = (e: KeyboardEvent) => {
    const r = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-row]");
    return r ? { kind: r.dataset.row as "signal" | "position", mint: r.dataset.mint! } : null;
  };

  // Keymap = UX SPEC §3 (J/K, A, S, X select, ⇧A approve selected, Enter detail, Esc) + desktop extras.
  // Sell = ⇧X + dialog + hold (DECIDED by Apex Dev Lead, 29 Okt 2026).
  useHotkeys(
    {
      j: () => move(1),
      k: () => move(-1),
      arrowdown: () => move(1),
      arrowup: () => move(-1),
      a: () => approve(cursorSig),
      s: () => skip(cursorSig),
      x: () => cursorSig && st.toggleSelected(cursorSig.id),
      "shift+a": approveSelected,
      // C13: ↵ pops out the chart only from a focused row (list context); modals disable this map.
      enter: (e) => {
        const r = focusedRow(e);
        if (!r) return false;
        run(() => core.openChartWindow(r.mint));
      },
      escape: () => (ql ? setQl(null) : st.clearSelected()),
      // C14: Space = quick-look only when focus is on a row; elsewhere native Space (scroll/activate).
      space: (e) => {
        const r = focusedRow(e);
        if (!r) return false;
        toggleQuickLook(r);
      },
      "shift+x": () => sell(cursorPos),
      l: () => run(() => core.openActivityWindow()),
      p: () => (popupSupported ? run(() => core.openApprovalWindow()) : setErr(POPUP_DISABLED_REASON)),
      ",": () => setSettingsOpen(true),
      c: () => setCenter((x) => (x === "coins" ? "chart" : "coins")),
    },
    !quote && !settingsOpen && !realApprove,
  );

  const sc = st.settings.shortcuts;
  return (
    <div className="window">
      <ModeChrome title="Terminal" stop>
        <span className="chip">src: {st.source}</span>
        <span className="muted num" title={`practice_epoch ${st.account.epoch ?? "—"} · as_of_seq ${st.account.as_of_seq ?? "—"}`}>Cash {solText(st.account.cash_lamports, lang, paper)} · Equity {solText(st.account.equity_lamports, lang, paper)}</span>
        <span style={{ marginLeft: "auto" }} className="dim">
          <kbd>J/K</kbd> nav <kbd>A</kbd> approve <kbd>S</kbd> skip <kbd>X</kbd> pilih <kbd>⇧A</kbd> approve terpilih <kbd>⇧X</kbd> sell <kbd>Space</kbd> quick-look <kbd>↵</kbd> chart <kbd>L</kbd> feed <kbd>C</kbd> koin <kbd>P</kbd> popup
        </span>
        <button className="ghost" onClick={() => setSettingsOpen(true)}><Icon glyph={SettingsGlyph} size={16} /> Settings<kbd>,</kbd></button>
      </ModeChrome>
      <div className="grid">
        <section className="panel area-queue">
          <header>
            <span className="panel-title"><Icon glyph={SquareCheck} size={16} /> {t("queue.title")} <MockTtlBadge sample={pending[0]} /></span>
            <span>{pending.length} pending{st.selectedIds.size ? ` · ${t("queue.batch.selected", { count: st.selectedIds.size })}` : ""}</span>
          </header>
          <div className="body">
            <SignalQueue
              signals={pending}
              cursorMint={st.cursorMint}
              selectedIds={st.selectedIds}
              onCursor={clickSignal}
              onFocusRow={st.setCursor}
              onToggleSelect={st.toggleSelected}
              onApprove={approve}
              onSkip={skip}
              onOpenChart={(m) => run(() => core.openChartWindow(m))}
            />
          </div>
        </section>
        <section className="panel area-chart">
          <header>
            <span className="tabs" role="tablist">
              <button role="tab" className={`tab${center === "chart" ? " on" : ""}`} aria-selected={center === "chart"} onClick={() => setCenter("chart")}>
                <Icon glyph={ChartNoAxesColumn} size={18} /> {t("chart.title")} <span className="coin-sym" data-testid="chart-tab-coin">{chartMint && <CoinAvatar mint={chartMint} symbol={chartSym ?? "•"} logoHash={chartLogo} size={20} />}<span className="mono">{chartSym ?? "—"}</span></span>
              </button>
              <button role="tab" className={`tab${center === "coins" ? " on" : ""}`} aria-selected={center === "coins"} onClick={() => setCenter("coins")} data-testid="tab-coins">
                <Icon glyph={Coins} size={18} /> {t("screener.title")} <span className="num">{st.screened.length}</span><kbd>C</kbd>
              </button>
            </span>
            {center === "chart" && <button className="ghost" onClick={() => chartMint && run(() => core.openChartWindow(chartMint))}><Icon glyph={ExternalLink} size={16} /> Detach</button>}
          </header>
          {center === "chart" ? (
            <PriceChart mint={chartMint} />
          ) : (
            <div className={`coins-split${coin ? " with-detail" : ""}`}>
              <div className="body"><ScreenerTable coins={st.screened} selected={coinSel} onSelect={setCoinSel} onOpenQueue={openQueue} /></div>
              {coin && <CoinDetail key={coin.mint} coin={coin} pick={pending.find((s) => s.mint === coin.mint)} onOpenQueue={openQueue} onSkip={skip} />}
            </div>
          )}
        </section>
        <section className="panel area-activity">
          <header>
            <span className="panel-title"><Icon glyph={Activity} size={16} /> Activity</span>
            <button className="ghost" onClick={() => run(() => core.openActivityWindow())}><Icon glyph={ExternalLink} size={16} /> Detach</button>
          </header>
          <div className="body"><ActivityFeed items={st.activity} /></div>
        </section>
        <section className="panel area-positions">
          <header><span className="panel-title"><Icon glyph={Wallet} size={16} /> {t(st.mode === "real" ? "positions.title" : "positions.title_paper")}</span> <PositionsSummary positions={st.positions} /></header>
          <PnlReport />
          <div className="body">
            <PositionsTable positions={st.positions} cursorMint={st.cursorMint} onCursor={clickPosition} onFocusRow={st.setCursor} onSell={(p) => sell(p)} now={now} />
          </div>
          {cursorPos && <PositionsBar p={cursorPos} now={now} onSell={(p) => sell(p)} sellLabel={t("positions.sell.unavailable")} />}
        </section>
      </div>
      <div className="statusbar">
        <span className={st.connected ? "pos" : "neg"}>● {st.connected ? "backend (mock) online" : "offline"}</span>
        {st.sync && (
          <span className="dim num" title="watermark = seq resume cursor · gap = seq lompat (re-fetch via /events) · skew = server_now − jam lokal">
            contracts {st.contractsVersion} · seq {st.sync.watermark} · gap {st.sync.gaps_seen} · resync {st.sync.resyncs} (+{st.sync.recovered}) · dup {st.sync.duplicates} · skew {st.sync.skew_ms > 0 ? "+" : st.sync.skew_ms < 0 ? "\u2212" : ""}{Math.abs(st.sync.skew_ms / 1000).toFixed(1)}s
          </span>
        )}
        <span className="dim">i18n {I18N_PACKAGE_VERSION} · {lang} · runtime: {runtime} · density: {st.settings.density} · popup: {!popupSupported ? "n/a (OS)" : st.settings.approval_popup ? "on" : "off"}</span>
        <span className="dim">global: focus {sc.focus_terminal}{sc.open_approvals ? ` · approvals ${sc.open_approvals}` : ""}</span>
        {(err ?? st.lastError) ? <span className="neg status-error" role="status" title={err ?? st.lastError ?? undefined}>{err ?? st.lastError}</span>
          : info && <span className="status-info status-error" role="status" title={info}>ⓘ {info}</span>}
      </div>
      {st.account.notice && <div className="account-banner" role="alert">{st.account.notice}</div>}
      {st.account.entries_paused && (
        // Notice, not an error: neutral strip, persists until cash recovers / Practice reset.
        <div className="entries-paused" role="status" data-testid="entries-paused">ⓘ {errorMessage(st.account.entries_paused, lang)}</div>
      )}
      <ConflictToast />
      {qlTarget && <QuickLook target={qlTarget} onClose={() => setQl(null)} />}
      {realApprove && (
        <ApproveConfirm
          signal={st.signals.find((x) => x.id === realApprove.id) ?? realApprove}
          onCancel={() => setRealApprove(null)}
          onConfirm={() => {
            const id = realApprove.id;
            setRealApprove(null);
            run(() => core.approveSignal(id));
          }}
        />
      )}
      {quote && (
        <SellConfirm
          quote={quote}
          mode={st.mode}
          onCancel={() => setQuote(null)}
          onPct={(pct) => sell(st.positions.find((p) => p.key === quote.position_key), pct)}
          onConfirm={() => {
            const n = quote.nonce;
            setQuote(null);
            run(() => core.confirmSell(n));
          }}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
