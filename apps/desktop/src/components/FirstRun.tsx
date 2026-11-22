import { useEffect, useId, useRef, useState } from "react";
import { useT } from "../i18n";
import { BrandLockup } from "./BrandLockup";

const KEY = "centurion.onboarded.v1";
const OPEN = "centurion-onboarding";
const STEPS = ["s1", "s2", "s3"] as const;

export function openOnboarding() {
  window.dispatchEvent(new Event(OPEN));
}

/** First launch on this PC. Paper is the mode you land in. Real stays off. */
export function FirstRun() {
  const t = useT();
  const titleId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch { seen = false; }
    if (!seen) setOpen(true);
    const show = () => { setStep(0); setOpen(true); };
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
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
    <div className="modal-backdrop" style={{ zIndex: 80 }} role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal" style={{ maxWidth: 440 }}>
        <BrandLockup mark={28} />
        <p className="dim" style={{ marginTop: 12 }}>{t("desktop.onboard.step", { n: step + 1, total: STEPS.length })}</p>
        <h3 id={titleId}>{t(`desktop.onboard.${id}title`)}</h3>
        <p>{t(`desktop.onboard.${id}body`)}</p>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
          <button type="button" className="sm" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0}>{t("desktop.onboard.back")}</button>
          <button ref={nextRef} type="button" className="sm primary" onClick={() => (last ? finish() : setStep((n) => n + 1))}>
            {last ? t("desktop.onboard.done") : t("desktop.onboard.next")}
          </button>
        </div>
      </div>
    </div>
  );
}
