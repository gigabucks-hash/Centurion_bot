"use client";
import { cn } from "./cn";

export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number; disabled?: boolean }[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-3 font-medium transition duration-fast disabled:opacity-40",
            size === "sm" ? "h-7 text-caption" : "h-8 text-label",
            value === o.value
              ? "border-brand-primary bg-brand-primaryContainer text-brand-onPrimaryContainer"
              : "border-border-default bg-bg-surface text-text-secondary hover:text-text-primary",
          )}
        >
          {o.label}
          {o.count != null && <span className="num ml-1">· {o.count}</span>}
        </button>
      ))}
    </div>
  );
}
