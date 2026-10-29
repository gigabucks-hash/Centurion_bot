"use client";
import { cn } from "./cn";
import { useT } from "@/lib/i18n/client";

/** Whole row is clickable (≥ 40px), with visible state label. */
export function Toggle({ checked, onChange, label, hint, disabled, warnWhenOff }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** Turning this off weakens a guard → show warning tint. */
  warnWhenOff?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-tap w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-bg-raised disabled:opacity-50",
        warnWhenOff && !checked && "bg-semantic-warningContainer",
      )}
    >
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition duration-fast", checked ? "bg-brand-primary" : "bg-border-default")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-bg-surface shadow-e1 transition-all duration-fast", checked ? "left-4.5" : "left-0.5")} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body text-text-primary">{label}</span>
        {hint && <span className="block text-caption text-text-tertiary">{hint}</span>}
      </span>
      <span className={cn("text-caption", checked ? "text-text-secondary" : warnWhenOff ? "text-semantic-warning" : "text-text-tertiary")}>{checked ? t("common.on") : t("common.off")}</span>
    </button>
  );
}
