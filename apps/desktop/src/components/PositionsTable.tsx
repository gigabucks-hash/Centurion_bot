import type { PlanState, PositionView } from "../api";
import { pnlLamports, pnlPercent, pnlText, solText, TONE_CLASS, useLang, useT, type Lang } from "../i18n";
import { useTerm } from "../state/store";
import { fmtPriceDec } from "./format";
import { NtChip } from "./NotTradeable";

/**
 * Exit plan thresholds. 1.1.2: read from the typed `plan_state` (discriminated PlanStep); falls
 * back to the mock strategy defaults (loss guard −40 % from entry, profit target 2×, peak trail 20 %
 * armed after +30 %) until the first `position.updated` carries one.
 */
function planOf(ps: PlanState | null) {
  let loss = 0.6, target = 2.0, trailPct = 20, armed: boolean | null = null;
  for (const s of ps?.steps ?? []) {
    if (s.kind === "loss_guard") loss = 1 - s.at_loss_pct / 100;
    else if (s.kind === "profit_target") target = 1 + s.at_gain_pct / 100;
    else if (s.kind === "peak_trail") (trailPct = s.trail_pct), (armed = s.armed);
  }
  return { loss, target, trailPct, armed, trailArm: 1.3 };
}

const fmtHold = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}j ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** Exit progress (WF-11): red = loss-guard side, marker = price between loss guard and profit target, dots = trail arm / target. */
function ExitBar({ p, lang }: { p: PositionView; lang: Lang }) {
  const plan = planOf(p.plan_state);
  const r = p.ratio;
  const span = plan.target - plan.loss;
  const pos = Math.max(0, Math.min(1, (r - plan.loss) / span));
  const entry = (1 - plan.loss) / span;
  const trail = (plan.trailArm - plan.loss) / span;
  const armed = plan.armed ?? p.peak_ratio >= plan.trailArm;
  const label = `Exit plan: batas rugi −${Math.round((1 - plan.loss) * 100)}%, trail dari puncak ${plan.trailPct}% ${armed ? "aktif" : "setelah +30%"}, target profit ${plan.target}x; harga ${pnlText(pnlPercent((r - 1) * 100, lang))}`;
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
  const t = useT();
  const lang = useLang();
  const paper = useTerm((s) => s.mode) === "practice";
  let used = 0n;
  let un = 0n;
  for (const p of positions) {
    used += BigInt(p.cost_lamports);
    un += BigInt(p.pnl_lamports);
  }
  const pnl = pnlLamports(un.toString(), lang, paper);
  return (
    <span className="muted num">
      {t("positions.open_count", { count: positions.length })} · {solText(used.toString(), lang, paper)} · unrealized <span className={pnl ? TONE_CLASS[pnl.tone] : "muted"}>{pnlText(pnl)}</span>
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
  const t = useT();
  const lang = useLang();
  const mode = useTerm((s) => s.mode);
  const paper = mode === "practice";
  if (!positions.length) return <div className="empty">{t("positions.empty", { mode })}</div>;
  return (
    <table className="positions">
      <thead>
        <tr><th>Coin</th><th className="col-strategy">Strategi</th><th>Size</th><th className="col-entry">Entry → Now</th><th className="col-pnl">PnL SOL</th><th className="col-pnl-pct">PnL %</th><th>Exit plan</th><th className="col-hold">Hold</th><th /></tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const sol = pnlLamports(p.pnl_lamports, lang, paper);
          const pct = pnlPercent(p.pnl_pct, lang);
          const nt = p.tradeable === false;
          return (
            <tr key={p.key} className={`${p.mint === cursorMint ? "cursor" : ""}${nt ? " nt-row" : ""}`} aria-selected={p.mint === cursorMint} tabIndex={0}
              data-row="position" data-mint={p.mint} data-key={p.key} data-tradeable={String(!nt)}
              onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onCursor(p.mint); }}
              onFocus={(e) => e.target === e.currentTarget && onFocusRow?.(p.mint)}>
              <td><b>${p.symbol}</b> {nt && <NtChip compact title={t("positions.sell.not_tradeable_detail")} />}</td>
              <td className="muted col-strategy">{p.strategy.replace(/^Mock · /, "")}</td>
              <td className="num">{solText(p.cost_lamports, lang, paper)}</td>
              <td className="num col-entry">{fmtPriceDec(p.entry_price_sol)} → {fmtPriceDec(p.last_price_sol)}</td>
              <td className={`num col-pnl ${sol ? TONE_CLASS[sol.tone] : "muted"}`}>{pnlText(sol)}</td>
              <td className={`num col-pnl-pct ${pct ? TONE_CLASS[pct.tone] : "muted"}`}>{pnlText(pct)}</td>
              <td><ExitBar p={p} lang={lang} /></td>
              <td className="num muted col-hold">{fmtHold(now - p.opened_at_ms)}</td>
              <td>
                {nt ? (
                  <button className="sm cta-disabled" disabled aria-disabled="true" data-action="sell">{t("positions.sell.unavailable")}</button>
                ) : (
                  <button className="sm" data-action="sell" onClick={(e) => { e.stopPropagation(); onSell(p); }}>Sell <kbd>⇧X</kbd></button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
