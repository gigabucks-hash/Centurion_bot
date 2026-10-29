import { useEffect, useState } from "react";
import { core, type PickView, type PositionView, type TimelineItem } from "../api";
import { useServerNow } from "./SignalQueue";
import { pnlLamports, pnlPercent, pnlText, solText, TONE_CLASS, useLang, useT } from "../i18n";
import { useTerm } from "../state/store";
import { fmtMmSs, fmtPriceDec, fmtTime, fmtUsdLocale, shortMint } from "./format";
import { NtChip, NtDetail } from "./NotTradeable";

export type QuickLookTarget = { kind: "signal"; item: PickView } | { kind: "position"; item: PositionView };

/** Last few coin timeline events (`GET /coins/{mint}/timeline`, v1.0 `/trail`). */
function Timeline({ mint }: { mint: string }) {
  const t = useT();
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  useEffect(() => {
    let live = true;
    core.coinTimeline(mint).then((x) => live && setItems(x.slice(0, 4))).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [mint]);
  // tokens 0.2.5 `.skeleton` (static under reduced motion); common.state.loading for assistive tech.
  if (!items) return <span className="skeleton skeleton--text ql-skel" role="status" aria-label={t("common.state.loading")} />;
  if (!items.length) return <span className="dim">—</span>;
  return <span className="mono">{items.map((t) => `${fmtTime(Date.parse(t.ts))} ${t.kind}`).join(" · ")}</span>;
}

/**
 * Space quick-look (decided C2, Apex + UX): small non-modal detail panel for the focused row.
 * Toggle with Space (or row click), Esc closes. Read-only — no actions here, so it can never trade.
 */
export function QuickLook({ target, onClose }: { target: QuickLookTarget; onClose: () => void }) {
  const now = useServerNow(1000);
  const t = useT();
  const lang = useLang();
  const paper = useTerm((s) => s.mode) === "practice";
  const rows: [string, React.ReactNode][] = [];
  const nt = target.item.tradeable === false;
  let title: string;
  if (target.kind === "signal") {
    const s = target.item;
    title = `$${s.symbol} · pick`;
    rows.push(
      ["Mint", <span className="mono">{shortMint(s.mint)}</span>],
      ["Strategi", s.strategy],
      ["Fit", <span className="num">{s.score ?? "—"}/{s.score_threshold ?? "—"}</span>],
      ["Harga", <span className="num">{fmtPriceDec(s.price_sol)} SOL</span>],
      ["Liq · Guard", <span className="num">{s.liquidity_usd != null ? fmtUsdLocale(s.liquidity_usd, lang) : "—"} · {s.guard_verdict ?? "—"}</span>],
      ["Ukuran", <span className="num">{solText(s.amount_lamports, lang, paper)}</span>],
      ["Status", s.status === "pending" ? <span className={`num ${nt ? "countdown neutral" : s.expires_at_ms - now < 120_000 ? "neg" : ""}`}>pending · {fmtMmSs(s.expires_at_ms - now)}</span> : s.status === "rejected" ? "skipped" : s.status],
      ["Alasan", s.reasons.join(" · ") || "—"],
      ["Timeline", <Timeline mint={s.mint} />],
    );
  } else {
    const p = target.item;
    const armed = p.peak_ratio >= 1.3;
    title = `$${p.symbol} · ${t(paper ? "positions.title_paper" : "positions.title")}`;
    rows.push(
      ["Mint", <span className="mono">{shortMint(p.mint)}</span>],
      ["Strategi", p.strategy],
      ["Size", <span className="num">{solText(p.cost_lamports, lang, paper)}</span>],
      ["Entry → Now", <span className="num">{fmtPriceDec(p.entry_price_sol)} → {fmtPriceDec(p.last_price_sol)}</span>],
      ["Peak", <span className="num">{fmtPriceDec(p.peak_price_sol)}</span>],
      ["PnL", (() => {
        const sol = pnlLamports(p.pnl_lamports, lang, paper);
        const pct = pnlPercent(p.pnl_pct, lang);
        return <span className={`num ${sol ? TONE_CLASS[sol.tone] : "muted"}`}>{pnlText(sol)} · {pnlText(pct)}</span>;
      })()],
      ["Exit plan", <span>target profit 2x · trail dari puncak 20% {armed ? <b className="warn">aktif</b> : "setelah +30%"} · batas rugi −40%</span>],
      ["Hold", <span className="num">{Math.floor((now - p.opened_at_ms) / 60000)}m {Math.floor(((now - p.opened_at_ms) / 1000) % 60)}s</span>],
      ["Rev · decimals", <span className="num">{p.rev ?? "—"} · {p.decimals ?? "—"}</span>],
      ["Timeline", <Timeline key={p.mint} mint={p.mint} />],
    );
  }
  return (
    <aside className="quicklook" role="dialog" aria-modal="false" aria-labelledby="ql-title">
      {/* D9: title ellipsizes with a full-text tooltip; the badge gets its own line so neither is clipped. */}
      <header>
        <b id="ql-title" className="ql-title" title={title}>{title}</b>
        <span className="dim ql-hint"><kbd>Space</kbd>/<kbd>Esc</kbd></span>
      </header>
      {nt && <div className="ql-badges"><NtChip /></div>}
      {nt && <NtDetail trade={target.item} kind={target.kind === "position" ? "sell" : "approve"} />}
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {target.kind === "position" && <div className="dim">{nt ? t("positions.sell.unavailable") : <>Sell: <kbd>⇧X</kbd> (dialog + tahan)</>}</div>}
      {target.kind === "signal" && <div className="dim">{nt ? t("queue.pick.cannot_approve") : <><kbd>A</kbd> {t("queue.pick.approve")}</>} · <kbd>S</kbd> {t("queue.pick.skip")} · <kbd>↵</kbd> chart</div>}
      <button className="ghost close" aria-label="Tutup quick-look" onClick={onClose}>×</button>
    </aside>
  );
}
