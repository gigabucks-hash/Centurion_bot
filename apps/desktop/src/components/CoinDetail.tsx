import type { PickView, ScreenedCoin } from "../api";
import { skipChip, useLang, useT } from "../i18n";
import { fmtUsdLocale, shortMint } from "./format";
import { NtChip, NtDetail } from "./NotTradeable";
import { PriceChart } from "./PriceChart";

/**
 * WF-20 detail panel for a screener row. Not tradeable: badge → ⓘ reason first → technical rows
 * (reason code for support) → read-only chart (greyed, no CTA) → a *labelled* disabled Approve.
 * Read-only: this panel has no action that can trade. Rev 4.4: if the coin has a pending pick it can
 * still be skipped (skipping is not a trade).
 */
export function CoinDetail({ coin, pick, onOpenQueue, onSkip }: {
  coin: ScreenedCoin;
  /** Pending pick for this mint, if any (race case: a queued coin that lost its SOL pair). */
  pick?: PickView;
  onOpenQueue: (mint: string) => void;
  onSkip?: (p: PickView) => void;
}) {
  const t = useT();
  const lang = useLang();
  const nt = !coin.tradeable;
  const quote = coin.quote_symbol ?? (coin.quote_mint ? shortMint(coin.quote_mint) : "—");
  const rows: [string, string, boolean?][] = nt
    ? [
        [t("screener.detail.quote_pair"), t("screener.detail.quote_not_sol", { quote_symbol: quote })],
        [t("screener.detail.sol_pair"), t("screener.detail.none")],
        [t("screener.detail.score"), t("screener.detail.score_value_info", { score: coin.score, max_score: coin.max_score })],
        [t("screener.detail.guard"), t("screener.detail.guard_not_run")],
        [t("screener.detail.reason_code"), coin.reason_code ?? "UNSUPPORTED_QUOTE_MINT", true],
      ]
    : [
        [t("screener.col.venue"), coin.venue === "curve" ? "Curve" : coin.venue === "amm" ? "AMM" : "—"],
        [t("screener.col.liquidity"), coin.liquidity_usd == null ? "—" : fmtUsdLocale(coin.liquidity_usd, lang)],
        [t("screener.detail.score"), `${coin.score} / ${coin.score_threshold}`],
        [t("screener.detail.guard"), coin.guard_verdict ?? "—"],
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
      {nt && <div className="dim note">{t("screener.detail.chart_note")}</div>}
      <div className={`mini-chart${nt ? " readonly" : ""}`} aria-hidden={nt || undefined}>
        <PriceChart mint={coin.mint} />
      </div>
      {nt ? (
        <>
          {/* Disabled CTA stays visible and labelled; the reason is written above (not tooltip-only). */}
          <button className="cta-disabled" disabled aria-disabled="true" aria-describedby="cd-title">{t("screener.detail.approve_unavailable")}</button>
          {pick && onSkip && (
            <>
              <button className="ghost" data-action="skip" onClick={() => onSkip(pick)}>{t("queue.pick.skip")} · {t(skipChip("not_tradeable")?.label_key ?? "queue.skip_reason.not_tradeable")}</button>
              <div className="dim note">{t("screener.detail.skip_hint")}</div>
            </>
          )}
        </>
      ) : coin.status === "pick" ? (
        <button className="primary" onClick={() => onOpenQueue(coin.mint)}>{t("screener.action.open_queue")}</button>
      ) : null}
    </aside>
  );
}
