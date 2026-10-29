import { useEffect, useMemo, useRef, useState } from "react";
import { core, type Signal } from "../api";
import { fmtMmSs } from "../components/format";
import { MockTtlBadge } from "../components/MockTtlBadge";
import { useHotkeys } from "../hooks/useHotkeys";
import { pendingSorted, useTerm } from "../state/store";

const LOCK_MS = 600; // UX: anti mis-click — buttons locked each time the item changes/appears
const EXPIRED_NOTICE_MS = 3000;
const TRADE_SOL = "0,25";

const expiredText = (r: string | null) => (r === "strategy_deleted" ? "Expired · strategi dihapus" : "Expired · waktu habis");

/**
 * Opt-in always-on-top approval popup (UX DESKTOP_COMPACT_AND_POPUP §4, WF-13). 360×232.
 * One item (soonest expiry) + "+N lagi". Approve (PRACTICE only) / Skip. No Sell, no batch.
 * REAL SOL: no direct approve → "Buka untuk approve ↗" hands off to the main window
 * (also enforced in Rust: approve from this window label is rejected in Real).
 * Shown without activation; shortcuts only work once the user clicks the popup.
 */
export function ApprovalView() {
  const signals = useTerm((s) => s.signals);
  const mode = useTerm((s) => s.mode);
  const pending = useMemo(() => pendingSorted(signals), [signals]);
  const [curId, setCurId] = useState<string | null>(null);
  const [active, setActive] = useState(() => document.hasFocus());
  const [locked, setLocked] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const expiredAt = useRef<Record<string, number>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000); // per-second, no smooth animation
    const on = () => setActive(true);
    const off = () => setActive(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => { clearInterval(t); window.removeEventListener("focus", on); window.removeEventListener("blur", off); };
  }, []);

  // Current item: keep showing a just-expired item for 3 s, else soonest-expiring pending.
  const shown: Signal | undefined = (() => {
    const c = signals.find((s) => s.id === curId);
    if (c?.stage === "pending") return c;
    if (c?.stage === "expired") {
      const t0 = (expiredAt.current[c.id] ??= Date.now());
      if (now - t0 < EXPIRED_NOTICE_MS) return c;
    }
    return pending[0];
  })();
  useEffect(() => {
    if (shown && shown.id !== curId) setCurId(shown.id);
  }, [shown, curId]);
  useEffect(() => {
    setLocked(true);
    const t = setTimeout(() => setLocked(false), LOCK_MS);
    return () => clearTimeout(t);
  }, [shown?.id]);

  const others = pending.filter((s) => s.id !== shown?.id);
  const isPending = shown?.stage === "pending";
  const can = isPending && !locked;
  const act = (fn: () => Promise<void>) => fn().then(() => setErr(null), (e) => setErr(String(e)));
  const approve = () => {
    if (!can || !shown) return;
    if (mode === "real") act(() => core.focusMainForSignal(shown.id));
    else act(() => core.approveSignal(shown.id));
  };
  const skip = () => can && shown && act(() => core.skipSignal(shown.id));
  const move = (d: number) => {
    if (!pending.length) return;
    const i = Math.max(0, pending.findIndex((s) => s.id === shown?.id));
    setCurId(pending[(i + d + pending.length) % pending.length].id);
  };
  useHotkeys({ j: () => move(1), k: () => move(-1), a: approve, s: skip, escape: () => act(() => core.hideApprovalPopup()) }, active);

  const left = shown ? shown.expiresAt - now : 0;
  const total = shown ? Math.max(1, shown.expiresAt - shown.createdAt) : 1;
  return (
    <div className="popup" role="dialog" aria-modal="false" aria-labelledby="popup-title" data-active={active || undefined}>
      <div className="mode-strip" aria-hidden />
      <div className="popup-bar" data-tauri-drag-region>
        <span className="mode-label" role="status">{mode === "practice" ? "◇ PRACTICE" : "● REAL SOL"}</span>
        <MockTtlBadge sample={shown} />
        <span className="num" style={{ marginLeft: "auto" }}>{pending.length} menunggu</span>
      </div>
      {shown ? (
        <div className="popup-body">
          <div className="popup-head">
            <b id="popup-title">${shown.symbol}</b>
            <span className="chip">{shown.strategy.replace(/^Mock · /, "")}</span>
            {isPending ? (
              <span className={`num ${left < 120_000 ? "neg" : "muted"}`} style={{ marginLeft: "auto" }}>⏱ {fmtMmSs(left)}</span>
            ) : (
              <span className="muted" style={{ marginLeft: "auto" }}>{expiredText(shown.expiredReason)}</span>
            )}
          </div>
          <div className="meta">{shown.strategy} · {TRADE_SOL} SOL · fit {shown.score}/{shown.passMark}</div>
          <div className="timerbar" aria-hidden><i style={{ width: `${isPending ? Math.max(0, Math.min(100, (left / total) * 100)) : 0}%` }} /></div>
          <div className="popup-actions">
            <button disabled={!can} onClick={skip}>Skip <kbd>S</kbd></button>
            {mode === "practice" ? (
              <button className="primary" disabled={!can} onClick={approve}>Approve <kbd>A</kbd></button>
            ) : (
              <button className="real" disabled={!can} onClick={approve} title="Approve REAL hanya dari window utama (dialog + tahan 2,5 dtk)">Buka untuk approve ↗</button>
            )}
          </div>
          <div className="popup-foot">
            <div className="row">
              <span className="dim">{others.length ? <>+{others.length} lagi: ${others[0].symbol} · <span className="num">{fmtMmSs(others[0].expiresAt - now)}</span></> : "Tidak ada pick lain"}</span>
              <span className="dim" style={{ marginLeft: "auto" }}>J/K</span>
            </div>
            <div className="dim">{err ? <span className="neg">{err}</span> : active ? "Shortcut aktif · Esc sembunyikan" : "Klik popup untuk mengaktifkan shortcut"}</div>
            <div className="dim">Tanpa Sell · tanpa batch · ⚙ matikan di Settings</div>
          </div>
        </div>
      ) : (
        <div className="empty">Tidak ada pick menunggu</div>
      )}
    </div>
  );
}
