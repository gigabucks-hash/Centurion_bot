"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { formatBps, formatLamportsOrDash, formatRawQty, formatRelativeSeconds } from "@centurion/i18n/format";
import type { Approval } from "@/lib/types";
import { clockSkewMs } from "@/lib/clock";
import { quoteKey, reviewQuoteState } from "@/lib/quote";
import { useFmt, useT } from "@/lib/i18n/client";
import { Button, cn } from "@/components/ui";
import { Dialog, HoldButton, useNow } from "@/components/ui/client";
import { ModeBadge } from "@/components/domain";
import { CoinAvatar } from "@/components/CoinAvatar";

const HOLD_REAL_MS = 2500;
const PRICE_MOVED_PCT = 1;
const UPDATED_INLINE_MS = 4000;

/**
 * Transaction review step (UX WF-22, contracts 1.1.4 quote fields; @centurion/i18n 0.4.6/0.4.7 review.quote.*).
 * - Rows: you pay, price, min received, network + priority fee, swap fee, max slippage, total (max). Formatting is the
 *   package's null-safe helpers (formatLamportsOrDash / formatBps / formatRawQty → "—"); freshness = quoteState on
 *   server time (lib/quote.ts adds the 1.1.4 completeness fallback).
 * - Fresh / expired / missing states with a "Refresh quote" CTA. Approve is blocked only in Real (server 409
 *   QUOTE_MISSING_OR_STALE); Practice shows practice_stale and stays approvable. A stale/missing quote is
 *   re-quoted automatically once per quote when the sheet opens (review.quote.auto_refreshing).
 * - proposal.updated is silent: the item merges in place, an inline "Quote updated" label shows briefly, and a Real
 *   hold in progress is reset (HoldButton keyed by the quote) with review.quote.changed_during_hold. The decision always
 *   carries the latest rev (expected_rev), so an older rev can't be approved.
 */
