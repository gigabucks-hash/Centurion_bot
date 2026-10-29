import { useEffect, useState } from "react";
import type { PickView } from "../api";
import { useLang, useT, solText } from "../i18n";
import { serverNow, useTerm } from "../state/store";
import { fmtMmSs, fmtPriceDec, fmtUsdLocale, shortMint } from "./format";
import { NtChip, NtDetail } from "./NotTradeable";

interface Props {
  signals: PickView[]; // already pending + sorted soonest-expiry first
  cursorMint: string | null;
  selectedIds?: Set<string>;
  compactActions?: boolean;
  onCursor: (mint: string) => void;
  /** Keyboard focus landed on a row (roving tabindex) — moves the cursor, no quick-look. */
  onFocusRow?: (mint: string) => void;
  onToggleSelect?: (id: string) => void;
  onApprove: (s: PickView) => void;
  onSkip: (s: PickView) => void;
  onOpenChart?: (mint: string) => void;
}

/** Ticking *server-clock* now: countdowns use `expires_at − (local_now + skew)` (contract §2). */
export function useServerNow(ms = 500) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const URGENT_MS = 2 * 60_000; // UX: < 2 min → red + icon

export function SignalQueue(p: Props) {
  const now = useServerNow();
  const t = useT();
  const lang = useLang();
  const paper = useTerm((s) => s.mode) === "practice";
  if (!p.signals.length) return <div className="empty">{t("desktop.queue.empty")}</div>;
  return (
    <div role="list">
      {p.signals.map((s) => {
        const left = Math.max(0, s.expires_at_ms - now);
        const pct = (left / Math.max(1, s.expires_at_ms - s.created_at_ms)) * 100;
        const urgent = left < URGENT_MS;
        const fit = s.score != null && s.score_threshold != null;
        // WF-20: not tradeable (no SOL pair) → dimmed card, neutral chip, Approve disabled + labelled.
        const nt = s.tradeable === false;
        return (
          <div
            key={s.id}
            className={`signal ${s.mint === p.cursorMint ? "cursor" : ""}${nt ? " nt-row" : ""}`}
            data-tradeable={String(!nt)}
            onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input")) p.onCursor(s.mint); }}
            onFocus={(e) => e.target === e.currentTarget && p.onFocusRow?.(s.mint)}
            role="listitem"
            tabIndex={s.mint === p.cursorMint ? 0 : -1}
            data-row="signal"
            data-mint={s.mint}
            aria-current={s.mint === p.cursorMint || undefined}
          >
            <div className="row">
              {p.onToggleSelect && (
                <input
                  type="checkbox"
                  className="sel"
                  aria-label="Pilih (X)"
                  disabled={nt}
                  checked={!nt && (p.selectedIds?.has(s.id) ?? false)}
                  onChange={() => p.onToggleSelect!(s.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              {/* symbol/name are untrusted token metadata: rendered as plain text only */}
              <strong>{s.symbol}</strong>
              <span className="mono dim">{shortMint(s.mint)}</span>
              {nt ? <NtChip /> : <span className="chip">{s.first_buy ? t("queue.pick.kind.first_buy") : t("queue.pick.kind.buy")}</span>}
              {fit && (
                <span className={`num ${nt ? "dim" : s.score! >= s.score_threshold! ? "pos" : "neg"}`} style={{ marginLeft: "auto" }} title="score / score_threshold">
                  {s.score}/{s.score_threshold}
                </span>
              )}
            </div>
            <div className="row meta num">
              <span>{solText(s.amount_lamports, lang, paper)}</span>
              <span>px {fmtPriceDec(s.price_sol)} SOL</span>
              <span>liq {s.liquidity_usd != null ? fmtUsdLocale(s.liquidity_usd, lang) : "—"}</span>
              {s.guard_verdict && <span>guard {s.guard_verdict}</span>}
            </div>
            <div className="meta">{s.strategy} · {s.reasons.join(" · ") || s.summary}</div>
            {nt && <NtDetail trade={s} />}
            <div className={`bar ${urgent ? "urgent" : ""}`}><i style={{ width: `${pct}%` }} /></div>
            <div className="actions">
              {nt ? (
                <button className="cta-disabled" disabled aria-disabled="true" data-action="approve">{t("queue.pick.cannot_approve")}</button>
              ) : (
                <button className="success" data-action="approve" onClick={(e) => { e.stopPropagation(); p.onApprove(s); }}>{t("queue.pick.approve")}<kbd>A</kbd></button>
              )}
              {/* Skip stays available: rejecting a pick is not a trade, it only clears the queue. */}
              <button className="ghost" onClick={(e) => { e.stopPropagation(); p.onSkip(s); }}>{t("queue.pick.skip")}<kbd>S</kbd></button>
              {!p.compactActions && p.onOpenChart && (
                <button className="ghost" onClick={(e) => { e.stopPropagation(); p.onOpenChart!(s.mint); }} title="Buka chart di window terpisah">
                  ⧉ Chart<kbd>↵</kbd>
                </button>
              )}
              <span className={`num ${urgent ? "neg" : "dim"}`} style={{ marginLeft: "auto" }} aria-label="Sisa waktu (jam server)">
                {urgent ? "⏱ " : ""}{fmtMmSs(left)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
