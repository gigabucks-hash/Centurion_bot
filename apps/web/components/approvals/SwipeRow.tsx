"use client";
import { useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * Mobile swipe: right = approve, left = skip, threshold 40% of width, haptic on commit.
 * Only enabled for PRACTICE picks (Real SOL and guard changes are never swipeable).
 */
export function SwipeRow({ enabled, onApprove, onSkip, children }: { enabled: boolean; onApprove: () => void; onSkip: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const [width, setWidth] = useState<number | null>(null); // non-null while dragging
  const origin = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  if (!enabled) return <>{children}</>;
  const pct = width ? dx / width : 0;
  const end = () => {
    origin.current = null;
    setWidth(null);
    setDx(0);
  };
  return (
    <div className="relative overflow-hidden rounded-lg">
      {dx !== 0 && (
        <div className={cn("absolute inset-0 flex items-center gap-1 px-5 text-label font-semibold", dx > 0 ? "justify-start bg-semantic-profitContainer text-semantic-profit" : "justify-end bg-bg-raised text-text-secondary")} aria-hidden>
          {dx > 0 ? <><Check size={16} /> Approve</> : <>Skip <X size={16} /></>}
        </div>
      )}
      <div
        className="relative touch-pan-y"
        style={{ transform: `translateX(${dx}px)`, transition: width ? "none" : "transform 160ms ease-out", opacity: Math.abs(pct) >= 0.4 ? 0.85 : 1 }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          origin.current = { x: e.clientX, y: e.clientY, horizontal: false };
          setWidth(e.currentTarget.offsetWidth);
        }}
        onPointerMove={(e) => {
          const o = origin.current;
          if (!o) return;
          const ddx = e.clientX - o.x;
          const ddy = e.clientY - o.y;
          if (!o.horizontal && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy)) o.horizontal = true;
          if (o.horizontal) setDx(ddx);
        }}
        onPointerUp={() => {
          const o = origin.current;
          if (o?.horizontal && width && Math.abs(dx) / width >= 0.4) {
            navigator.vibrate?.(15);
            if (dx > 0) onApprove();
            else onSkip();
          }
          end();
        }}
        onPointerCancel={end}
      >
        {children}
      </div>
    </div>
  );
}
