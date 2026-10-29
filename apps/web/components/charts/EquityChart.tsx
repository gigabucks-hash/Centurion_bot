import type { Fmt } from "@/lib/format";
import type { T } from "@/lib/i18n/core";
import type { EquityPoint } from "@/lib/types";

/**
 * Equity curve as a Server Component: plain SVG + HTML axis labels, zero client JS (perf pass: replaces recharts,
 * ~100 KB gzip). The area/grid scale with the card (preserveAspectRatio="none" + non-scaling strokes); labels
 * are HTML so text never stretches. Each point carries a native <title> (date · amount) for hover/AT.
 * QA-13: one tick per calendar day (WIB), date only, so labels never repeat.
 */
export function dayTicks(data: EquityPoint[], day: (ts: number) => string): number[] {
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

const W = 600;
const H = 200;

export function EquityChart({ data, f, t }: { data: EquityPoint[]; f: Fmt; t: T }) {
  if (data.length < 2) return <div className="h-52 w-full rounded-md bg-bg-sunken" />;
  const t0 = data[0].t;
  const t1 = data[data.length - 1].t;
  const vals = data.map((p) => p.equitySol);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const x = (ts: number) => ((ts - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const line = data.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.equitySol).toFixed(1)}`).join("");
  const area = `${line}L${W},${H}L0,${H}Z`;
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const ticks = dayTicks(data, f.day);
  const label = t("overview.equityLabel");
  return (
    <figure className="relative h-52 w-full pb-5 pl-10" aria-label={`${label}: ${f.sol(vals[0])} → ${f.sol(vals[vals.length - 1])}`}>
      <div className="relative h-full w-full">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-hidden>
          <defs>
            <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {yTicks.map((v) => (
            <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--color-border-subtle)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="url(#eq-fill)" />
          <path d={line} fill="none" stroke="var(--color-brand-primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {data.map((p) => (
            <rect key={p.t} x={x(p.t) - W / data.length / 2} y={0} width={W / data.length} height={H} fill="transparent">
              <title>{`${f.dateTime(p.t)} · ${f.sol(p.equitySol)}`}</title>
            </rect>
          ))}
        </svg>
        {yTicks.map((v) => (
          <span key={v} className="num absolute -left-10 w-9 -translate-y-1/2 text-right text-[11px] text-text-tertiary" style={{ top: `${(y(v) / H) * 100}%` }}>
            {f.num(v, 1)}
          </span>
        ))}
        {ticks.map((ts) => (
          <span key={ts} className="absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-text-tertiary" style={{ left: `${(x(ts) / W) * 100}%` }}>
            {f.day(ts)}
          </span>
        ))}
      </div>
    </figure>
  );
}
