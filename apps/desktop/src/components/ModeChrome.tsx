import type { ReactNode } from "react";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { useT } from "../i18n";
import { useTerm } from "../state/store";
import { Icon } from "./Icon";
import { StopControl } from "./StopControl";

/** 4px mode strip + title bar, required on EVERY window (UX Tauri README §1). Title bar is a drag region. */
export function ModeChrome({ title, children, stop }: { title: string; children?: ReactNode; stop?: boolean }) {
  const mode = useTerm((s) => (s.realOn ? "real" : s.mode));
  const t = useT();
  return (
    <>
      <div className="mode-strip" aria-hidden />
      <div className="titlebar" data-tauri-drag-region>
        <span className="mode-label" role="status">
          <Icon glyph={mode === "practice" ? FlaskConical : ShieldCheck} size={16} />
          {mode === "practice" ? t("mode.practice.label") : t("mode.real.label")}
        </span>
        <span className="brand" data-tauri-drag-region>{t("app.name")}</span>
        <span className="dim" data-tauri-drag-region>{title}</span>
        {stop && <StopControl />}
        {children}
      </div>
    </>
  );
}
