import { useEffect, useState } from "react";
import type { PickView } from "../api";
import { serverNow } from "../state/store";
import { fmtMmSs, fmtPriceDec, fmtSol, fmtUsd, shortMint } from "./format";

interface Props {
  signals: PickView[]; // already pending + sorted soonest-expiry first
  cursorMint: string | null;
  selectedIds?: Set<string>;
  compactActions?: boolean;
  onCursor: (mint: string) => void;
  /** Keyboard focus landed on a row (roving tabindex) — moves the cursor, no quick-look. */
  onFocusRow?: (mint: string) => void;
  onToggleSelect?: (id: string) => void;
  onApprove: (s: PickView) => void;
  onSkip: (s: PickView) => void;
  onOpenChart?: (mint: string) => void;
}

/** Ticking *server-clock* now: countdowns use `expires_at − (local_now + skew)` (contract §2). */
export function useServerNow(ms = 500) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const URGENT_MS = 2 * 60_000; // UX: < 2 min → red + icon

export function SignalQueue(p: Props) {
  const now = useServerNow();
  if (!p.signals.length) return <div className="empty">Tidak ada pick pending. Menunggu backend (mock)…</div>;
  return (
    <div role="list">
      {p.signals.map((s) => {
        const left = Math.max(0, s.expires_at_ms - now);
        const pct = (left / Math.max(1, s.expires_at_ms - s.created_at_ms)) * 100;
        const urgent = left < URGENT_MS;
        const fit = s.score != null && s.score_threshold != null;
        return (
          <div
            key={s.id}
            className={`signal ${s.mint === p.cursorMint ? "cursor" : ""}`}
            onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input")) p.onCursor(s.mint); }}
            onFocus={(e) => e.target === e.currentTarget && p.onFocusRow?.(s.mint)}
            role="listitem"
            tabIndex={s.mint === p.cursorMint ? 0 : -1}
            data-row="signal"
            data-mint={s.mint}
            aria-current={s.mint === p.cursorMint || undefined}
          >
            <div className="row">
              {p.onToggleSelect && (
                <input
                  type="checkbox"
                  className="sel"
                  aria-label="Pilih (X)"
                  checked={p.selectedIds?.has(s.id) ?? false}
                  onChange={() => p.onToggleSelect!(s.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              {/* symbol/name are untrusted token metadata: rendered as plain text only */}
              <strong>{s.symbol}</strong>
              <span className="mono dim">{shortMint(s.mint)}</span>
              <span className="chip">{s.first_buy ? "Pick · first buy" : "Pick"}</span>
              {fit && (
                <span className={`num ${s.score! >= s.score_threshold! ? "pos" : "neg"}`} style={{ marginLeft: "auto" }} title="score / score_threshold">
                  {s.score}/{s.score_threshold}
                </span>
              )}
            </div>
            <div className="row meta num">
              <span>{fmtSol(s.amount_lamports, 2)} SOL</span>
              <span>px {fmtPriceDec(s.price_sol)} SOL</span>
              <span>liq {s.liquidity_usd != null ? fmtUsd(s.liquidity_usd) : "—"}</span>
              {s.guard_verdict && <span>guard {s.guard_verdict}</span>}
            </div>
            <div className="meta">{s.strategy} · {s.reasons.join(" · ") || s.summary}</div>
            <div className={`bar ${urgent ? "urgent" : ""}`}><i style={{ width: `${pct}%` }} /></div>
            <div className="actions">
              <button className="success" onClick={(e) => { e.stopPropagation(); p.onApprove(s); }}>Approve<kbd>A</kbd></button>
              <button className="ghost" onClick={(e) => { e.stopPropagation(); p.onSkip(s); }}>Skip<kbd>S</kbd></button>
              {!p.compactActions && p.onOpenChart && (
                <button className="ghost" onClick={(e) => { e.stopPropagation(); p.onOpenChart!(s.mint); }} title="Buka chart di window terpisah">
                  ⧉ Chart<kbd>↵</kbd>
                </button>
              )}
              <span className={`num ${urgent ? "neg" : "dim"}`} style={{ marginLeft: "auto" }} aria-label="Sisa waktu (jam server)">
                {urgent ? "⏱ " : ""}{fmtMmSs(left)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
