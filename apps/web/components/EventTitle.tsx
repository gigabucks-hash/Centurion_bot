"use client";
import type { TradeEvent } from "@/lib/types";
import { eventSignValue, pnlArrow, pnlTone, PNL_TEXT_CLASS } from "@/lib/pnl";
import { eventKindMeta } from "@/components/domain";
import { cn } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

/**
 * Shared activity title (overview feed, /activity, coin-trail timeline).
 * Sells are toned by the sign of the % in the title (profit / loss / neutral token) and
 * always carry ▲/▼ + screen-reader text — never green for a loss, never colour-only.
 */
export function EventTitle({ e, className }: { e: TradeEvent; className?: string }) {
  const t = useT();
  const v = eventSignValue(e);
  const tone = v != null ? PNL_TEXT_CLASS[pnlTone(v)] : e.kind === "expired" ? "text-text-tertiary" : eventKindMeta[e.kind].text;
  const arrow = v != null ? pnlArrow(v) : "";
  return (
    <span className={cn(tone, className)} data-pnl-tone={v != null ? pnlTone(v) : undefined}>
      {arrow && <span aria-hidden>{arrow} </span>}
      {v != null && <span className="sr-only">{pnlTone(v) === "loss" ? t("common.lossSr") : pnlTone(v) === "profit" ? t("common.profitSr") : ""}</span>}
      {e.message}
    </span>
  );
}
