import { useEffect, useState } from "react";
import type { Position, Signal } from "../api";
import { fmtMmSs, fmtPnlPct, fmtPrice, fmtUsd, shortMint } from "./format";

export type QuickLookTarget = { kind: "signal"; item: Signal } | { kind: "position"; item: Position };

/**
 * Space quick-look (decided C2, Apex + UX): small non-modal detail panel for the focused row.
 * Toggle with Space (or row click), Esc closes. Read-only — no actions here, so it can never trade.
 */
export function QuickLook({ target, onClose }: { target: QuickLookTarget; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const rows: [string, React.ReactNode][] = [];
  let title: string;
  if (target.kind === "signal") {
    const s = target.item;
    title = `$${s.symbol} · pick`;
    rows.push(
      ["Mint", <span className="mono">{shortMint(s.mint)}</span>],
      ["Strategi", s.strategy],
      ["Fit", <span className="num">{s.score}/{s.passMark}</span>],
      ["Harga", <span className="num">{fmtPrice(s.priceUsd)}</span>],
      ["MC · Liq", <span className="num">{fmtUsd(s.marketCapUsd)} · {fmtUsd(s.liquidityUsd)}</span>],
      ["Umur", <span className="num">{s.ageMinutes}m</span>],
      ["Status", s.stage === "pending" ? <span className={`num ${s.expiresAt - now < 120_000 ? "neg" : ""}`}>pending · {fmtMmSs(s.expiresAt - now)}</span> : s.stage],
      ["Alasan", s.reasons.join(" · ") || "—"],
    );
  } else {
    const p = target.item;
    const r = p.lastPriceUsd / p.entryPriceUsd;
    const armed = p.peakPriceUsd / p.entryPriceUsd >= 1.3;
    title = `$${p.symbol} · posisi (paper)`;
    rows.push(
      ["Mint", <span className="mono">{shortMint(p.mint)}</span>],
      ["Strategi", p.strategy],
      ["Size", <span className="num">{p.solIn.toFixed(3)} SOL</span>],
      ["Entry → Now", <span className="num">{fmtPrice(p.entryPriceUsd)} → {fmtPrice(p.lastPriceUsd)}</span>],
      ["Peak", <span className="num">{fmtPrice(p.peakPriceUsd)}</span>],
      ["PnL", <span className={`num ${r > 1 ? "pos" : r < 1 ? "neg" : ""}`}>{fmtPnlPct(p.pnlPct)}</span>],
      ["Exit plan", <span>TP 2x · trailing 20% {armed ? <b className="warn">aktif</b> : "setelah +30%"} · SL −40%</span>],
      ["Hold", <span className="num">{Math.floor((now - p.openedAt) / 60000)}m {Math.floor(((now - p.openedAt) / 1000) % 60)}s</span>],
    );
  }
  return (
    <aside className="quicklook" role="dialog" aria-modal="false" aria-labelledby="ql-title">
      <header>
        <b id="ql-title">{title}</b>
        <span className="dim" style={{ marginLeft: "auto" }}><kbd>Space</kbd> / <kbd>Esc</kbd> tutup</span>
      </header>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {target.kind === "position" && <div className="dim">Sell: <kbd>⇧X</kbd> (dialog + tahan)</div>}
      {target.kind === "signal" && <div className="dim"><kbd>A</kbd> approve · <kbd>S</kbd> skip · <kbd>↵</kbd> detach chart</div>}
      <button className="ghost close" aria-label="Tutup quick-look" onClick={onClose}>×</button>
    </aside>
  );
}
