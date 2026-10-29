import { useEffect, useState } from "react";
import { core, type PickView, type PositionView, type TimelineItem } from "../api";
import { useServerNow } from "./SignalQueue";
import { fmtMmSs, fmtPnlPct, fmtPriceDec, fmtSignedSol, fmtSol, fmtTime, fmtUsd, shortMint, signClass } from "./format";

export type QuickLookTarget = { kind: "signal"; item: PickView } | { kind: "position"; item: PositionView };

/** Last few coin timeline events (`GET /coins/{mint}/timeline`, v1.0 `/trail`). */
function Timeline({ mint }: { mint: string }) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  useEffect(() => {
    let live = true;
    core.coinTimeline(mint).then((x) => live && setItems(x.slice(0, 4))).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [mint]);
  if (!items) return <span className="dim">…</span>;
  if (!items.length) return <span className="dim">—</span>;
  return <span className="mono">{items.map((t) => `${fmtTime(Date.parse(t.ts))} ${t.kind}`).join(" · ")}</span>;
}

/**
 * Space quick-look (decided C2, Apex + UX): small non-modal detail panel for the focused row.
 * Toggle with Space (or row click), Esc closes. Read-only — no actions here, so it can never trade.
 */
export function QuickLook({ target, onClose }: { target: QuickLookTarget; onClose: () => void }) {
  const now = useServerNow(1000);
  const rows: [string, React.ReactNode][] = [];
  let title: string;
  if (target.kind === "signal") {
    const s = target.item;
    title = `$${s.symbol} · pick`;
    rows.push(
      ["Mint", <span className="mono">{shortMint(s.mint)}</span>],
      ["Strategi", s.strategy],
      ["Fit", <span className="num">{s.score ?? "—"}/{s.score_threshold ?? "—"}</span>],
      ["Harga", <span className="num">{fmtPriceDec(s.price_sol)} SOL</span>],
      ["Liq · Guard", <span className="num">{s.liquidity_usd != null ? fmtUsd(s.liquidity_usd) : "—"} · {s.guard_verdict ?? "—"}</span>],
      ["Ukuran", <span className="num">{fmtSol(s.amount_lamports, 2)} SOL</span>],
      ["Status", s.status === "pending" ? <span className={`num ${s.expires_at_ms - now < 120_000 ? "neg" : ""}`}>pending · {fmtMmSs(s.expires_at_ms - now)}</span> : s.status === "rejected" ? "skipped" : s.status],
      ["Alasan", s.reasons.join(" · ") || "—"],
      ["Timeline", <Timeline mint={s.mint} />],
    );
  } else {
    const p = target.item;
    const armed = p.peak_ratio >= 1.3;
    title = `$${p.symbol} · posisi (paper)`;
    rows.push(
      ["Mint", <span className="mono">{shortMint(p.mint)}</span>],
      ["Strategi", p.strategy],
      ["Size", <span className="num">{fmtSol(p.cost_lamports, 3)} SOL</span>],
      ["Entry → Now", <span className="num">{fmtPriceDec(p.entry_price_sol)} → {fmtPriceDec(p.last_price_sol)}</span>],
      ["Peak", <span className="num">{fmtPriceDec(p.peak_price_sol)}</span>],
      ["PnL", <span className={`num ${signClass(p.pnl_lamports)}`}>{fmtSignedSol(p.pnl_lamports)} SOL · {fmtPnlPct(p.pnl_pct)}</span>],
      ["Exit plan", <span>target profit 2x · trail dari puncak 20% {armed ? <b className="warn">aktif</b> : "setelah +30%"} · batas rugi −40%</span>],
      ["Hold", <span className="num">{Math.floor((now - p.opened_at_ms) / 60000)}m {Math.floor(((now - p.opened_at_ms) / 1000) % 60)}s</span>],
      ["Rev", <span className="num">{p.rev ?? "—"}</span>],
      ["Timeline", <Timeline key={p.mint} mint={p.mint} />],
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
