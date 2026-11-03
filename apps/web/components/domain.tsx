/** Domain-aware presentational helpers shared across pages. */
import type { AlertSeverity, EventKind } from "@/lib/types";
import type { Tone } from "@/components/ui";

export { ApprovalModeBadge, ApprovalModeText, ApprovalStatusBadge, EventKindBadge, ModeBadge, RealLockedChip, StatusBadge, StrategyModeChips } from "./domain-badges";

export const severityTone: Record<AlertSeverity, Tone> = { info: "info", warning: "warning", critical: "loss" };

/** Feed kinds per SPEC §4 with a semantic tone and timeline-dot colour. Labels: t(`kind.${kind}`). */
export const eventKindMeta: Record<EventKind, { tone: Tone; dot: string; text: string }> = {
  found: { tone: "neutral", dot: "bg-text-tertiary", text: "text-text-primary" },
  passed: { tone: "info", dot: "bg-semantic-info", text: "text-text-primary" },
  blocked: { tone: "guard", dot: "bg-semantic-guard", text: "text-text-primary" },
  armed: { tone: "brand", dot: "bg-brand-primary", text: "text-text-primary" },
  expired: { tone: "neutral", dot: "bg-text-disabled", text: "text-text-tertiary" },
  proposal: { tone: "warning", dot: "bg-semantic-warning", text: "text-text-primary" },
  approved: { tone: "profit", dot: "bg-semantic-profit", text: "text-text-primary" },
  skipped: { tone: "neutral", dot: "bg-text-tertiary", text: "text-text-primary" },
  bought: { tone: "profit", dot: "bg-semantic-profit", text: "text-text-primary" },
  sold: { tone: "info", dot: "bg-semantic-info", text: "text-text-primary" },
};
