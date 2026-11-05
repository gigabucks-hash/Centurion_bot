import { useEffect, useMemo, useState } from "react";
import { X as XGlyph } from "lucide-react";
import { core, type ClosedTradeView, type PnlReportView, type PnlWindow } from "../api";
import { errorText, localTime, LOCALES, pnlLamports, pnlPercent, pnlText, solText, TONE_CLASS, useLang, useT } from "../i18n";
import { useHotkeys } from "../hooks/useHotkeys";
import { useTerm } from "../state/store";
import { CoinAvatar } from "./CoinAvatar";
import { Icon } from "./Icon";
import { shortMint } from "./format";
import { PNL_RANGES, entryExitText, pnlReconciles, pnlTotal, sortClosed, type PnlSortKey, type SortDir } from "./pnlReportView";

/** Realized PnL is locked at close; unrealized still follows the mark. Server numbers only. */
function holdText(seconds: number | null, t: ReturnType<typeof useT>) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return t("pnl.report.hold.hm", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  if (s >= 60) return t("pnl.report.hold.ms", { m: Math.floor(s / 60), s: s % 60 });
  return t("pnl.report.hold.s", { s });
}

/**
 * PnL report window (desktop parity with mobile `/pnl` and web `/stats`):
 * unrealized + realized, the selected range's realized result, per-exit-reason breakdown and the
 * closed-trade ledger. The numbers come from `/stats/pnl` + `/positions?state=closed`; the client
 * never re-adds rows to invent realized. The all-time equation is shown so the range figure and the
 * ledger can legitimately differ (partial take-profits, closes outside the range).
 */
