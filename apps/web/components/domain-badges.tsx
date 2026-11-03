"use client";
import { Lock } from "lucide-react";
import type { ApprovalMode, ApprovalStatus, EventKind, RealLockedReason, StrategyStatus, TradingMode } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import { Badge, type Tone } from "@/components/ui";

/**
 * Per-strategy mode chip (contracts 1.1.6: wire practice|real, UI "Paper"/"Real"). Always text + glyph
 * (◇ Paper / ● Real), never colour alone.
 */
export function ModeBadge({ mode, className }: { mode: TradingMode; className?: string }) {
  const t = useT();
  return mode === "real" ? (
    <Badge tone="real" upper className={className}>● {t("mode.real")}</Badge>
  ) : (
    <Badge tone="practice" upper className={className}>◇ {t("mode.practice")}</Badge>
  );
}

const statusTone: Record<StrategyStatus, Tone> = { draft: "neutral", running: "profit", paused: "warning", archived: "neutral" };
/** "Real locked" chip (UX strategy.real_locked.chip / chip_short), lock icon + dashed border; reason as tooltip/a11y. */
export function RealLockedChip({ reason, short = false, className }: { reason: RealLockedReason | null; short?: boolean; className?: string }) {
  const t = useT();
  const why = t.ux(`strategy.real_locked_reason.${reason ?? "other"}` as never);
  return (
    <Badge className={`border-dashed ${className ?? ""}`} title={why} icon={<Lock size={11} aria-hidden />}>
      <span aria-label={t.ux("strategy.real_locked.a11y" as never, { reason: why })}>{t.ux(short ? "strategy.real_locked.chip_short" as never : "strategy.real_locked.chip" as never)}</span>
    </Badge>
  );
}

/** Mode chip + (when Real is locked) the locked chip, for strategy rows/cards and items that belong to a strategy. */
export function StrategyModeChips({ mode, realLocked, realLockedReason, short = false }: { mode: TradingMode; realLocked?: boolean; realLockedReason?: RealLockedReason | null; short?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <ModeBadge mode={mode} />
      {mode === "practice" && realLocked && <RealLockedChip reason={realLockedReason ?? null} short={short} />}
    </span>
  );
}

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
