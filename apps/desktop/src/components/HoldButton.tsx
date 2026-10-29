import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Hold-to-confirm (UX SPEC: 1.2 s Practice / 2.5 s Real). Time-based, so it still works
 * with prefers-reduced-motion. Pointer hold or keyboard hold (Enter/Space) both count.
 */
export function HoldButton({ ms, onConfirm, className, children, autoFocus }: {
  ms: number;
  onConfirm: () => void;
  className?: string;
  children: ReactNode;
  autoFocus?: boolean;
}) {
  const [p, setP] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number>(0);
  const done = useRef(false);

  const stop = () => {
    start.current = null;
    cancelAnimationFrame(raf.current);
    if (!done.current) setP(0);
  };
  const begin = () => {
    if (start.current !== null || done.current) return;
    start.current = performance.now();
    const loop = () => {
      if (start.current === null) return;
      const v = Math.min(1, (performance.now() - start.current) / ms);
      setP(v);
      if (v >= 1) {
        done.current = true;
        start.current = null;
        onConfirm();
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      className={`hold ${className ?? ""}`}
      autoFocus={autoFocus}
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
