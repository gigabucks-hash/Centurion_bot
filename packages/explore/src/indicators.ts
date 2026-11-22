/**
 * Indicator math for the chart. Everything is computed from the candles already on screen.
 * No network, no paid feed. Null means the window has not filled yet.
 */

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (period < 1) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values. k = 2 / (period + 1). */
export function ema(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (period < 1 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Bollinger Bands. Standard deviation is the population form (divide by period), as Bollinger defined it. */
export function bollinger(values: readonly number[], period: number, mult: number): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid = sma(values, period);
  const upper: (number | null)[] = Array.from({ length: values.length }, () => null);
  const lower: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (period < 1) return { mid, upper, lower };
  for (let i = period - 1; i < values.length; i++) {
    const mean = mid[i];
    if (mean == null) continue;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - mean;
      acc += d * d;
    }
    const sd = Math.sqrt(acc / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { mid, upper, lower };
}

/** Session VWAP. A new UTC day starts a new session. Typical price is (high + low + close) / 3. */
export function vwap(bars: readonly Bar[]): (number | null)[] {
  let pv = 0;
  let vol = 0;
  let day = Number.NaN;
  return bars.map((bar) => {
    const next = Math.floor(bar.time / 86400);
    if (next !== day) {
      pv = 0;
      vol = 0;
      day = next;
    }
    const typical = (bar.high + bar.low + bar.close) / 3;
    pv += typical * bar.volume;
    vol += bar.volume;
    return vol > 0 ? pv / vol : null;
  });
}

/** Wilder RSI. The first average is the mean of the first `period` changes. */
export function rsi(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: values.length }, () => null);
  if (period < 1 || values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const at = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out[period] = at(avgGain, avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
    out[i] = at(avgGain, avgLoss);
  }
  return out;
}

export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  hist: number | null;
}

/** MACD line is EMA(fast) − EMA(slow). The signal line is an EMA of that line. */
export function macd(values: readonly number[], fast: number, slow: number, signal: number): MacdPoint[] {
  const empty = (): MacdPoint => ({ macd: null, signal: null, hist: null });
  const out = values.map(empty);
  if (fast < 1 || slow < 1 || signal < 1 || fast >= slow) return out;
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const line: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const fastValue = fastE[i];
    const slowValue = slowE[i];
    if (fastValue == null || slowValue == null) continue;
    const m = fastValue - slowValue;
    out[i].macd = m;
    line.push(m);
    index.push(i);
  }
  const sig = ema(line, signal);
  for (let k = 0; k < line.length; k++) {
    const s = sig[k];
    if (s == null) continue;
    const i = index[k];
    out[i].signal = s;
    out[i].hist = line[k] - s;
  }
  return out;
}

export interface StochPoint {
  k: number | null;
  d: number | null;
}

/**
 * Stochastic RSI. %K is an SMA of the stochastic of RSI. %D is an SMA of %K.
 * A flat window (high = low) is 100 when the value sits on that high.
 */
export function stochRsi(values: readonly number[], rsiPeriod: number, stochPeriod: number, kPeriod: number, dPeriod: number): StochPoint[] {
  const out: StochPoint[] = values.map(() => ({ k: null, d: null }));
  if (rsiPeriod < 1 || stochPeriod < 1 || kPeriod < 1 || dPeriod < 1) return out;
  const r = rsi(values, rsiPeriod);
  const raw: (number | null)[] = Array.from({ length: values.length }, () => null);
  for (let i = 0; i < values.length; i++) {
    if (r[i] == null || i + 1 < stochPeriod) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let filled = 0;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      const v = r[j];
      if (v == null) continue;
      filled += 1;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (filled < stochPeriod) continue;
    raw[i] = hi === lo ? 100 : ((r[i] as number) - lo) / (hi - lo) * 100;
  }
  const ks = smaFilled(raw, kPeriod);
  const ds = smaFilled(ks, dPeriod);
  for (let i = 0; i < values.length; i++) out[i] = { k: ks[i], d: ds[i] };
  return out;
}

function smaFilled(values: readonly (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: values.length }, () => null);
  for (let i = 0; i < values.length; i++) {
    if (i + 1 < period) continue;
    let sum = 0;
    let n = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) continue;
      sum += v;
      n += 1;
    }
    if (n === period) out[i] = sum / period;
  }
  return out;
}
