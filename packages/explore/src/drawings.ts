/** Drawings are anchored to candle time and price, so zoom, pan, and a new timeframe keep them in place. */

export const DRAW_TOOLS = ["trend", "hline", "hray", "vline", "rect", "fib", "measure"] as const;
export type DrawTool = (typeof DRAW_TOOLS)[number];

export interface Anchor {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  tool: DrawTool;
  a: Anchor;
  b: Anchor;
  locked: boolean;
}

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export interface Ohlc {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const TOOLS = new Set<string>(DRAW_TOOLS);

export function drawingKey(mint: string, timeframe: string): string {
  return `${mint}|${timeframe}`;
}

/** 0% sits on the second point, 100% on the first. */
export function fibPrices(a: number, b: number): { ratio: number; price: number }[] {
  return FIB_RATIOS.map((ratio) => ({ ratio, price: b + (a - b) * ratio }));
}

export function measureOf(bars: readonly { time: number }[], a: Anchor, b: Anchor): { price: number; pct: number; bars: number } {
  const price = b.price - a.price;
  const pct = a.price !== 0 ? (price / a.price) * 100 : 0;
  const t0 = Math.min(a.time, b.time);
  const t1 = Math.max(a.time, b.time);
  let count = 0;
  for (const bar of bars) if (bar.time >= t0 && bar.time <= t1) count += 1;
  return { price, pct, bars: count };
}

/** Snap a pointer to the nearest candle, then to the nearest of open, high, low, close. */
export function snapOhlc(bars: readonly Ohlc[], time: number, price: number): Anchor {
  if (bars.length === 0 || !Number.isFinite(time) || !Number.isFinite(price)) return { time, price };
  let best = bars[0];
  let bestDt = Math.abs(bars[0].time - time);
  for (let i = 1; i < bars.length; i++) {
    const dt = Math.abs(bars[i].time - time);
    if (dt < bestDt) {
      best = bars[i];
      bestDt = dt;
    }
  }
  let next = best.open;
  let gap = Math.abs(next - price);
  for (const value of [best.high, best.low, best.close]) {
    const d = Math.abs(value - price);
    if (d < gap) {
      next = value;
      gap = d;
    }
  }
  return { time: best.time, price: next };
}

export function parseDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { id?: unknown; tool?: unknown; a?: unknown; b?: unknown; locked?: unknown };
    if (typeof rec.id !== "string" || rec.id.length < 1 || rec.id.length > 40) continue;
    if (typeof rec.tool !== "string" || !TOOLS.has(rec.tool)) continue;
    const a = anchor(rec.a);
    const b = anchor(rec.b);
    if (!a || !b) continue;
    out.push({ id: rec.id, tool: rec.tool as DrawTool, a, b, locked: rec.locked === true });
  }
  return out;
}

function anchor(raw: unknown): Anchor | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as { time?: unknown; price?: unknown };
  if (typeof rec.time !== "number" || typeof rec.price !== "number") return null;
  if (!Number.isFinite(rec.time) || !Number.isFinite(rec.price)) return null;
  return { time: rec.time, price: rec.price };
}

/** Distance from a point to a segment, in pixels. */
export function segmentDistance(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
