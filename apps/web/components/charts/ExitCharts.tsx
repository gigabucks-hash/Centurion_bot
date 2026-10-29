import type { Fmt } from "@/lib/format";
import type { T } from "@/lib/i18n/core";
import type { ExitReasonStat } from "@/lib/types";

/**
 * Exit-reason bar charts as Server Components (HTML/CSS bars, zero client JS; replaces recharts).
 * Every bar has its value as text, so nothing depends on hover. Bars are horizontal so long reason labels
 * never rotate or clip on mobile.
 */
function Bars({ rows, max, tone, fmt }: { rows: { name: string; v: number }[]; max: number; tone: (v: number) => string; fmt: (v: number) => string }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-2 text-caption">
          <span className="truncate text-text-secondary" title={r.name}>{r.name}</span>
          <span className="h-3 rounded-sm bg-bg-sunken">
            <span className="block h-3 rounded-sm" style={{ width: `${max ? Math.max(2, (Math.abs(r.v) / max) * 100) : 0}%`, background: tone(r.v) }} />
          </span>
          <span className="num w-16 whitespace-nowrap text-right text-text-primary">{fmt(r.v)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ExitCountChart({ stats, t, f }: { stats: ExitReasonStat[]; t: T; f: Fmt }) {
  const rows = stats.map((s) => ({ name: t(`exitReason.${s.reason}`), v: s.count }));
  return <Bars rows={rows} max={Math.max(0, ...rows.map((r) => r.v))} tone={() => "var(--color-brand-primary)"} fmt={(v) => f.int(v)} />;
}

export function ExitPnlChart({ stats, t, f }: { stats: ExitReasonStat[]; t: T; f: Fmt }) {
  const rows = stats.map((s) => ({ name: t(`exitReason.${s.reason}`), v: s.avgPnlPct }));
  return (
    <Bars
      rows={rows}
      max={Math.max(0, ...rows.map((r) => Math.abs(r.v)))}
      // Loss is never profit-toned: < 0 loss colour, > 0 profit, exactly 0 neutral.
      tone={(v) => (v < 0 ? "var(--color-semantic-loss)" : v > 0 ? "var(--color-semantic-profit)" : "var(--color-text-tertiary)")}
      fmt={(v) => f.pct(v, 1)}
    />
  );
}
