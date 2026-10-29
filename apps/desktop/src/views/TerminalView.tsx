import { useCallback, useEffect, useMemo, useState } from "react";
import { core, EVT, runtime, type PickView, type PositionView, type SellQuote } from "../api";
import { ApproveConfirm } from "../components/ApproveConfirm";
import { MockTtlBadge } from "../components/MockTtlBadge";
import { popupSupported, POPUP_DISABLED_REASON } from "../components/platform";
import { QuickLook, type QuickLookTarget } from "../components/QuickLook";
import { ActivityFeed } from "../components/ActivityFeed";
import { ModeChrome } from "../components/ModeChrome";
import { PositionsSummary, PositionsTable } from "../components/PositionsTable";
import { PriceChart } from "../components/PriceChart";
import { SellConfirm } from "../components/SellConfirm";
import { SettingsDialog } from "../components/SettingsDialog";
import { SignalQueue, useServerNow } from "../components/SignalQueue";
import { ConflictToast } from "../components/ConflictToast";
import { fmtSol } from "../components/format";
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
  const pending = useMemo(() => pendingSorted(st.signals), [st.signals]);
  const now = useServerNow(1000);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      setErr(null);
      await fn();
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  const cursorSig: PickView | undefined = pending.find((s) => s.mint === st.cursorMint) ?? pending[0];
  const cursorPos: PositionView | undefined = st.positions.find((p) => p.mint === st.cursorMint) ?? st.positions[0];
  const chartMint = st.cursorMint ?? cursorSig?.mint ?? null;
  const chartSym = st.signals.find((s) => s.mint === chartMint)?.symbol ?? st.positions.find((p) => p.mint === chartMint)?.symbol;

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

  const approve = (s?: PickView) => s && (st.mode === "real" ? setRealApprove(s) : run(() => core.approveSignal(s.id)));

  // Popup hand-off ("Buka untuk approve ↗"): Rust focused this window; open the pick here.
  useEffect(() => {
    let un: (() => void) | undefined;
    core.on<string>(EVT.focusSignal, (id) => {
      const s = useTerm.getState().signals.find((x) => x.id === id && x.status === "pending");
      if (!s) return;
      useTerm.getState().setCursor(s.mint);
      if (useTerm.getState().mode === "real") setRealApprove(s);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);
  const skip = (s?: PickView) => s && run(() => core.skipSignal(s.id));
  const approveSelected = () => {
    if (st.mode !== "practice") return setErr("Batch approve hanya untuk PRACTICE");
    const ids = [...st.selectedIds].filter((id) => pending.some((s) => s.id === id));
    if (ids.length) run(async () => { await core.approveMany(ids); st.clearSelected(); });
  };
  const sell = (p?: PositionView, pct = 100) => p && run(async () => setQuote(await core.requestSell(p.key, pct)));
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
    },
    !quote && !settingsOpen && !realApprove,
  );

  const sc = st.settings.shortcuts;
  return (
    <div className="window">
      <ModeChrome title="Terminal">
        <span className="chip">src: {st.source}</span>
        <span className="muted num" title={`epoch ${st.account.epoch ?? "—"} · as_of_seq ${st.account.as_of_seq ?? "—"}`}>Cash {fmtSol(st.account.cash_lamports, 3)} · Equity {fmtSol(st.account.equity_lamports, 3)} SOL</span>
        <span style={{ marginLeft: "auto" }} className="dim">
          <kbd>J/K</kbd> nav <kbd>A</kbd> approve <kbd>S</kbd> skip <kbd>X</kbd> pilih <kbd>⇧A</kbd> approve terpilih <kbd>⇧X</kbd> sell <kbd>Space</kbd> quick-look <kbd>↵</kbd> chart <kbd>L</kbd> feed <kbd>P</kbd> popup
        </span>
        <button className="ghost" onClick={() => setSettingsOpen(true)}>Settings<kbd>,</kbd></button>
      </ModeChrome>
      <div className="grid">
        <section className="panel area-queue">
          <header>
            Approval queue <MockTtlBadge sample={pending[0]} /> <span>{pending.length} pending{st.selectedIds.size ? ` · ${st.selectedIds.size} dipilih` : ""}</span>
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
            Chart <span className="mono">{chartSym ?? "—"}</span>
            <button className="ghost" onClick={() => chartMint && run(() => core.openChartWindow(chartMint))}>⧉ Detach</button>
          </header>
          <PriceChart mint={chartMint} />
        </section>
        <section className="panel area-activity">
          <header>
            Activity <button className="ghost" onClick={() => run(() => core.openActivityWindow())}>⧉ Detach</button>
          </header>
          <div className="body"><ActivityFeed items={st.activity} /></div>
        </section>
        <section className="panel area-positions">
          <header>Positions (paper) <PositionsSummary positions={st.positions} /></header>
          <div className="body">
            <PositionsTable positions={st.positions} cursorMint={st.cursorMint} onCursor={clickPosition} onFocusRow={st.setCursor} onSell={(p) => sell(p)} now={now} />
          </div>
        </section>
      </div>
      <div className="statusbar">
        <span className={st.connected ? "pos" : "neg"}>● {st.connected ? "backend (mock) online" : "offline"}</span>
        {st.sync && (
          <span className="dim num" title="watermark = seq resume cursor · gap = seq lompat (re-fetch via /events) · skew = server_now − jam lokal">
            contracts {st.contractsVersion} · seq {st.sync.watermark} · gap {st.sync.gaps_seen} · resync {st.sync.resyncs} (+{st.sync.recovered}) · dup {st.sync.duplicates} · skew {st.sync.skew_ms > 0 ? "+" : ""}{(st.sync.skew_ms / 1000).toFixed(1)}s
          </span>
        )}
        <span className="dim">runtime: {runtime} · density: {st.settings.density} · popup: {!popupSupported ? "n/a (OS)" : st.settings.approval_popup ? "on" : "off"}</span>
        <span className="dim">global: focus {sc.focus_terminal}{sc.open_approvals ? ` · approvals ${sc.open_approvals}` : ""}</span>
        {(err ?? st.lastError) && <span className="neg" style={{ marginLeft: "auto" }}>{err ?? st.lastError}</span>}
      </div>
      {st.account.notice && <div className="account-banner" role="alert">{st.account.notice}</div>}
      <ConflictToast />
      {qlTarget && <QuickLook target={qlTarget} onClose={() => setQl(null)} />}
      {realApprove && (
        <ApproveConfirm
          signal={realApprove}
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
