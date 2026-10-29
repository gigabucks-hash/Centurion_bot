import { useEffect, useState } from "react";
import type { Signal } from "../api";
import { fmtMmSs, fmtPrice, fmtUsd, shortMint } from "./format";

interface Props {
  signals: Signal[]; // already pending + sorted soonest-expiry first
  cursorMint: string | null;
  selectedIds?: Set<string>;
  compactActions?: boolean;
  onCursor: (mint: string) => void;
  onToggleSelect?: (id: string) => void;
  onApprove: (s: Signal) => void;
  onSkip: (s: Signal) => void;
  onOpenChart?: (mint: string) => void;
}

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const URGENT_MS = 2 * 60_000; // UX: < 2 min → red + icon

export function SignalQueue(p: Props) {
  const now = useNow();
  if (!p.signals.length) return <div className="empty">Tidak ada pick pending. Menunggu mock engine…</div>;
  return (
    <div role="list">
      {p.signals.map((s) => {
        const left = Math.max(0, s.expiresAt - now);
        const pct = (left / Math.max(1, s.expiresAt - s.createdAt)) * 100;
        const urgent = left < URGENT_MS;
        return (
          <div key={s.id} className={`signal ${s.mint === p.cursorMint ? "cursor" : ""}`} onClick={() => p.onCursor(s.mint)} role="listitem">
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
              <span className="chip">Pick · first buy</span>
              <span className={`num ${s.score >= s.passMark ? "pos" : "neg"}`} style={{ marginLeft: "auto" }}>
                {s.score}/{s.passMark}
              </span>
            </div>
            <div className="row meta num">
              <span>px {fmtPrice(s.priceUsd)}</span>
              <span>mc {fmtUsd(s.marketCapUsd)}</span>
              <span>liq {fmtUsd(s.liquidityUsd)}</span>
              <span>{s.ageMinutes}m</span>
            </div>
            <div className="meta">{s.strategy} · {s.reasons.join(" · ")}</div>
            <div className={`bar ${urgent ? "urgent" : ""}`}><i style={{ width: `${pct}%` }} /></div>
            <div className="actions">
              <button className="success" onClick={(e) => { e.stopPropagation(); p.onApprove(s); }}>Approve<kbd>A</kbd></button>
              <button className="ghost" onClick={(e) => { e.stopPropagation(); p.onSkip(s); }}>Skip<kbd>S</kbd></button>
              {!p.compactActions && p.onOpenChart && (
                <button className="ghost" onClick={(e) => { e.stopPropagation(); p.onOpenChart!(s.mint); }} title="Buka chart di window terpisah">
                  ⧉ Chart<kbd>↵</kbd>
                </button>
              )}
              <span className={`num ${urgent ? "neg" : "dim"}`} style={{ marginLeft: "auto" }} aria-label="Sisa waktu">
                {urgent ? "⏱ " : ""}{fmtMmSs(left)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