export function PnlReportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const st = useTerm();
  const paper = st.mode === "practice";
  const [range, setRange] = useState<PnlWindow>("7d");
  const [data, setData] = useState<PnlReportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: PnlSortKey; dir: SortDir }>({ key: "closed", dir: "desc" });
  useHotkeys({ escape: onClose });

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setData(null);
    core
      .pnlReport(range)
      .then((d) => {
        if (!live) return;
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (!live) return;
        setError(errorText(e, lang));
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [range, lang]);

  // Closed rows carry the mint only; resolve the symbol from anything this session already knows.
  const symbols = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of st.screened) m.set(s.mint, s.symbol);
    for (const s of st.signals) m.set(s.mint, s.symbol);
    for (const p of st.positions) m.set(p.mint, p.symbol);
    for (const a of st.activity) if (a.mint && a.symbol) m.set(a.mint, a.symbol);
    return m;
  }, [st.screened, st.signals, st.positions, st.activity]);

  // Closed rows carry the bot id only; the name comes from the strategy list already in the store.
  const bots = useMemo(() => new Map(st.strategies.map((s) => [s.id, s.name] as const)), [st.strategies]);
  const botText = (id: string | null) =>
    id == null ? "—" : bots.get(id) ?? (id.length > 12 ? `${id.slice(0, 8)}…` : id);

  const rows = useMemo(() => sortClosed(data?.closed ?? [], sort.key, sort.dir), [data, sort]);
  const pctText = (pct: number | null) => {
    if (pct == null) return "—";
    return new Intl.NumberFormat(LOCALES[lang], { style: "percent", maximumFractionDigits: 1 }).format(pct / 100);
  };
  const reason = (r: string) => {
    const key = `exit_reason.${r}`;
    const copy = t(key);
    return copy === key ? r : copy;
  };
  const money = (raw: string | null | undefined) => pnlText(pnlLamports(raw, lang, paper));
  const moneyTone = (raw: string | null | undefined) => {
    const p = pnlLamports(raw, lang, paper);
    return p ? TONE_CLASS[p.tone] : "muted";
  };
  const toggle = (key: PnlSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const ariaSort = (key: PnlSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  const sum = data?.summary;
  const mode = sum?.mode ?? (paper ? "practice" : "real");
  const rangeLabel = t(`pnl.report.range.${range}`);
  const cell = (key: string, label: string, value: string, hint: string | null, tone = "") => (
    <div className="pnl-report-cell" data-cell={key} key={key}>
      <span className="pnl-k">{label}</span>
      <span className={`num pnl-v ${tone}`}>{value}</span>
      {hint && <span className="pnl-hint">{hint}</span>}
    </div>
  );
  const th = (key: PnlSortKey, label: string) => (
    <th aria-sort={ariaSort(key)}>
      <button
        type="button"
        className={`th-sort${sort.key === key ? " on" : ""}`}
        onClick={() => toggle(key)}
        title={t("pnl.report.sort", { column: label })}
      >
        {label}
      </button>
    </th>
  );

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("pnl.report.title")} data-testid="pnl-report-dialog">
      <div className="modal pnl-modal">
        <header className="pnl-head">
          <h3>
            {t("pnl.report.title")}{" "}
            <span className="chip">{t(mode === "practice" ? "mode.practice.label" : "mode.real.label")}</span>
            {mode === "practice" && sum?.practice_epoch != null && (
              <span className="chip" data-testid="pnl-epoch">{t("pnl.report.epoch", { epoch: sum.practice_epoch })}</span>
            )}
          </h3>
          <button className="ghost icon-btn" autoFocus onClick={onClose} aria-label={t("pnl.report.close")} title={t("pnl.report.close")}>
            <Icon glyph={XGlyph} size={18} />
          </button>
        </header>

        <div className="seg pnl-ranges" role="tablist" aria-label={t("pnl.report.range")}>
          {PNL_RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={range === r} className={`sm${range === r ? " on" : ""}`} onClick={() => setRange(r)}>
              {t(`pnl.report.range.${r}`)}
            </button>
          ))}
        </div>

        {error ? (
          <div className="pnl-state neg" role="alert">{error}</div>
        ) : loading && !data ? (
          <div className="pnl-state muted" role="status">{t("pnl.report.loading")}</div>
        ) : data && sum ? (
          <div className="pnl-body">
            <div className="pnl-summary" data-testid="pnl-summary">
              {cell(
                "unrealized",
                t("pnl.report.unrealized"),
                money(sum.unrealized_pnl_lamports),
                t("pnl.report.open_count", { count: st.positions.length }),
                moneyTone(sum.unrealized_pnl_lamports),
              )}
              {cell(
                "realized-window",
                t("pnl.report.realized_window", { range: rangeLabel }),
                money(sum.realized_pnl_window_lamports),
                t("pnl.report.closed_count", { count: sum.closed_count }),
                moneyTone(sum.realized_pnl_window_lamports),
              )}
              {cell("closed", t("pnl.report.closed"), String(sum.closed_count), sum.closed_count ? t("pnl.report.closed_wins", { wins: sum.win_count, count: sum.closed_count }) : null)}
              {cell("win-rate", t("pnl.report.win_rate"), pctText(sum.win_rate_pct), t("pnl.report.closed_count", { count: sum.closed_count }))}
              {cell("avg-hold", t("pnl.report.avg_hold"), holdText(sum.avg_hold_s, t), rangeLabel)}
            </div>

            <div className="pnl-recon" data-testid="pnl-recon">
              <span>
                {t("pnl.report.reconcile", {
                  unrealized: money(sum.unrealized_pnl_lamports),
                  realized: money(sum.realized_pnl_lamports),
                  total: money(pnlTotal(sum)),
                })}
              </span>
              {pnlReconciles(sum) === false && (
                <span className="neg" role="alert">{t("pnl.report.reconcile_bad")}</span>
              )}
              <span className="dim">{t("pnl.report.reconcile_note", { range: rangeLabel })}</span>
            </div>

            <div className="pnl-meta" data-testid="pnl-report-meta">
              <span>{t("pnl.report.best")}: <b className={`num ${moneyTone(sum.best_pnl_lamports)}`}>{money(sum.best_pnl_lamports)}</b></span>
              <span>{t("pnl.report.worst")}: <b className={`num ${moneyTone(sum.worst_pnl_lamports)}`}>{money(sum.worst_pnl_lamports)}</b></span>
              <span title={t("pnl.report.fees_hint")}>{t("pnl.report.fees_reported")}: <b className="num">{solText(sum.fees_lamports, lang, paper)}</b></span>
            </div>

            <h4>{t("pnl.report.by_exit")}</h4>
            {data.exit_stats.length ? (
              <table className="pnl-table pnl-exits">
                <thead>
                  <tr><th>{t("pnl.report.exit_reason")}</th><th>{t("pnl.report.trades")}</th><th className="num">{t("pnl.report.realized_short")}</th><th>{t("pnl.report.win_rate")}</th><th>{t("pnl.report.avg_hold")}</th></tr>
                </thead>
                <tbody>
                  {data.exit_stats.map((x) => {
                    const p = pnlLamports(x.pnl_lamports, lang, paper);
                    return (
                      <tr key={x.exit_reason}>
                        <td>{reason(x.exit_reason)}</td>
                        <td className="num">{x.count}</td>
                        <td className={`num ${p ? TONE_CLASS[p.tone] : "muted"}`}>{pnlText(p)}</td>
                        <td className="num">{x.win_rate_pct == null ? "—" : pctText(x.win_rate_pct)}</td>
                        <td className="num">{x.avg_hold_s == null ? "—" : holdText(x.avg_hold_s, t)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="dim">{t("pnl.report.no_exits")}</p>
            )}

            <h4>{t("pnl.report.closed_trades")} <span className="dim num">{sum.closed_count}{data.closed.length < sum.closed_count ? "+" : ""}</span> <span className="dim pnl-ledger-hint">{t("pnl.report.ledger_hint")}</span></h4>
            {rows.length ? (
              <div className="pnl-ledger" data-testid="pnl-ledger">
                <table className="pnl-table pnl-closed">
                  <thead>
                    <tr>
                      <th>{t("pnl.report.coin")}</th>
                      {th("pnl", t("pnl.report.realized_short"))}
                      {th("pct", "%")}
                      <th className="num">{t("pnl.report.sol_in")}</th>
                      <th className="num">{t("pnl.report.sol_out")}</th>
                      <th className="num" title={t("pnl.report.fees_hint")}>{t("pnl.report.fees_reported")}</th>
                      <th>{t("pnl.report.bot")}</th>
                      <th>{t("pnl.report.exit_reason")}</th>
                      {th("closed", t("pnl.report.entry_exit"))}
                      {th("hold", t("pnl.report.hold"))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: ClosedTradeView) => {
                      const sym = symbols.get(r.mint) ?? shortMint(r.mint);
                      const p = pnlLamports(r.pnl_lamports, lang, paper);
                      const pct = pnlPercent(r.pnl_pct, lang);
                      return (
                        <tr key={`${r.id}:${r.closed_at ?? r.position_key}`} data-row="closed-trade" data-mint={r.mint}>
                          <td><span className="coin-sym" title={r.mint}><CoinAvatar mint={r.mint} symbol={sym} logoHash={r.logo_hash} size={20} /><b>${sym}</b></span></td>
                          <td className={`num ${p ? TONE_CLASS[p.tone] : "muted"}`}>{p ? pnlText(p) : "—"}</td>
                          <td className={`num ${pct ? TONE_CLASS[pct.tone] : "muted"}`}>{pct ? pnlText(pct) : "—"}</td>
                          <td className="num">{r.sol_in_lamports == null ? "—" : solText(r.sol_in_lamports, lang, paper)}</td>
                          <td className="num">{r.sol_out_lamports == null ? "—" : solText(r.sol_out_lamports, lang, paper)}</td>
                          <td className="num" title={t("pnl.report.fees_hint")}>{r.fees_lamports == null ? "—" : solText(r.fees_lamports, lang, paper)}</td>
                          <td className="col-bot" title={r.strategy_id ?? undefined}><span className="bot-name">{botText(r.strategy_id)}</span></td>
                          <td>{r.exit_reason ? reason(r.exit_reason) : "—"}</td>
                          <td className="num muted" title={r.closed_at ? localTime(r.closed_at, lang) : undefined} data-entry-exit>{entryExitText(r.opened_at, r.closed_at, LOCALES[lang])}</td>
                          <td className="num muted">{holdText(r.hold_seconds, t)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="pnl-empty">
                <b>{t("pnl.report.empty.title")}</b>
                <span className="dim">{t("pnl.report.empty.body")}</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}