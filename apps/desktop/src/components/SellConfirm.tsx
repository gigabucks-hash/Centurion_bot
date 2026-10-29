import { useEffect, useState } from "react";
import type { Mode, SellQuote } from "../api";
import { useHotkeys } from "../hooks/useHotkeys";
import { formatFractionBps, solText, useLang, useT } from "../i18n";
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
  const [left, setLeft] = useState(quote.ttl_ms);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => {
      const l = quote.ttl_ms - (Date.now() - started);
      setLeft(l);
      if (l <= 0) onCancel();
    }, 200);
    return () => clearInterval(t);
  }, [quote, onCancel]);
  useHotkeys({ escape: onCancel });
  const t = useT();
  const lang = useLang();
  const fractionBps = Math.round(quote.pct * 100); // wire `fraction_bps`; copy shows %
  const pctLabel = formatFractionBps(fractionBps, lang);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>{t("positions.sell.title", { symbol: `$${quote.symbol}` })} · {t(mode === "practice" ? "mode.practice.label" : "mode.real.label")}</h3>
        <div>
          <b className="num">{pctLabel}</b> · {t("positions.sell.estimate")}{" "}
          <span className="num">{solText(quote.est_sol_out_lamports, lang, mode === "practice")}</span>
        </div>
        {onPct && (
          <div className="pct-chips" role="group" aria-label="Ukuran jual">
            {[25, 50, 100].map((p) => (
              <button key={p} className={`chip-btn${quote.pct === p ? " on" : ""}`} aria-pressed={quote.pct === p} onClick={() => onPct(p)}>{p}%</button>
            ))}
          </div>
        )}
        <div className="muted" style={{ marginTop: 8 }}>
          {t("positions.sell.quote_ttl", { seconds: Math.ceil(Math.max(0, left) / 1000) })} {t(mode === "practice" ? "positions.sell.hold.practice" : "positions.sell.hold.real", { pct: pctLabel })}. <span className="dim">fraction_bps {fractionBps}</span>
        </div>
        <div className="actions">
          <button autoFocus onClick={onCancel}>{t("common.action.cancel")}<kbd>Esc</kbd></button>
          <HoldButton ms={HOLD_MS[mode]} className="danger" onConfirm={onConfirm}>{t(mode === "practice" ? "positions.sell.hold.practice" : "positions.sell.hold.real", { pct: pctLabel })}</HoldButton>
        </div>
      </div>
    </div>
  );
}
