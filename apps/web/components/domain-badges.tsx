"use client";
import type { ApprovalMode, ApprovalStatus, EventKind, StrategyStatus, TradingMode } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import { Badge, type Tone } from "@/components/ui";

/** Mode label always carries text + glyph (◇ practice / ● real), never colour alone. */
export function ModeBadge({ mode, className }: { mode: TradingMode; className?: string }) {
  const t = useT();
  return mode === "real" ? (
    <Badge tone="real" upper className={className}>● {t("mode.real")}</Badge>
  ) : (
    <Badge tone="practice" upper className={className}>◇ {t("mode.practice")}</Badge>
  );
}

const statusTone: Record<StrategyStatus, Tone> = { draft: "neutral", running: "profit", paused: "warning", stopped: "loss", archived: "neutral" };
export function StatusBadge({ status }: { status: StrategyStatus }) {
  const t = useT();
  return <Badge tone={statusTone[status]}>{t(`status.${status}`)}</Badge>;
}

export function ApprovalModeText({ mode }: { mode: ApprovalMode }) {
  const t = useT();
  return <span className="text-caption text-text-secondary">{t(`approvalMode.${mode}`)}</span>;
}

/** Per-strategy ask-before-buy setting as a compact badge (strategy cards / tables). */
export function ApprovalModeBadge({ mode }: { mode: ApprovalMode }) {
  const t = useT();
  const label = mode === "ask_first_buy" ? t("approvalMode.firstBuyBadge") : mode === "ask_every_buy" ? t("approvalMode.everyBuyBadge") : t("approvalMode.autoBadge");
  return (
    <Badge tone={mode === "off" ? "neutral" : "brand"} title={t(`approvalMode.${mode}`)}>
      {mode === "off" ? "⚡" : "✋"} {label}
    </Badge>
  );
}

const approvalTone: Record<ApprovalStatus, Tone> = {
  pending: "warning", approved: "brand", executing: "info", filled: "profit", failed: "loss", rejected: "neutral", expired: "neutral",
};
export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const t = useT();
  return <Badge tone={approvalTone[status]} upper>{t(`approvalStatus.${status}`)}</Badge>;
}

const kindTone: Record<EventKind, Tone> = {
  found: "neutral", passed: "info", blocked: "guard", armed: "brand", expired: "neutral", proposal: "warning", approved: "profit", skipped: "neutral", bought: "profit", sold: "info",
};
export function EventKindBadge({ kind }: { kind: EventKind }) {
  const t = useT();
  return <Badge tone={kindTone[kind]} upper>{t(`kind.${kind}`)}</Badge>;
}
