"use client";
import { useFmt } from "@/lib/i18n/client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import type { TradingMode } from "@/lib/types";
import { switchMode } from "@/lib/client";

import { Button, cn } from "@/components/ui";
import { Dialog, HoldButton, useToast } from "@/components/ui/client";
import { useT } from "@/lib/i18n/client";

/**
 * Explicit mode switch (never a bare toggle). To Real: dialog + 2.5 s hold.
 * To Practice: immediate + toast (flows/mode-switch.mmd).
 */
export function ModeSwitch({ mode, summary }: { mode: TradingMode; summary: { cashSol: number; lossStopPct: number; runningStrategies: number; walletConnected: boolean } }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const f = useFmt();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  async function go(target: TradingMode, holdMs = 0) {
    setBusy(true);
    try {
      await switchMode(target, holdMs);
      setOpen(false);
      toast({ kind: target === "practice" ? "info" : "warning", text: t(target === "practice" ? "mode.backPractice" : "mode.nowReal") });
      router.refresh();
    } catch (e) {
      toast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const seg = (m: TradingMode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === m}
      onClick={() => (m === mode ? undefined : m === "real" ? setOpen(true) : go("practice"))}
      className={cn(
        "h-8 rounded-full px-3 text-label font-semibold transition duration-fast sm:px-4",
        mode === m ? (m === "practice" ? "bg-mode-practice text-mode-onPractice" : "bg-mode-real text-mode-onReal") : "text-text-secondary hover:text-text-primary",
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <div role="radiogroup" aria-label={t("mode.switchLabel")} className="inline-flex rounded-full border border-border-default bg-bg-raised p-0.5">
        {seg("practice", t("mode.practiceShort"))}
        {seg("real", t("mode.realShort"))}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("mode.switchTitle")} accent="real" initialFocusRef={cancelRef}>
        <p className="text-body text-text-secondary">{t("mode.switchBody")}</p>
        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-md bg-bg-sunken p-3 text-caption">
          <div><dt className="text-text-tertiary">{t("mode.realBalance")}</dt><dd className="num text-numSm text-text-primary">{summary.walletConnected ? f.sol(summary.cashSol) : t("mode.balanceMock")}</dd></div>
          <div><dt className="text-text-tertiary">{t("mode.lossStop")}</dt><dd className="num text-numSm text-text-primary">{summary.lossStopPct}%</dd></div>
          <div><dt className="text-text-tertiary">{t("mode.walletTwoFa")}</dt><dd className="text-text-primary">{summary.walletConnected ? t("mode.ready") : t("mode.setupSkipped")}</dd></div>
        </dl>
        {!summary.walletConnected && (
          <p className="mt-3 flex items-start gap-2 text-caption text-semantic-warning">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" /> {t("mode.wizardNote")}
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <HoldButton durationMs={2500} onConfirm={(ms) => go("real", ms)} disabled={busy} hint={t("mode.holdHint")}>
            {t("mode.holdToSwitch")}
          </HoldButton>
          <Button ref={cancelRef} variant="primary" size="lg" onClick={() => setOpen(false)}>
            {t("mode.stayPractice")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
