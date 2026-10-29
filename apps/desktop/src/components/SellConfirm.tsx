import { useEffect, useState } from "react";
import type { Mode, SellQuote } from "../api";
import { useHotkeys } from "../hooks/useHotkeys";
import { HoldButton } from "./HoldButton";

const HOLD_MS: Record<Mode, number> = { practice: 1200, real: 2500 }; // = --motion-holdPractice / --motion-holdReal

/** Step 2 of every sell (⇧X, decided by Apex): summary + hold-to-confirm. Safe action (Batal) is default focus per UX. */
export function SellConfirm({ quote, mode, onConfirm, onCancel, onPct }: {
  quote: SellQuote;
  mode: Mode;
  /** Re-quote with another size (25/50/100%, WF-11). Each change gets a fresh nonce. */
  onPct?: (pct: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(quote.ttlMs);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => {
      const l = quote.ttlMs - (Date.now() - started);
      setLeft(l);
      if (l <= 0) onCancel();
    }, 200);
    return () => clearInterval(t);
  }, [quote, onCancel]);
  useHotkeys({ escape: onCancel });
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>Konfirmasi Sell ({mode === "practice" ? "PRACTICE · paper" : "REAL SOL"})</h3>
        <div>
          Jual <b className="num">{quote.pct}%</b> <span className="mono">{quote.symbol}</span> ≈{" "}
          <span className="num">{quote.estSolOut.toFixed(4)} SOL</span>
        </div>
        {onPct && (
          <div className="pct-chips" role="group" aria-label="Ukuran jual">
            {[25, 50, 100].map((p) => (
              <button key={p} className={`chip-btn${quote.pct === p ? " on" : ""}`} aria-pressed={quote.pct === p} onClick={() => onPct(p)}>{p}%</button>
            ))}
          </div>
        )}
        <div className="muted" style={{ marginTop: 8 }}>
          Quote berlaku <span className="num">{Math.ceil(Math.max(0, left) / 1000)}</span> dtk. Tahan tombol (mouse atau Enter) {HOLD_MS[mode] / 1000} dtk.
        </div>
        <div className="actions">
          <button autoFocus onClick={onCancel}>Batal<kbd>Esc</kbd></button>
          <HoldButton ms={HOLD_MS[mode]} className="danger" onConfirm={onConfirm}>Tahan untuk Sell</HoldButton>
        </div>
      </div>
    </div>
  );
}
