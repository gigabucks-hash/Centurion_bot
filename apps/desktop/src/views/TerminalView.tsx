import { useCallback, useEffect, useMemo, useState } from "react";
import { core, EVT, runtime, type Position, type SellQuote, type Signal } from "../api";
import { ApproveConfirm } from "../components/ApproveConfirm";
import { ActivityFeed } from "../components/ActivityFeed";
import { ModeChrome } from "../components/ModeChrome";
import { PositionsSummary, PositionsTable } from "../components/PositionsTable";
import { PriceChart } from "../components/PriceChart";
import { SellConfirm } from "../components/SellConfirm";
import { SettingsDialog } from "../components/SettingsDialog";
import { SignalQueue } from "../components/SignalQueue";
import { useHotkeys } from "../hooks/useHotkeys";
import { pendingSorted, useTerm } from "../state/store";

export function TerminalView() {
  const st = useTerm();
  const [quote, setQuote] = useState<SellQuote | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [realApprove, setRealApprove] = useState<Signal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pending = useMemo(() => pendingSorted(st.signals), [st.signals]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      setErr(null);
      await fn();
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  const cursorSig: Signal | undefined = pending.find((s) => s.mint === st.cursorMint) ?? pending[0];
  const cursorPos: Position | undefined = st.positions.find((p) => p.mint === st.cursorMint) ?? st.positions[0];
  const chartMint = st.cursorMint ?? cursorSig?.mint ?? null;
  const chartSym = st.signals.find((s) => s.mint === chartMint)?.symbol ?? st.positions.find((p) => p.mint === chartMint)?.symbol;

  // REAL SOL: approve always goes through dialog + hold 2.5 s (UX); Practice approves directly.
  const approve = (s?: Signal) => s && (st.mode === "real" ? setRealApprove(s) : run(() => core.approveSignal(s.id)));

  // Popup hand-off ("Buka untuk approve ↗"): Rust focused this window; open the pick here.
  useEffect(() => {
    let un: (() => void) | undefined;
    core.on<string>(EVT.focusSignal, (id) => {
      const s = useTerm.getState().signals.find((x) => x.id === id && x.stage === "pending");
      if (!s) return;
      useTerm.getState().setCursor(s.mint);
      if (useTerm.getState().mode === "real") setRealApprove(s);
    }).then((u) => (un = u));
    return () => un?.();
  }, []);
  const skip = (s?: Signal) => s && run(() => core.skipSignal(s.id));
  const approveSelected = () => {
    if (st.mode !== "practice") return setErr("Batch approve hanya untuk PRACTICE");
    const ids = [...st.selectedIds].filter((id) => pending.some((s) => s.id === id));
    if (ids.length) run(async () => { await core.approveMany(ids); st.clearSelected(); });
  };
  const sell = (p?: Position, pct = 100) => p && run(async () => setQuote(await core.requestSell(p.mint, pct)));
  const move = (d: number) => {
    if (!pending.length) return;
    const i = Math.max(0, pending.findIndex((s) => s.mint === st.cursorMint));
    st.setCursor(pending[(i + d + pending.length) % pending.length].mint);
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
      enter: () => chartMint && run(() => core.openChartWindow(chartMint)),
      escape: () => st.clearSelected(),
      "shift+x": () => sell(cursorPos),
      l: () => run(() => core.openActivityWindow()),
      p: () => run(() => core.openApprovalWindow()),
      ",": () => setSettingsOpen(true),
    },
    !quote && !settingsOpen && !realApprove,
  );

  const sc = st.settings.shortcuts;
  return (
    <div className="window">
      <ModeChrome title="Terminal">
        <span className="chip">src: {st.source}</span>
        <span className="muted num">Cash {st.paperCashSol.toFixed(3)} SOL</span>
        <span style={{ marginLeft: "auto" }} className="dim">
          <kbd>J/K</kbd> nav <kbd>A</kbd> approve <kbd>S</kbd> skip <kbd>X</kbd> pilih <kbd>⇧A</kbd> approve terpilih <kbd>⇧X</kbd> sell <kbd>↵</kbd> chart <kbd>L</kbd> feed <kbd>P</kbd> popup
        </span>
        <button className="ghost" onClick={() => setSettingsOpen(true)}>Settings<kbd>,</kbd></button>
      </ModeChrome>
      <div className="grid">
        <section className="panel area-queue">
          <header>
            Approval queue <span>{pending.length} pending{st.selectedIds.size ? ` · ${st.selectedIds.size} dipilih` : ""}</span>
          </header>
          <div className="body">
            <SignalQueue
              signals={pending}
              cursorMint={st.cursorMint}
              selectedIds={st.selectedIds}
              onCursor={st.setCursor}
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
            <PositionsTable positions={st.positions} cursorMint={st.cursorMint} onCursor={st.setCursor} onSell={(p) => sell(p)} />
          </div>
        </section>
      </div>
      <div className="statusbar">
        <span className={st.connected ? "pos" : "neg"}>● {st.connected ? "engine online" : "offline"}</span>
        <span className="dim">runtime: {runtime} · density: {st.settings.density} · popup: {st.settings.approvalPopup ? "on" : "off"}</span>
        <span className="dim">global: focus {sc.focusTerminal}{sc.openApprovals ? ` · approvals ${sc.openApprovals}` : ""}</span>
        {(err ?? st.lastError) && <span className="neg" style={{ marginLeft: "auto" }}>{err ?? st.lastError}</span>}
      </div>
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
          onPct={(pct) => sell(st.positions.find((p) => p.mint === quote.mint), pct)}
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
