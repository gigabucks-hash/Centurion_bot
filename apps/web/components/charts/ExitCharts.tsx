"use client";
import { useFmt } from "@/lib/i18n/client";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ExitReasonStat } from "@/lib/types";
import { chartColors } from "@/lib/theme";

import { useT } from "@/lib/i18n/client";

const tooltipStyle = { background: "var(--color-bg-overlay)", border: "1px solid var(--color-border-default)", borderRadius: 10, color: "var(--color-text-primary)", fontSize: 12 };

export function ExitCountChart({ stats }: { stats: ExitReasonStat[] }) {
  const t = useT();
  const data = stats.map((s) => ({ name: t(`exitReason.${s.reason}`), count: s.count }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" stroke={chartColors.muted} fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis stroke={chartColors.muted} fontSize={11} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-bg-raised)" }} />
          <Bar dataKey="count" name={t("stats.exits")} fill={chartColors.accent} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExitPnlChart({ stats }: { stats: ExitReasonStat[] }) {
  const t = useT();
  const f = useFmt();
  const data = stats.map((s) => ({ name: t(`exitReason.${s.reason}`), avg: s.avgPnlPct }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" stroke={chartColors.muted} fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis stroke={chartColors.muted} fontSize={11} unit="%" />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-bg-raised)" }} formatter={(v) => [f.pct(Number(v), 1), t("stats.avgPnl")]} />
          <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.avg >= 0 ? chartColors.positive : chartColors.negative} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
