"use client";
import { NOT_TRADEABLE, type TradeEvent } from "@/lib/types";
import { eventSignValue, pnlArrow, pnlTone, PNL_TEXT_CLASS } from "@/lib/pnl";
import { eventKindMeta } from "@/components/domain";
import { cn } from "@/components/ui";
import { useFmt, useT } from "@/lib/i18n/client";
import type { Fmt } from "@/lib/format";
import type { T } from "@/lib/i18n";

/**
 * Shared activity title (overview feed, /activity, coin-trail timeline).
 * Sells are toned by the sign of the % in the title (profit / loss / neutral token) and
 * always carry ▲/▼ + screen-reader text — never green for a loss, never colour-only.
 */
/** Localized headline from the UX catalog (feed.event.*), numbers formatted per locale/mode (QA-01). */
export const isNotTradeableEvent = (e: Pick<TradeEvent, "reasonCode">) => e.reasonCode === NOT_TRADEABLE;

export function eventHeadline(e: TradeEvent, t: T, f: Fmt): string {
  const coin = e.symbol ?? "";
  if (!coin) return e.message;
  // UNSUPPORTED_QUOTE_MINT: neutral "Not tradeable", never phrased as a guard failure.
  if (isNotTradeableEvent(e)) return `$${coin}`;
  switch (e.kind) {
    case "bought":
      return e.solAmount != null ? t.ux("feed.event.bought", { symbol: coin, amount_lamports: f.amount(e.solAmount) }) : e.message;
    case "sold": {
      const v = e.pctChange ?? null;
      if (v == null) return e.message;
      return t.ux("feed.event.sold", { symbol: coin, pnl: f.pct(v, 0) });
    }
    case "blocked":
      return t.ux("feed.event.blocked", { symbol: coin });
    case "expired":
      return t.ux("feed.event.expired", { symbol: coin });
    case "skipped":
      return t.ux("feed.event.skipped", { symbol: coin });
    default:
      return e.message;
  }
}

export function EventTitle({ e, className }: { e: TradeEvent; className?: string }) {
  const t = useT();
  const f = useFmt();
  const v = eventSignValue(e);
  const tone = v != null ? PNL_TEXT_CLASS[pnlTone(v)] : isNotTradeableEvent(e) ? "text-text-tertiary" : e.kind === "expired" ? "text-text-tertiary" : eventKindMeta[e.kind].text;
  const arrow = v != null ? pnlArrow(v) : "";
  return (
    <span className={cn(tone, className)} data-pnl-tone={v != null ? pnlTone(v) : undefined} data-not-tradeable={isNotTradeableEvent(e) || undefined}>
      {arrow && <span aria-hidden>{arrow} </span>}
      {v != null && <span className="sr-only">{pnlTone(v) === "loss" ? t("common.lossSr") : pnlTone(v) === "profit" ? t("common.profitSr") : ""}</span>}
      {eventHeadline(e, t, f)}
    </span>
  );
}
