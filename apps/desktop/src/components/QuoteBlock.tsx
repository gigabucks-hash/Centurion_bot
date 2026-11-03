import { useState } from "react";
import { core, type PickView } from "../api";
import { errorText, formatBps, formatLamportsOrDash, quoteState, useLang, useT } from "../i18n";
import { showAtaRent } from "@centurion/i18n/format.mjs";
import { useTerm } from "../state/store";
import { useServerNow } from "./SignalQueue";

/**
 * 1.1.4 quote on a buy proposal: est. network fee, total (max), max slippage, and the quote-expiry
 * countdown on the server clock. A stale/missing quote (or a 409 QUOTE_MISSING_OR_STALE from approve)
 * shows "refresh quote"; Real is blocked until refreshed, Practice is only warned (never blocked).
 */
export function useQuote(s: PickView) {
  useServerNow(1000);
  const skew = useTerm((x) => x.skewMs);
  const real = useTerm((x) => x.mode) !== "practice";
  const q = quoteState(s, skew, { mode: real ? "real" : "practice" });
  const stale = s.quote_stale || q.state !== "fresh";
  // contracts 1.1.5 / i18n 0.4.7+: Real is blocked until the quote is fresh AND complete (quote_id,
  // est_ata_rent_lamports, …), or after a 409 QUOTE_MISSING_OR_STALE. Practice is never blocked.
  return { ...q, stale: stale || (real && !q.complete), blocksApprove: q.blocksApprove || (real && s.quote_stale), real };
}

export function QuoteBlock({ s, compact }: { s: PickView; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const q = useQuote(s);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const paper = !q.real;
  const refresh = async () => {
    setBusy(true);
    setErr(null);
    try {
      await core.refreshQuote(s.id);
    } catch (e) {
      setErr(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const status = !q.stale
    ? <span className="num dim" title={q.ageS != null ? t("review.quote.updated_ago", { seconds: q.ageS }) : undefined}>{t("review.quote.expires_in", { seconds: q.expiresInS ?? 0 })}</span>
    : <span className={q.real ? "neg" : "warn"} role="status">{q.real ? t(q.state === "missing" && !s.quote_stale ? "review.quote.missing" : "review.quote.stale") : t("review.quote.practice_stale")}</span>;
  return (
    <div className={`quote${compact ? " compact" : ""}${q.stale ? " is-stale" : ""}`} data-quote={q.stale ? "stale" : "fresh"}>
      <span className="num" title={t("review.network_fee")}>{compact ? "fee " : `${t("review.network_fee")} `}{formatLamportsOrDash(s.est_network_fee_lamports, lang, { paper })}</span>
      {showAtaRent(s.est_ata_rent_lamports) && <span className="num" title={t("review.ata_rent")}>{compact ? "rent " : `${t("review.ata_rent")} `}{formatLamportsOrDash(s.est_ata_rent_lamports, lang, { paper })}</span>}
      <span className="num" title={t("review.total_max")}>{t("review.total_max")} {formatLamportsOrDash(s.total_max_lamports, lang, { paper })}</span>
      <span className="num" title={t("review.slippage")}>{compact ? "slip " : `${t("review.slippage")} `}{formatBps(s.max_slippage_bps, lang)}</span>
      {status}
      {q.stale && (
        <button className="ghost quote-refresh" disabled={busy} aria-busy={busy} onClick={(e) => { e.stopPropagation(); void refresh(); }}>
          {busy ? t("review.quote.refreshing") : t("review.quote.refresh")}
        </button>
      )}
      {err && <span className="neg">{err}</span>}
    </div>
  );
}
