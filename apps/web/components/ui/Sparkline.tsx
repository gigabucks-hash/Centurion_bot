/** Tiny inline SVG sparkline (server-renderable). */
export function Sparkline({ values, width = 72, height = 22, label }: { values: number[]; width?: number; height?: number; label?: string }) {
  if (values.length < 2) return <span className="text-caption text-text-tertiary">—</span>;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= 0;
  const zeroY = height - ((0 - min) / span) * height;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "PnL trend"} className="inline-block">
      <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="var(--color-border-default)" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke={up ? "var(--color-semantic-profit)" : "var(--color-semantic-loss)"} strokeWidth={1.5} />
    </svg>
  );
}
