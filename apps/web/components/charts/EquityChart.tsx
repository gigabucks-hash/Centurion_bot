"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EquityPoint } from "@/lib/types";
import { chartColors } from "@/lib/theme";
import { fmtNum, fmtTime } from "@/lib/format";

const tooltipStyle = { background: "var(--color-bg-overlay)", border: "1px solid var(--color-border-default)", borderRadius: 10, color: "var(--color-text-primary)", fontSize: 12 };

export function EquityChart({ data }: { data: EquityPoint[] }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor={chartColors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tickFormatter={(t) => fmtTime(t, true).slice(0, 6)} stroke={chartColors.muted} fontSize={11} minTickGap={40} />
          <YAxis domain={["auto", "auto"]} stroke={chartColors.muted} fontSize={11} tickFormatter={(v) => fmtNum(v, 1)} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtTime(Number(t), true)} formatter={(v) => [`${fmtNum(Number(v), 3)} SOL`, "Equity"]} />
          <Area type="monotone" dataKey="equitySol" stroke={chartColors.accent} fill="url(#eq)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
