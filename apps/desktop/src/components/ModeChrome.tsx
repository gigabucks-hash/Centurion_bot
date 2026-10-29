import type { ReactNode } from "react";
import { useTerm } from "../state/store";

/** 4px mode strip + title bar, required on EVERY window (UX Tauri README §1). Title bar is a drag region. */
export function ModeChrome({ title, children }: { title: string; children?: ReactNode }) {
  const mode = useTerm((s) => s.mode);
  return (
    <>
      <div className="mode-strip" aria-hidden />
      <div className="titlebar" data-tauri-drag-region>
        <span className="mode-label" role="status">{mode === "practice" ? "◇ PRACTICE" : "● REAL SOL"}</span>
        <span className="brand" data-tauri-drag-region>Sentra</span>
        <span className="dim" data-tauri-drag-region>{title}</span>
        {children}
      </div>
    </>
  );
}
