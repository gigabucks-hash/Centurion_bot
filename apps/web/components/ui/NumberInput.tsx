"use client";
import { useId, useState } from "react";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";
import { cn } from "./cn";
import { LOCALES } from "@/lib/i18n/format.mjs";

/** Parses input in the UI locale: id uses a decimal comma ("1.234,5"), en a decimal point ("1,234.5"). */
export function parseLocaleNumber(raw: string, locale: Locale = "en"): number {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (locale === "id") return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s.replace(/,/g, ""));
}

const display = (v: number, locale: Locale) =>
  Number.isFinite(v) ? new Intl.NumberFormat(LOCALES[locale], { maximumFractionDigits: 6, useGrouping: false }).format(v) : "";

export function NumberInput({ label, value, onChange, unit, min, max, step = 1, error, hint, weakening, className, compact }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  hint?: string;
  /** Visual warning that the current value loosens a guard vs. the active revision. */
  weakening?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const id = useId();
  const t = useT();
  const locale = useLocale();
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? display(value, locale);
  const bump = (d: number) => {
    const v = Math.round(((Number.isFinite(value) ? value : 0) + d) * 1e6) / 1e6;
    setText(null);
    onChange(v);
  };
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-label text-text-secondary">
        {label}
        {weakening && <span className="ml-1.5 text-caption text-semantic-warning">{t("common.loosensGuard")}</span>}
      </label>
      <div
        className={cn(
          "flex items-center rounded-md border bg-bg-inset focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-border-focus",
          error ? "border-semantic-loss" : weakening ? "border-semantic-warning" : "border-border-default",
        )}
      >
        {!compact && (
          <button type="button" aria-label={t("common.decrease", { label })} onClick={() => bump(-step)} className="grid h-10 w-9 place-items-center text-text-tertiary hover:text-text-primary">
            <Minus size={14} />
          </button>
        )}
        <input
          id={id}
          inputMode="decimal"
          value={shown}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseLocaleNumber(e.target.value, locale);
            onChange(n);
          }}
          onBlur={() => setText(null)}
          className={cn("num h-10 w-full min-w-0 bg-transparent text-numSm text-text-primary outline-none", compact ? "px-3" : "px-1 text-center")}
        />
        {unit && <span className="pr-2 text-caption text-text-tertiary">{unit}</span>}
        {!compact && (
          <button type="button" aria-label={t("common.increase", { label })} onClick={() => bump(step)} className="grid h-10 w-9 place-items-center text-text-tertiary hover:text-text-primary">
            <Plus size={14} />
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1 flex items-center gap-1 text-caption text-semantic-loss">
          <AlertTriangle size={12} aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-caption text-text-tertiary">{hint}{min != null && max != null ? ` · ${min}–${max}` : ""}</p>
      ) : null}
    </div>
  );
}
