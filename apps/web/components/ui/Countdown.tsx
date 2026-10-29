"use client";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { fmtCountdown } from "@/lib/format";
import { cn } from "./cn";

/** mm:ss + progress bar; < 2 min → loss colour + icon (UX SPEC §1). */
export function Countdown({ createdAt, expiresAt, onExpire, compact }: { createdAt: number; expiresAt: number; onExpire?: () => void; compact?: boolean }) {
  const t = useT();
  const now = useNow(1000);
  const left = expiresAt - (now ?? createdAt);
  const total = Math.max(1, expiresAt - createdAt);
  const urgent = left < 120_000;
  useEffect(() => {
    if (now != null && left <= 0) onExpire?.();
  }, [now, left, onExpire]);
  return (
    <div className={cn("flex flex-col gap-1", compact ? "w-20" : "w-28")} aria-label={t("common.expiresIn", { time: fmtCountdown(left) })}>
      <span className={cn("num flex items-center justify-end gap-1 text-numSm", urgent ? "text-semantic-loss" : "text-text-secondary")}>
        <Timer size={12} aria-hidden /> {now == null ? "--:--" : fmtCountdown(left)}
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-bg-inset">
        <span className={cn("block h-full rounded-full", urgent ? "bg-semantic-loss" : "bg-text-tertiary")} style={{ width: `${Math.max(0, Math.min(100, (left / total) * 100))}%` }} />
      </span>
    </div>
  );
}

/** Client clock; null during SSR to avoid hydration mismatch. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
