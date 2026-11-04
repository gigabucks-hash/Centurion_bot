import { useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { CoinAvatar } from "./CoinAvatar";
import { Icon } from "./Icon";
import type { ScreenedCoin } from "../api";
import { formatRelativeSeconds, LOCALES, mcapView, useLang, useT, type Lang, type T } from "../i18n";
import { serverNow } from "../state/store";
import { fmtUsdLocale } from "./format";
import { NtChip } from "./NotTradeable";

export type ScreenerFilter = "all" | "passed" | "rejected" | "not_tradeable";
const FILTERS: [ScreenerFilter, string][] = [
  ["all", "dashboard.feed.filter.all"],
  ["passed", "screener.filter.passed"],
  ["rejected", "screener.filter.rejected"],
  ["not_tradeable", "screener.not_tradeable.badge"],
];
const match = (c: ScreenedCoin, f: ScreenerFilter) =>
  f === "all" ? true
  : f === "not_tradeable" ? !c.tradeable
  : f === "passed" ? c.tradeable && (c.status === "pick" || c.status === "pending_guard")
  : c.tradeable && (c.status === "rejected_score" || c.status === "rejected_guard");

/**
 * WF-20 "Koin · screener" (desktop Compact): every scored coin stays visible for transparency.
 * Not tradeable = dimmed row, neutral ⊘ chip, empty Aksi column (no Approve / Skip / Buka antrean).
 */
export function ScreenerTable({ coins, selected, onSelect, onOpenQueue }: {
  coins: ScreenedCoin[];
  selected: string | null;
  onSelect: (mint: string) => void;
  onOpenQueue: (mint: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [filter, setFilter] = useState<ScreenerFilter>("all");
  const rows = useMemo(() => coins.filter((c) => match(c, filter)), [coins, filter]);
  const count = (f: ScreenerFilter) => coins.filter((c) => match(c, f)).length;
  return (
    <div className="screener">
      <div className="filter-chips" role="group" aria-label={t("screener.title")}>
        {FILTERS.map(([f, key]) => (
          <button key={f} className={`chip-btn${filter === f ? " on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-filter={f}>
            {t(key)} <span className="num dim">{count(f)}</span>
          </button>
        ))}
      </div>
      {!rows.length ? (
        <div className="empty"><Icon glyph={Coins} size={32} />{t("screener.empty")}</div>
      ) : (
        <table className="positions screener-table">
          <thead>
            <tr>
              <th>{t("screener.col.coin")}</th><th>{t("screener.col.venue")}</th><th>{t("screener.col.mcap")}</th><th>{t("screener.col.liquidity")}</th>
              <th>{t("screener.col.score")}</th><th>{t("screener.col.guard")}</th><th>{t("screener.col.status")}</th>
              <th>{t("screener.col.action")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const nt = !c.tradeable;
              return (
                <tr key={c.mint} className={`${c.mint === selected ? "cursor" : ""}${nt ? " nt-row" : ""}`} tabIndex={0} data-row="coin" data-mint={c.mint}
                  data-tradeable={String(c.tradeable)} aria-selected={c.mint === selected}
                  onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onSelect(c.mint); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onSelect(c.mint); }}>
                  {/* symbol is untrusted token metadata → text node only */}
                  <td><span className="coin-sym"><CoinAvatar mint={c.mint} symbol={c.symbol} logoHash={c.logo_hash} size={24} notTradeable={nt} /><b>${c.symbol}</b></span></td>
                  <td className="muted">{c.venue === "curve" ? "Curve" : c.venue === "amm" ? "AMM" : "—"}</td>
                  {/* Mcap (1.1.4): mcap_usd is display-only/indicative; the title carries the SOL value and as-of time.
                      A missing value is a muted "—" with common.value.unavailable as tooltip + accessible name. */}
                  {(() => {
                    const mv = mcapView(c, lang); // i18n 0.4.7: USD primary (SOL when no USD), "—" when unavailable
                    return mv.tooltipKeys.includes("common.value.unavailable")
                      ? <Unavailable label={t("common.value.unavailable")} />
                      : <td className="num dim" title={mcapTitle(c, lang, t)}>{mv.primary}</td>;
                  })()}
                  {/* D11: liquidity is market data, shown on not-tradeable rows too (same value as the queue card). */}
                  {c.liquidity_usd != null ? <td className="num">{fmtUsdLocale(c.liquidity_usd, lang)}</td> : <Unavailable label={t("common.value.unavailable")} />}
                  <td className="num">{c.score}</td>
                  <td>{nt || !c.guard_verdict ? <span className="dim">—</span> : <span className={`chip verdict v-${c.guard_verdict.toLowerCase()}`}>{c.guard_verdict}</span>}</td>
                  <td>
                    {nt ? <NtChip />
                      : c.status === "pick" ? <span className="chip st-pick">{t("screener.status.pick_queued")}</span>
                      : c.status === "pending_guard" ? <span className="chip">{t("screener.status.pending_guard")}</span>
                      : c.status === "rejected_guard" ? <span className="chip st-fail">{t("screener.status.rejected_guard")}</span>
                      : <span className="chip">{t("screener.status.rejected_score", { score_threshold: c.score_threshold })}</span>}
                  </td>
                  <td>
                    {/* WF-20 note 2: empty Aksi for not-tradeable coins */}
                    {!nt && c.status === "pick" ? (
                      <button className="sm ghost" onClick={() => onOpenQueue(c.mint)}>{t("screener.action.open_queue")}</button>
                    ) : <span className="dim">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="dim legend">{t("screener.legend")}</div>
    </div>
  );
}

/** Muted "—" cell whose tooltip / accessible name says the data is not available yet. */
function Unavailable({ label }: { label: string }) {
  return <td className="num dim" title={label}><span aria-hidden>—</span><span className="sr-only">{label}</span></td>;
}

/** Mcap cell tooltip (i18n 0.4.7 `mcap.*` + mcapView): label, ≈ SOL value (formatMcapSol), "as of HH:MM ·
 *  N s ago" (server clock), then mcapView's extra tooltip keys (mcap.usd_indicative for curve/pool USD).
 *  The age is computed when the tooltip is rendered (row update / hover). */
export function mcapTitle(c: ScreenedCoin, lang: Lang, t: T, nowMs = serverNow()): string {
  const mv = mcapView(c, lang);
  const lines = [t("mcap.label")];
  if (mv.secondary) lines.push(t("mcap.sol_value", { amount: mv.secondary }));
  const asOf = c.mcap_as_of ? Date.parse(c.mcap_as_of) : NaN;
  if (Number.isFinite(asOf)) {
    const hhmm = new Date(asOf).toLocaleTimeString(LOCALES[lang], { hour: "2-digit", minute: "2-digit" });
    lines.push(`${t("mcap.as_of", { time: hhmm })} · ${formatRelativeSeconds(-Math.max(0, Math.round((nowMs - asOf) / 1000)), lang)}`);
  }
  for (const k of mv.tooltipKeys) if (k !== "mcap.as_of") lines.push(t(k));
  return lines.join("\n");
}

