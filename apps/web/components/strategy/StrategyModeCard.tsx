"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import type { Strategy, TradingMode } from "@/lib/types";
import { setStrategyModeClient } from "@/lib/client";
import { ApiError, errorText } from "@/lib/errors";
import { Button, Card, cn } from "@/components/ui";
import { Dialog, HoldButton, useToast } from "@/components/ui/client";
import { ModeBadge, RealLockedChip } from "@/components/domain";
import { useT } from "@/lib/i18n/client";

/** Real switch hold (same as every Real confirmation). */
export const REAL_SWITCH_HOLD_MS = 2500;

/**
 * Per-strategy Paper / Real selector (replaces the retired global workspace toggle; contracts 1.1.6).
 * Same pill style as the old top-bar switch (current visuals kept; G1-blue v2 ModeSelector cards not applied).
 * - Real is offered only when the server says `real_locked: false`; while locked the Real option is aria-disabled with
 *   the lock reason, the explanation and the Paper track record (`paper_progress`, "not set" when a rule is null).
 * - To Real: dialog + 2.5 s hold (explicit, never a bare toggle). To Paper: immediate + toast.
 * - 403 MODE_NOT_ALLOWED ("strategy not approved for Real") and 409 rev conflicts are shown inline and refresh the page.
 */
export function StrategyModeCard({ strategy, modeSwitchAvailable = true }: { strategy: Pick<Strategy, "id" | "name" | "mode" | "rev" | "realLocked" | "realLockedReason" | "paperProgress" | "status">; modeSwitchAvailable?: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { mode, realLocked, paperProgress: p } = strategy;
  const reason = t.ux(`strategy.real_locked_reason.${strategy.realLockedReason ?? "other"}` as never);
  // No contract route exists to change a strategy's mode yet: in http mode the mock mutation is never used.
  const switchBlocked = !modeSwitchAvailable;
  const realDisabled = realLocked || strategy.status === "archived" || switchBlocked;

  async function go(target: TradingMode, holdMs = 0) {
    if (switchBlocked) return;
    setBusy(true);
    setErr(null);
    try {
      await setStrategyModeClient(strategy.id, target, strategy.rev, holdMs);
      setOpen(false);
      toast({ kind: target === "practice" ? "info" : "warning", text: target === "practice" ? t("strategyMode.backToPaper") : t("strategyMode.nowReal", { name: strategy.name }) });
      router.refresh();
    } catch (e) {
      setErr(errorText(t, e));
      if (e instanceof ApiError && (e.code === "MODE_NOT_ALLOWED" || e.code === "STRATEGY_REV_CONFLICT")) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const seg = (m: TradingMode, label: string) => {
    const disabled = m === "real" && mode !== "real" && realDisabled;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={mode === m}
        aria-disabled={disabled || switchBlocked || undefined}
        aria-label={disabled ? t.ux("strategy.real_locked.a11y", { reason }) : switchBlocked ? t("strategyMode.modeEndpointMissing") : undefined}
        title={disabled ? reason : switchBlocked ? t("strategyMode.modeEndpointMissing") : undefined}
        onClick={() => (switchBlocked || m === mode || disabled || busy ? undefined : m === "real" ? setOpen(true) : go("practice"))}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full px-3 text-label font-semibold transition duration-fast sm:px-4",
          mode === m ? (m === "practice" ? "bg-mode-practice text-mode-onPractice" : "bg-mode-real text-mode-onReal") : disabled || switchBlocked ? "cursor-not-allowed text-text-tertiary" : "text-text-secondary hover:text-text-primary",
        )}
      >
        {disabled && <Lock size={12} aria-hidden />}
        {label}
      </button>
    );
  };

  const axis = (done: number, required: number | null, progressKey: "strategy.real_gate.progress_days" | "strategy.real_gate.progress_trades", doneKey: "strategy.real_gate.days_done" | "strategy.real_gate.trades_done", vars: Record<string, number>) =>
    required == null ? (
      <li className="flex flex-wrap items-baseline gap-x-2">
        <span className="num text-text-primary">{t.ux(doneKey, vars)}</span>
        <span className="text-text-tertiary">{t.ux("strategy.real_gate.not_set")}</span>
      </li>
    ) : (
      <li>
        <span className="num text-text-primary">{t.ux(progressKey, vars)}</span>
        <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-bg-sunken">
          <span className="block h-full bg-mode-practice" style={{ width: `${Math.min(100, required > 0 ? (done / required) * 100 : 100)}%` }} />
        </span>
      </li>
    );

  return (
    <Card title={<span className="flex flex-wrap items-center gap-2">{t.ux("strategy.mode.label")} <ModeBadge mode={mode} />{mode === "practice" && realLocked && <RealLockedChip reason={strategy.realLockedReason} />}</span>} className="mb-4">
      <div className="flex flex-wrap items-start gap-4">
        <div role="radiogroup" aria-label={t.ux("strategy.mode.label")} className="inline-flex rounded-full border border-border-default bg-bg-raised p-0.5">
          {seg("practice", t.ux("strategy.mode.paper"))}
          {seg("real", t.ux("strategy.mode.real"))}
        </div>
        <div className="min-w-0 flex-1 text-caption text-text-secondary">
          {mode === "practice" ? <p>{t.ux("strategy.mode.paper_desc")}</p> : <p>{t("strategyMode.realRules")}</p>}
          {switchBlocked && <p role="note" className="mt-2 text-caption text-semantic-warning">{t("strategyMode.modeEndpointMissing")}</p>}
          {mode === "practice" && realLocked && (
            <>
              <p className="mt-1">{t.ux("strategy.real_locked.explain")}</p>
              <p className="mt-2 text-label text-text-primary">{t("strategyMode.progress")}</p>
              {/* UX v2.6: a null *_required = rule not set → "{n} days in Paper" + "Rule not set yet", no divisor, no bar. */}
              <ul className="mt-1 grid gap-2 sm:grid-cols-2" data-testid="paper-progress">
                {axis(p.days_done, p.days_required, "strategy.real_gate.progress_days", "strategy.real_gate.days_done", { days_done: p.days_done, days_required: p.days_required ?? 0 })}
                {axis(p.trades_done, p.trades_required, "strategy.real_gate.progress_trades", "strategy.real_gate.trades_done", { trades_done: p.trades_done, trades_required: p.trades_required ?? 0 })}
              </ul>
            </>
          )}
          <p className="mt-2 text-text-tertiary">{t.ux("strategy.mode.scope_note")}</p>
          {err && <p role="alert" className="mt-2 text-semantic-loss">{err}</p>}
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("strategyMode.toRealTitle", { name: strategy.name })} accent="real" initialFocusRef={cancelRef}>
        <p className="text-body text-text-secondary">{t("strategyMode.toRealBody")}</p>
        <p className="mt-3 text-caption text-text-secondary">{t("strategyMode.realRules")}</p>
        {modeSwitchAvailable && <p className="mt-3 text-caption text-semantic-warning">{t("strategyMode.mockNote")}</p>}
        {err && <p role="alert" className="mt-2 text-caption text-semantic-loss">{err}</p>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <HoldButton durationMs={REAL_SWITCH_HOLD_MS} onConfirm={(ms) => go("real", ms)} disabled={busy} hint={t("mode.holdHint")}>
            {t("strategyMode.holdToReal")}
          </HoldButton>
          <Button ref={cancelRef} variant="primary" size="lg" onClick={() => setOpen(false)}>
            {t("strategyMode.stayPaper")}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
