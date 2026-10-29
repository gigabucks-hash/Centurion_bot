import type { Position } from "../api";
import { fmtPnlPct, fmtPrice } from "./format";

/** Mock exit plan mirrored from src-tauri/src/mock: SL 0.6×, TP 2×, trailing 20% after +30%. */
const SL = 0.6;
const TP = 2.0;
const TRAIL_ARM = 1.3;

const pnlSol = (p: Position) => (p.qty * p.lastPriceUsd) / 150 - p.solIn;
const fmtSol = (n: number) => `${n > 0.00005 ? "▲ +" : n < -0.00005 ? "▼ −" : "±"}${Math.abs(n).toFixed(3).replace(".", ",")}`;
const fmtHold = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}j ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** Exit progress (WF-11): red = SL side, marker = price between SL and TP, dots = trail arm / TP. */
function ExitBar({ p }: { p: Position }) {
  const r = p.lastPriceUsd / p.entryPriceUsd;
  const pos = Math.max(0, Math.min(1, (r - SL) / (TP - SL)));
  const entry = (1 - SL) / (TP - SL);
  const trail = (TRAIL_ARM - SL) / (TP - SL);
  const armed = p.peakPriceUsd / p.entryPriceUsd >= TRAIL_ARM;
  const label = `Exit plan: SL −40%, trailing 20% ${armed ? "aktif" : "setelah +30%"}, TP 2x; harga ${fmtPnlPct((r - 1) * 100)}`;
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

export function PositionsSummary({ positions }: { positions: Position[] }) {
  const used = positions.reduce((a, p) => a + p.solIn, 0);
  const un = positions.reduce((a, p) => a + pnlSol(p), 0);
  return (
    <span className="muted num">
      {positions.length} open · {used.toFixed(2).replace(".", ",")} SOL terpakai · unrealized <span className={un > 0 ? "pos" : un < 0 ? "neg" : ""}>{fmtSol(un)} SOL</span>
    </span>
  );
}

/** Compact positions table (UX WF-11): row 32, header 28 overline, numbers mono right-aligned, Sell ⇧X sm button. */
export function PositionsTable({ positions, cursorMint, onCursor, onSell, now = Date.now() }: {
  positions: Position[];
  cursorMint: string | null;
  onCursor: (mint: string) => void;
  onSell: (p: Position) => void;
  now?: number;
}) {
  if (!positions.length) return <div className="empty">Tidak ada posisi (paper)</div>;
  return (
    <table className="positions">
      <thead>
        <tr><th>Coin</th><th>Strategi</th><th>Size</th><th>Entry → Now</th><th>PnL SOL</th><th>PnL %</th><th>Exit plan</th><th>Hold</th><th /></tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const ps = pnlSol(p);
          const cls = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "muted");
          return (
            <tr key={p.mint} className={p.mint === cursorMint ? "cursor" : ""} aria-selected={p.mint === cursorMint} onClick={() => onCursor(p.mint)}>
              <td><b>${p.symbol}</b></td>
              <td className="muted">{p.strategy.replace(/^Mock · /, "")}</td>
              <td className="num">{p.solIn.toFixed(2).replace(".", ",")}</td>
              <td className="num">{fmtPrice(p.entryPriceUsd)} → {fmtPrice(p.lastPriceUsd)}</td>
              <td className={`num ${cls(ps)}`}>{fmtSol(ps)}</td>
              <td className={`num ${p.pnlPct > 0.05 ? "pos" : p.pnlPct < -0.05 ? "neg" : "muted"}`}>{fmtPnlPct(p.pnlPct)}</td>
              <td><ExitBar p={p} /></td>
              <td className="num muted">{fmtHold(now - p.openedAt)}</td>
              <td><button className="sm" onClick={(e) => { e.stopPropagation(); onSell(p); }}>Sell <kbd>⇧X</kbd></button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
