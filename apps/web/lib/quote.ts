/**
 * Review-sheet quote state on top of @centurion/i18n format.mjs (0.4.6/0.4.7) helpers, for the contracts 1.1.4 wire.
 *
 * 0.4.7 `quoteState().complete` checks the 1.1.5 field set (quote_id, est_ata_rent_lamports, …). contracts in the repo
 * are still 1.1.4 (no quote_id), so a Real quote would never count as complete and approve would stay blocked.
 * Until 1.1.5 lands: when the quote has no quote_id we judge completeness on the 1.1.4 fields the server requires
 * (fee, min out, total, expiry) — the server's 409 QUOTE_MISSING_OR_STALE stays authoritative either way.
 * Hold reset key: quote_id (1.1.5, quoteChanged) → else quote_ts (1.1.4 re-quote) → else rev.
 */
import { quoteChanged, quoteState, type QuoteState } from "@centurion/i18n/format";
import type { Approval, ApprovalQuote } from "./types";

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

export function quoteWire(q: ApprovalQuote | undefined) {
  return {
    quote_id: q?.quoteId ?? null,
    est_network_fee_lamports: q?.networkFeeLamports ?? null,
    est_ata_rent_lamports: q?.ataRentLamports ?? null,
    min_out_raw: q?.minOutRaw ?? null,
    total_max_lamports: q?.totalMaxLamports ?? null,
    quote_ts: iso(q?.quoteTs),
    quote_expires_at: iso(q?.quoteExpiresAt),
  };
}

const V114_REQUIRED = ["est_network_fee_lamports", "min_out_raw", "total_max_lamports", "quote_expires_at"] as const;

export function reviewQuoteState(a: Pick<Approval, "quote" | "mode">, skewMs: number, localNowMs = Date.now()): QuoteState {
  const w = quoteWire(a.quote);
  const qs = quoteState(w, skewMs, { mode: a.mode, localNowMs });
  if (w.quote_id) return qs; // 1.1.5 wire: package rule as is
  const complete = V114_REQUIRED.every((k) => w[k] != null && w[k] !== "");
  return { ...qs, complete, blocksApprove: a.mode === "real" && (qs.state !== "fresh" || !complete) };
}

/** Identity of the quote the user is looking at; a change resets a Real hold and shows "Quote updated". */
export function quoteKey(a: Pick<Approval, "quote" | "rev">): string {
  return a.quote?.quoteId ?? (a.quote?.quoteTs ? `ts:${a.quote.quoteTs}` : `rev:${a.rev}`);
}

export function isQuoteChange(prev: Pick<Approval, "quote" | "rev">, next: Pick<Approval, "quote" | "rev">): boolean {
  if (next.quote?.quoteId) return quoteChanged({ quote_id: prev.quote?.quoteId ?? null }, { quote_id: next.quote.quoteId });
  return quoteKey(prev) !== quoteKey(next);
}
