"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { Wordmark } from "./Wordmark";

const KEY = "centurion.onboarded.v1";
const SYNC = "centurion-onboard-sync";
const STEPS = ["s1", "s2", "s3"] as const;

function seen(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function openOnboarding() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  delete document.documentElement.dataset.onboarded;
  window.dispatchEvent(new Event(SYNC));
}

/** First-run card. Shown until this browser stores the flag. */
export function Onboarding() {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only available after mount
    if (seen()) setOpen(false);
    const reset = () => { setStep(0); setOpen(!seen()); };
    window.addEventListener(SYNC, reset);
    return () => window.removeEventListener(SYNC, reset);
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("[data-onboard-next]")?.focus();
  }, [open, step]);

  function finish() {
    try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ }
    document.documentElement.dataset.onboarded = "1";
    window.dispatchEvent(new Event(SYNC));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;
  const id = STEPS[step] ?? "s1";
  const last = step === STEPS.length - 1;

  return (
    <div data-onboard-root className="fixed inset-0 z-50 grid place-items-center overscroll-contain p-4" role="presentation">
      <button type="button" className="absolute inset-0 bg-scrim-sheet" aria-label={t("onboard.close")} onClick={finish} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="relative w-full max-w-md overscroll-contain rounded-lg border border-border-default bg-bg-overlay p-5 shadow-dialog"
      >
        <Wordmark mark={28} />
        <p className="mt-4 text-caption text-text-tertiary">{t("onboard.step", { n: step + 1, total: STEPS.length })}</p>
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
