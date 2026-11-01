"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Hold-to-confirm. Time-based (not animation-based), so reduced-motion keeps
 * the same hold duration. Works with pointer and keyboard (hold Space/Enter).
 * Releasing early cancels.
 */
export function HoldButton({ durationMs, onConfirm, children, disabled, variant = "real", hint, onHoldChange }: {
  durationMs: number;
  onConfirm: (heldMs: number) => void;
  children: ReactNode;
  disabled?: boolean;
  variant?: "real" | "practice" | "warning";
  hint?: ReactNode;
  /** true while the user is holding (lets the parent tell "hold reset by a quote change" apart from idle). */
  onHoldChange?: (holding: boolean) => void;
}) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const done = useRef(false);

  const stop = () => {
    if (start.current != null) onHoldChange?.(false);
    start.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (!done.current) setProgress(0);
  };
  const loop = (t: number) => {
    if (start.current == null) return;
    const held = t - start.current;
    setProgress(Math.min(1, held / durationMs));
    if (held >= durationMs) {
      done.current = true;
      start.current = null;
      onHoldChange?.(false);
      onConfirm(Math.round(held));
      return;
    }
    raf.current = requestAnimationFrame(loop);
  };
  /** `ts` = event.timeStamp (same clock as rAF timestamps). */
  const begin = (ts: number) => {
    if (disabled || start.current != null || done.current) return;
    start.current = ts;
    onHoldChange?.(true);
    raf.current = requestAnimationFrame(loop);
  };
  // unmount-only cleanup (cancel rAF); onHoldChange is a stable state setter in all callers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stop(), []);

  const fill = { real: "bg-mode-real/45", practice: "bg-mode-practice/45", warning: "bg-semantic-warning/40" }[variant];
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => begin(e.timeStamp)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            begin(e.timeStamp);
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") stop();
        }}
        aria-describedby={hint ? "hold-hint" : undefined}
        className={cn(
          "relative h-12 w-full touch-none select-none overflow-hidden rounded-md border border-border-default bg-bg-raised text-titleSm text-text-primary disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("absolute inset-y-0 left-0", fill)} style={{ width: `${progress * 100}%` }} aria-hidden />
        <span className="relative">{children}</span>
      </button>
      {hint && <p id="hold-hint" className="mt-1 text-caption text-text-tertiary">{hint}</p>}
    </div>
  );
}
