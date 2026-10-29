import type { PickView } from "../api";
import { useHotkeys } from "../hooks/useHotkeys";
import { solText, useLang, useT, wireVars } from "../i18n";
import { HoldButton } from "./HoldButton";

/** REAL SOL approve in the main window: summary dialog + hold 2.5 s (also the popup hand-off target). */
export function ApproveConfirm({ signal, onConfirm, onCancel }: { signal: PickView; onConfirm: () => void; onCancel: () => void }) {
  useHotkeys({ escape: onCancel });
  const t = useT();
  const lang = useLang();
  // Real SOL (Phase 7 reference, mock-only): never "paper".
  const vars = wireVars({ symbol: `$${signal.symbol}`, amount_lamports: signal.amount_lamports }, lang, false);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="approve-title">
      <div className="modal">
        <h3 id="approve-title">Approve REAL SOL · ${signal.symbol}</h3>
        <div>{signal.strategy} · {solText(signal.amount_lamports, lang, false)}{signal.score != null ? ` · fit ${signal.score}/${signal.score_threshold}` : ""}</div>
        <div className="muted" style={{ marginTop: 8 }}>Order memakai SOL nyata (di prototipe: mock). Server re-validate sebelum eksekusi. Tahan tombol (mouse atau Enter) 2,5 dtk.</div>
        <div className="actions">
          <button autoFocus onClick={onCancel}>Batal<kbd>Esc</kbd></button>
          <HoldButton ms={2500} className="real" onConfirm={onConfirm}>{t("queue.real.hold", vars)}</HoldButton>
        </div>
      </div>
    </div>
  );
}
