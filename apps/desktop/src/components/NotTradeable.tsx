import type { Tradeability } from "../api";
import { useT } from "../i18n";

/**
 * WF-20 neutral/disabled chip: text.tertiary on surface.sunken, dashed outline, ⊘ icon.
 * Never loss-red — "not tradeable" is a product limit, not a risk.
 */
export function NtChip({ title, compact = false }: { title?: string; compact?: boolean }) {
  const t = useT();
  const label = t("screener.not_tradeable.badge");
  // compact (dense tables): icon only, label kept for AT + hover; the row's disabled CTA spells it out.
  return (
    <span className={`chip nt${compact ? " compact" : ""}`} title={title ?? (compact ? label : undefined)}>
      <span aria-hidden>⊘</span>{compact ? <span className="sr-only">{label}</span> : <> {label}</>}
    </span>
  );
}

/** ⓘ box with the reason up front (WF-20 note 3): the reason is text, never tooltip-only. */
export function NtDetail({ trade, kind = "approve" }: { trade: Tradeability; kind?: "approve" | "sell" }) {
  const t = useT();
  const reason = trade.reason_code ?? "UNSUPPORTED_QUOTE_MINT";
  return (
    <div className="nt-info" role="note">
      <span aria-hidden>ⓘ </span>
      {kind === "sell" ? t("positions.sell.not_tradeable_detail") : reason === "UNSUPPORTED_QUOTE_MINT" ? t("screener.not_tradeable.detail") : t(`order.fail_reason.${reason.toLowerCase()}`, undefined, "order.fail_reason.unknown")}
    </div>
  );
}

/** Mirrors the Rust check (`Engine::check_tradeable`): unknown → tradeable. */
export const isBlocked = (x: Partial<Tradeability> | null | undefined) => x?.tradeable === false;
