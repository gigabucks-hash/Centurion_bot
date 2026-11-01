import { useEffect, useRef, useState, type ReactNode } from "react";
import { HoldGate } from "./holdGate";

/**
 * Hold-to-confirm (UX SPEC: 1.2 s Practice / 2.5 s Real). Time-based, so it still works
 * with prefers-reduced-motion. Pointer hold or keyboard hold (Enter/Space) both count.
 * `version` (rev + quote_id): when it changes during a hold, the hold resets (`onReset`).
 */
export function HoldButton({ ms, onConfirm, className, children, autoFocus, version = "", onReset, disabled }: {
  ms: number;
  onConfirm: () => void;
  className?: string;
  children: ReactNode;
  autoFocus?: boolean;
  version?: string;
  onReset?: () => void;
  disabled?: boolean;
}) {
  const [p, setP] = useState(0);
  const gate = useRef<HoldGate>(null as unknown as HoldGate);
  if (!gate.current) gate.current = new HoldGate(ms, version);
  const raf = useRef<number>(0);

  const loop = () => {
    const e = gate.current.tick(performance.now());
    if (e.kind === "holding") {
      setP(e.progress);
      raf.current = requestAnimationFrame(loop);
    } else if (e.kind === "confirmed") {
      setP(1);
      onConfirm();
    } else {
      setP(0);
    }
  };
  const begin = () => {
    if (disabled || gate.current.holding) return;
    gate.current.begin(performance.now());
    raf.current = requestAnimationFrame(loop);
  };
  const stop = () => {
    gate.current.release();
    cancelAnimationFrame(raf.current);
    loop();
  };
  useEffect(() => {
    if (gate.current.versionChanged(version)) {
      cancelAnimationFrame(raf.current);
      setP(0);
      onReset?.();
    }
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      className={`hold ${className ?? ""}`}
      autoFocus={autoFocus}
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) begin();
        }
      }}
      onKeyUp={(e) => (e.key === "Enter" || e.key === " ") && stop()}
      aria-label="Tahan untuk konfirmasi"
    >
      <i className="fill" style={{ transform: `scaleX(${p})` }} />
      <span>{children}</span>
    </button>
  );
}