export function ReviewSheet({ a, busy, onClose, onApprove, onRefresh }: {
  a: Approval;
  busy: boolean;
  onClose: () => void;
  onApprove: (o: { holdMs?: number; reviewedRev: number; reviewedQuoteId?: string }) => void;
  onRefresh: () => Promise<void>;
}) {
  const t = useT();
  const f = useFmt();
  const now = useNow(1000);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [auto, setAuto] = useState(false);
  const [holding, setHolding] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [holdReset, setHoldReset] = useState(false);
  const autoTried = useRef<string | null>(null);
  const q = a.quote;
  const real = a.mode === "real";
  const qs = reviewQuoteState(a, clockSkewMs());
  const key = quoteKey(a);
  const sym = a.symbol ? `$${a.symbol}` : a.title;
  const moved = q?.priceSol && q.pickPriceSol ? (Number(q.priceSol) / Number(q.pickPriceSol) - 1) * 100 : 0;

  // Silent proposal.updated: a new quote on the same item (props change) → inline "Quote updated", never a toast; a
  // Real hold in progress is reset (HoldButton remounts on the new key). Derived during render (no effect).
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setUpdatedAt(now ?? 0);
    if (holding) setHoldReset(true);
    setHolding(false);
  }

  async function refresh(isAuto = false) {
    setRefreshing(true);
    setAuto(isAuto);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setAuto(false);
    }
  }

  // Auto re-quote once per quote when the sheet shows a stale/missing quote (avoids "expired" on open).
  useEffect(() => {
    if (qs.state !== "fresh" && !refreshing && autoTried.current !== key) {
      autoTried.current = key;
      void refresh(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs.state, key]);

  const showUpdated = updatedAt != null && now != null && now - updatedAt < UPDATED_INLINE_MS;
  const lam = (v?: string) => formatLamportsOrDash(v ?? null, f.locale, { paper: !real });
  const rows: [string, string, boolean?][] = [
    [t.ux("review.you_pay"), a.amountSol != null ? f.sol(a.amountSol) : "—", true],
    [t.ux("review.price"), q?.priceSol ? `${f.solVar(q.priceSol)} / ${a.symbol ?? ""}` : "—"],
    [t.ux("review.min_received"), q?.minOutRaw ? t.ux("review.min_received_value", { min_out: formatRawQty(q.minOutRaw, q.decimals, f.locale), symbol: a.symbol ?? "" }) : "—", true],
    [t.ux("review.network_fee"), lam(q?.networkFeeLamports)],
    [t.ux("review.priority_fee"), lam(q?.priorityFeeLamports)],
    ...(q?.ataRentLamports && BigInt(q.ataRentLamports) > 0n ? ([[t.ux("review.ata_rent"), lam(q.ataRentLamports)]] as [string, string][]) : []),
    [t.ux("review.swap_fee"), formatBps(q?.swapFeeBps ?? null, f.locale)],
    [t.ux("review.slippage"), formatBps(q?.maxSlippageBps ?? null, f.locale)],
    [t.ux("review.total_max"), lam(q?.totalMaxLamports), true],
  ];

  const status =
    refreshing && auto ? t.ux("review.quote.auto_refreshing")
    : qs.state === "missing" ? t.ux("review.quote.missing")
    : qs.state === "stale" ? t.ux(real ? "review.quote.stale" : "review.quote.practice_stale")
    : real && !qs.complete ? t.ux("review.quote.loading")
    : null;

  return (
    <Dialog open onClose={onClose} accent={real ? "real" : "practice"} initialFocusRef={cancelRef} title={<span className="flex flex-wrap items-center gap-2">{a.mint && <CoinAvatar mint={a.mint} logoHash={a.logoHash} symbol={a.symbol} />}{t.ux("review.title", { side: "buy" })} · {sym} <ModeBadge mode={a.mode} /></span>}>
      <div data-testid="review-sheet" data-quote-state={qs.state} data-quote-key={key}>
        {holdReset && (
          <p role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-semantic-warning/60 bg-semantic-warningContainer px-3 py-2 text-caption text-text-primary" data-testid="hold-reset">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-semantic-warning" aria-hidden />
            <span className="flex-1">{t.ux("review.quote.changed_during_hold")}</span>
            <button type="button" className="min-h-11 shrink-0 text-brand-primary underline" onClick={() => setHoldReset(false)}>{t("common.dismiss")}</button>
          </p>
        )}
        {moved > PRICE_MOVED_PCT && <p className="mb-3 rounded-md bg-semantic-warningContainer px-3 py-2 text-caption text-text-primary">{t.ux("review.price_moved", { pct: f.pct(moved) })}</p>}
        <dl className="divide-y divide-border-subtle rounded-md border border-border-subtle">
          {rows.map(([k, v, strong]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-caption text-text-secondary">{k}</dt>
              <dd className={cn("num text-right", strong ? "text-titleSm text-text-primary" : "text-body text-text-primary", strong && real && "text-mode-real")}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className={cn("mt-3 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-caption", !status ? "bg-bg-sunken text-text-secondary" : real ? "bg-semantic-lossContainer text-semantic-loss" : "bg-semantic-warningContainer text-text-primary")} data-testid="quote-status">
          <span className="flex-1" aria-live="polite">
            {status ?? (
              <>
                <span title={t.ux("review.quote.updated_ago", { seconds: qs.ageS ?? 0 })}>{formatRelativeSeconds(-(qs.ageS ?? 0), f.locale)}</span>
                {" · "}
                {t.ux("review.quote.expires_in", { seconds: qs.expiresInS ?? 0 })}
              </>
            )}
            {showUpdated && (
              <span className="ml-2 inline-flex items-center gap-1 text-semantic-profit" data-testid="quote-updated">
                <Check size={12} aria-hidden /> {t.ux("review.quote.updated_inline")}
              </span>
            )}
          </span>
          <Button size="sm" variant={status && real ? "primary" : "ghost"} className="min-h-11" loading={refreshing} onClick={() => refresh(false)}>
            <RefreshCw size={14} aria-hidden /> {refreshing ? t.ux("review.quote.refreshing") : t.ux("review.quote.refresh")}
          </Button>
        </div>
        <p className="mt-2 text-caption text-text-tertiary">{q?.quoteTs ? t.ux("review.estimate_note", { time: f.time(q.quoteTs) }) : null} {t.ux(real ? "review.real_note" : "review.practice_note")}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {real ? (
            <HoldButton key={key} durationMs={HOLD_REAL_MS} variant="real" disabled={busy || qs.blocksApprove || refreshing} onHoldChange={setHolding} onConfirm={(holdMs) => onApprove({ holdMs, reviewedRev: a.rev, reviewedQuoteId: q?.quoteId })} hint={t("common.holdSeconds", { s: HOLD_REAL_MS / 1000 })}>
              {t("approvals.holdApprove", { amount_lamports: f.amount(a.amountSol ?? 0) })}
            </HoldButton>
          ) : (
            <Button variant="success" size="lg" className="min-h-12" disabled={busy} onClick={() => onApprove({ reviewedRev: a.rev, reviewedQuoteId: q?.quoteId })} data-testid="review-approve">
              {t("approvals.approve")} · {a.amountSol != null ? f.sol(a.amountSol) : sym}
            </Button>
          )}
          <Button ref={cancelRef} variant="secondary" size="lg" className="min-h-12" onClick={onClose}>{t("common.cancelEsc")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
