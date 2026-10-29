"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn";
import { useT } from "@/lib/i18n/client";

/** Centered modal. Esc closes. Focus moves to `initialFocusRef` (the SAFE action). */
export function Dialog({ open, onClose, title, children, accent, labelledBy = "dlg-title", initialFocusRef, wide }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  accent?: "real" | "practice" | "warning";
  labelledBy?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  wide?: boolean;
}) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => (initialFocusRef?.current ?? panel.current)?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose, initialFocusRef]);
  if (!open) return null;
  const bar = { real: "bg-mode-real", practice: "bg-mode-practice stripes-practice", warning: "bg-semantic-warning" };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label={t("common.closeDialog")} className="absolute inset-0 bg-bg-sunken/80" onClick={onClose} tabIndex={-1} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn("relative max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border-default bg-bg-overlay shadow-e4 sm:rounded-xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
      >
        {accent && <div className={cn("h-1.5", bar[accent])} aria-hidden />}
        <div className="p-5 sm:p-6">
          <h2 id={labelledBy} className="mb-3 text-title text-text-primary">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
