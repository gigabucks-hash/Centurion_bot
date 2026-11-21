"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

const KEY = "centurion.onboarded.v1";
const OPEN = "centurion-onboarding";
const STEPS = ["s1", "s2", "s3"] as const;

export function openOnboarding() {
  window.dispatchEvent(new Event(OPEN));
}

/** First-run card. Paper stays the default. Real and agents stay off until Settings. */
export function Onboarding() {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch { seen = false; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hide only after reading localStorage on the client
    if (seen) setOpen(false);
    const show = () => { setStep(0); setOpen(true); };
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("[data-onboard-next]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  function finish() {
    try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ }
    setOpen(false);
  }

  if (!open) return null;
  const id = STEPS[step] ?? "s1";
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <button type="button" className="absolute inset-0 bg-scrim-sheet" aria-label={t("onboard.close")} onClick={finish} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-md rounded-lg border border-border-default bg-bg-overlay p-5 shadow-dialog">
        <p className="text-caption text-text-tertiary">{t("onboard.step", { n: step + 1, total: STEPS.length })}</p>
        <h2 id={titleId} className="mt-1 text-titleSm text-text-primary">{t(`onboard.${id}title` as "onboard.s1title")}</h2>
        <p className="mt-2 text-body text-text-secondary">{t(`onboard.${id}body` as "onboard.s1body")}</p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0}>{t("onboard.back")}</Button>
          <Button type="button" variant="primary" data-onboard-next onClick={() => (last ? finish() : setStep((n) => n + 1))}>
            {last ? t("onboard.done") : t("onboard.next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
