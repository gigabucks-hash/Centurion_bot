"use client";
import { Lock } from "lucide-react";
import type { ApprovalMode, ApprovalStatus, EventKind, RealLockedReason, StrategyStatus, TradingMode } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import { Badge, cn, type Tone } from "@/components/ui";

/** Per-strategy mode: a word plus a dot. The page banner is the workspace-level indicator. */
export function ModeBadge({ mode, className }: { mode: TradingMode; className?: string }) {
  const t = useT();
  const real = mode === "real";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-caption", real ? "text-semantic-loss" : "text-text-secondary", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", real ? "bg-semantic-loss" : "bg-text-tertiary")} aria-hidden />
      {real ? t("mode.real") : t("mode.practice")}
    </span>
  );
}

const statusDot: Record<StrategyStatus, string> = {
  draft: "bg-text-disabled",
  running: "bg-semantic-profit",
  paused: "bg-semantic-warning",
  archived: "bg-text-tertiary",
};

/** "Real locked": a lock, with the reason as the tooltip. The word is hidden in dense tables. */
export function RealLockedChip({ reason, short = false, className }: { reason: RealLockedReason | null; short?: boolean; className?: string }) {
  const t = useT();
  const why = t.ux(`strategy.real_locked_reason.${reason ?? "other"}` as never);
  const label = t.ux(short ? "strategy.real_locked.chip_short" as never : "strategy.real_locked.chip" as never);
  if (short) return <span className="sr-only">{label}. {why}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 text-caption text-text-tertiary", className)} title={why}>
      <Lock size={12} strokeWidth={1.75} aria-hidden />
      <span className={short ? "sr-only" : undefined} aria-label={t.ux("strategy.real_locked.a11y" as never, { reason: why })}>{label}</span>
    </span>
  );
}

/** Mode word + lock (when Real is gated) for strategy rows and cards. */
export function StrategyModeChips({ mode, realLocked, realLockedReason, short = false }: { mode: TradingMode; realLocked?: boolean; realLockedReason?: RealLockedReason | null; short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <ModeBadge mode={mode} />
      {mode === "practice" && realLocked && <RealLockedChip reason={realLockedReason ?? null} short={short} />}
    </span>
  );
}

export function StatusBadge({ status }: { status: StrategyStatus }) {
  const t = useT();
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-caption text-text-primary">
      <span className={cn("h-1.5 w-1.5 rounded-full", statusDot[status])} aria-hidden />
      {t(`status.${status}`)}
    </span>
  );
}

export function ApprovalModeText({ mode }: { mode: ApprovalMode }) {
  const t = useT();
  return <span className="text-caption text-text-secondary">{t(`approvalMode.${mode}`)}</span>;
}

/** Ask-before-buy setting as plain text. The title carries the full phrase. */
export function ApprovalModeBadge({ mode }: { mode: ApprovalMode }) {
  const t = useT();
  const label = mode === "ask_first_buy" ? t("approvalMode.firstBuyBadge") : mode === "ask_every_buy" ? t("approvalMode.everyBuyBadge") : t("approvalMode.autoBadge");
  return (
    <span className="whitespace-nowrap text-caption text-text-secondary" title={t(`approvalMode.${mode}`)}>
      {label}
    </span>
  );
}

const approvalTone: Record<ApprovalStatus, Tone> = {
  pending: "warning", approved: "brand", executing: "info", filled: "profit", failed: "loss", rejected: "neutral", expired: "neutral",
};
export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const t = useT();
  return <Badge tone={approvalTone[status]}>{t(`approvalStatus.${status}`)}</Badge>;
}

const kindTone: Record<EventKind, Tone> = {
  found: "neutral", passed: "info", blocked: "guard", armed: "brand", expired: "neutral", proposal: "warning", approved: "profit", skipped: "neutral", bought: "profit", sold: "info",
};
export function EventKindBadge({ kind }: { kind: EventKind }) {
  const t = useT();
  return <Badge tone={kindTone[kind]}>{t(`kind.${kind}`)}</Badge>;
}
