import type { ScreenedCoin } from "../api";
import { useLang, useT } from "../i18n";
import { fmtUsdLocale, shortMint } from "./format";
import { NtChip, NtDetail } from "./NotTradeable";
import { PriceChart } from "./PriceChart";

/**
 * WF-20 detail panel for a screener row. Not tradeable: badge → ⓘ reason first → technical rows
 * (reason code for support) → read-only chart (greyed, no CTA) → a *labelled* disabled Approve.
 * Read-only: this panel has no action that can trade.
 */
export function CoinDetail({ coin, onOpenQueue }: { coin: ScreenedCoin; onOpenQueue: (mint: string) => void }) {
  const t = useT();
  const lang = useLang();
  const nt = !coin.tradeable;
  const quote = coin.quote_symbol ?? (coin.quote_mint ? shortMint(coin.quote_mint) : "—");
  const rows: [string, string, boolean?][] = nt
    ? [
        [t("desktop.nt.pair_quote"), t("desktop.nt.pair_quote_value", { quote })],
        [t("desktop.nt.pair_sol"), t("desktop.nt.pair_sol_none")],
        [t("desktop.nt.score"), t("desktop.nt.score_value", { score: coin.score, max: coin.max_score })],
        [t("desktop.nt.guard"), t("desktop.nt.guard_value")],
        [t("desktop.nt.reason_code"), coin.reason_code ?? "UNSUPPORTED_QUOTE_MINT", true],
      ]
    : [
        [t("desktop.screener.col.venue"), coin.venue === "curve" ? "Curve" : coin.venue === "amm" ? "AMM" : "—"],
        [t("desktop.screener.col.liquidity"), coin.liquidity_usd == null ? "—" : fmtUsdLocale(coin.liquidity_usd, lang)],
        [t("desktop.nt.score"), `${coin.score} / ${coin.score_threshold}`],
        [t("desktop.nt.guard"), coin.guard_verdict ?? "—"],
      ];
  return (
    <aside className={`coin-detail${nt ? " is-nt" : ""}`} aria-labelledby="cd-title" data-testid="coin-detail">
      <header>
        <b id="cd-title">${coin.symbol}</b>
        {nt && <NtChip />}
      </header>
      <div className="dim mono">{coin.name ?? ""} · mint {shortMint(coin.mint)}</div>
      {nt && <NtDetail trade={coin} />}
      <dl>
        {rows.map(([k, v, mono]) => (
          <div key={k}><dt>{k}</dt><dd className={mono ? "mono" : "num"}>{v}</dd></div>
        ))}
      </dl>
      {nt && <div className="dim note">{t("desktop.nt.chart_note")}</div>}
      <div className={`mini-chart${nt ? " readonly" : ""}`} aria-hidden={nt || undefined}>
        <PriceChart mint={coin.mint} />
      </div>
      {nt ? (
        <>
          {/* Disabled CTA stays visible and labelled; the reason is written above (not tooltip-only). */}
          <button className="cta-disabled" disabled aria-disabled="true" aria-describedby="cd-title">{t("desktop.nt.approve_unavailable")}</button>
          <div className="dim note">{t("desktop.nt.cta_note")}</div>
        </>
      ) : coin.status === "pick" ? (
        <button className="primary" onClick={() => onOpenQueue(coin.mint)}>{t("desktop.screener.open_queue")}</button>
      ) : null}
    </aside>
  );
}
