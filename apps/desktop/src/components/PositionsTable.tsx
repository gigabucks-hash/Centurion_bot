import type { PositionView } from "../api";
import { fmtPnlPct, fmtPriceDec, fmtSignedSol, fmtSol, signClass } from "./format";

/**
 * Exit plan of the mock strategy (backend/mock.rs settings, v1.1 names): loss_guards max_loss_pct 40
 * (0.6×), profit_targets at_gain_pct 100 (2×), peak_trail_pct 20 armed after +30 %.
 * `plan_state` is `unknown` in the contract (schema question) so the bar uses ratio / peak_ratio.
 */
const LOSS_GUARD = 0.6;
const PROFIT_TARGET = 2.0;
const TRAIL_ARM = 1.3;

const fmtHold = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}j ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** Exit progress (WF-11): red = loss-guard side, marker = price between loss guard and profit target, dots = trail arm / target. */
function ExitBar({ p }: { p: PositionView }) {
  const r = p.ratio;
  const pos = Math.max(0, Math.min(1, (r - LOSS_GUARD) / (PROFIT_TARGET - LOSS_GUARD)));
  const entry = (1 - LOSS_GUARD) / (PROFIT_TARGET - LOSS_GUARD);
  const trail = (TRAIL_ARM - LOSS_GUARD) / (PROFIT_TARGET - LOSS_GUARD);
  const armed = p.peak_ratio >= TRAIL_ARM;
  const label = `Exit plan: batas rugi −40%, trail dari puncak 20% ${armed ? "aktif" : "setelah +30%"}, target profit 2x; harga ${fmtPnlPct((r - 1) * 100)}`;
  return (
    <span className="exitbar" role="img" aria-label={label} title={label}>
      <i className="sl" style={{ width: `${entry * 100}%` }} />
      <i className={`fill ${r >= 1 ? "up" : "down"}`} style={{ left: `${Math.min(pos, entry) * 100}%`, width: `${Math.abs(pos - entry) * 100}%` }} />
      <b className="dot" style={{ left: `${trail * 100}%` }} data-on={armed || undefined} />
      <b className="dot" style={{ left: "100%" }} />
      <b className="mark" style={{ left: `${pos * 100}%` }} />
    </span>
  );
}

export function PositionsSummary({ positions }: { positions: PositionView[] }) {
  let used = 0n;
  let un = 0n;
  for (const p of positions) {
    used += BigInt(p.cost_lamports);
    un += BigInt(p.pnl_lamports);
  }
  return (
    <span className="muted num">
      {positions.length} open · {fmtSol(used.toString(), 2)} SOL terpakai · unrealized <span className={signClass(un.toString())}>{fmtSignedSol(un.toString())} SOL</span>
    </span>
  );
}

/** Compact positions table (UX WF-11): row 32, header 28 overline, numbers mono right-aligned, Sell ⇧X sm button. */
export function PositionsTable({ positions, cursorMint, onCursor, onFocusRow, onSell, now = Date.now() }: {
  positions: PositionView[];
  cursorMint: string | null;
  onCursor: (mint: string) => void;
  onFocusRow?: (mint: string) => void;
  onSell: (p: PositionView) => void;
  /** server-clock now */
  now?: number;
}) {
  if (!positions.length) return <div className="empty">Tidak ada posisi (paper)</div>;
  return (
    <table className="positions">
      <thead>
        <tr><th>Coin</th><th>Strategi</th><th>Size</th><th>Entry → Now</th><th>PnL SOL</th><th>PnL %</th><th>Exit plan</th><th>Hold</th><th /></tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <tr key={p.key} className={p.mint === cursorMint ? "cursor" : ""} aria-selected={p.mint === cursorMint} tabIndex={0} data-row="position" data-mint={p.mint} data-key={p.key}
            onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onCursor(p.mint); }}
            onFocus={(e) => e.target === e.currentTarget && onFocusRow?.(p.mint)}>
            <td><b>${p.symbol}</b></td>
            <td className="muted">{p.strategy.replace(/^Mock · /, "")}</td>
            <td className="num">{fmtSol(p.cost_lamports, 2)}</td>
            <td className="num">{fmtPriceDec(p.entry_price_sol)} → {fmtPriceDec(p.last_price_sol)}</td>
            <td className={`num ${signClass(p.pnl_lamports)}`}>{fmtSignedSol(p.pnl_lamports)}</td>
            <td className={`num ${p.pnl_pct > 0.05 ? "pos" : p.pnl_pct < -0.05 ? "neg" : "muted"}`}>{fmtPnlPct(p.pnl_pct)}</td>
            <td><ExitBar p={p} /></td>
            <td className="num muted">{fmtHold(now - p.opened_at_ms)}</td>
            <td><button className="sm" onClick={(e) => { e.stopPropagation(); onSell(p); }}>Sell <kbd>⇧X</kbd></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
