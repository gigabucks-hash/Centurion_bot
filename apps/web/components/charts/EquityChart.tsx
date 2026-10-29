"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EquityPoint } from "@/lib/types";
import { chartColors } from "@/lib/theme";
import { useFmt, useT } from "@/lib/i18n/client";


const tooltipStyle = { background: "var(--color-bg-overlay)", border: "1px solid var(--color-border-default)", borderRadius: 10, color: "var(--color-text-primary)", fontSize: 12 };

/** QA-13: one tick per calendar day (WIB), labelled with the date only, so labels never repeat. */
function dayTicks(data: EquityPoint[], day: (ts: number) => string): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (const p of data) {
    const d = day(p.t);
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(p.t);
  }
  return out;
}

export function EquityChart({ data }: { data: EquityPoint[] }) {
  const f = useFmt();
  const t = useT();
  const ticks = dayTicks(data, f.day);
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
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(v: number) => f.day(v)} stroke={chartColors.muted} fontSize={11} minTickGap={24} />
          <YAxis domain={["auto", "auto"]} stroke={chartColors.muted} fontSize={11} tickFormatter={(v) => f.num(v, 1)} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => f.dateTime(Number(v))} formatter={(v) => [f.sol(Number(v)), t("overview.equityLabel")]} />
          <Area type="monotone" dataKey="equitySol" stroke={chartColors.accent} fill="url(#eq)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
