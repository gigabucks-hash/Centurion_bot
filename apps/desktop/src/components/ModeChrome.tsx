import type { ReactNode } from "react";
import { useT } from "../i18n";
import { useTerm } from "../state/store";
import { StopControl } from "./StopControl";

/** 4px mode strip + title bar, required on EVERY window (UX Tauri README §1). Title bar is a drag region. */
export function ModeChrome({ title, children, stop }: { title: string; children?: ReactNode; stop?: boolean }) {
  const mode = useTerm((s) => s.mode);
  const t = useT();
  return (
    <>
      <div className="mode-strip" aria-hidden />
      <div className="titlebar" data-tauri-drag-region>
        <span className="mode-label" role="status">{mode === "practice" ? `◇ ${t("mode.practice.label")}` : `● ${t("mode.real.label")}`}</span>
        {/* C15: Real SOL on desktop = Phase 7 (out of MVP). This chrome is a reference preview behind CENTURION_MOCK_MODE=real only. */}
        {mode === "real" && <span className="chip badge-mock" title="Real SOL di desktop = Phase 7 (di luar MVP). Ini pratinjau mock.">Phase 7 preview · mock</span>}
        <span className="brand" data-tauri-drag-region>{t("app.name")}</span>
        <span className="dim" data-tauri-drag-region>{title}</span>
        {stop && <StopControl />}
        {children}
      </div>
    </>
  );
}
