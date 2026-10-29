"use client";
import { AlertOctagon, AlertTriangle, Info, ShieldCheck } from "lucide-react";
import type { RiskLevel } from "@/lib/types";
import { Badge } from "./Badge";
import { useT } from "@/lib/i18n/client";

const map = {
  low: { tone: "neutral", Icon: ShieldCheck },
  medium: { tone: "warning", Icon: Info },
  high: { tone: "loss", Icon: AlertTriangle },
  critical: { tone: "loss", Icon: AlertOctagon },
} as const;

export function RiskBadge({ level, reason }: { level: RiskLevel; reason?: string }) {
  const t = useT();
  const m = map[level];
  return (
    <span title={reason}>
      <Badge tone={m.tone} icon={<m.Icon size={12} aria-hidden />} className={level === "critical" ? "font-semibold" : undefined}>
        {t(`risk.${level}`)}
      </Badge>
    </span>
  );
}
