import { parseDrawings, type Drawing } from "./drawings";

export interface IndicatorSettings {
  sma: { on: boolean; period: number };
  ema: { on: boolean; period: number };
  bb: { on: boolean; period: number; mult: number };
  vwap: { on: boolean };
  volume: { on: boolean };
  rsi: { on: boolean; period: number };
  macd: { on: boolean; fast: number; slow: number; signal: number };
  stoch: { on: boolean; rsi: number; stoch: number; k: number; d: number };
}

export interface ChartFile {
  indicators: IndicatorSettings;
  drawings: Record<string, Drawing[]>;
}

export const CHART_FILE_KEY = "centurion.chart.v1";

export const DEFAULT_INDICATORS: IndicatorSettings = {
  sma: { on: false, period: 20 },
  ema: { on: false, period: 9 },
  bb: { on: false, period: 20, mult: 2 },
  vwap: { on: false },
  volume: { on: true },
  rsi: { on: false, period: 14 },
  macd: { on: false, fast: 12, slow: 26, signal: 9 },
  stoch: { on: false, rsi: 14, stoch: 14, k: 3, d: 3 },
};

export interface ChartStore {
  read(): Promise<string | null>;
  write(body: string): Promise<void>;
}

export function browserChartStore(): ChartStore {
  return {
    async read() {
      try {
        return localStorage.getItem(CHART_FILE_KEY);
      } catch {
        return null;
      }
    },
    async write(body) {
      try {
        localStorage.setItem(CHART_FILE_KEY, body);
      } catch {
        /* private mode or a full disk */
      }
    },
  };
}

function period(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(500, Math.max(1, Math.round(n)));
}

function flag(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

export function parseChartFile(raw: string | null): ChartFile {
  const base: ChartFile = { indicators: structuredClone(DEFAULT_INDICATORS), drawings: {} };
  if (!raw) return base;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!json || typeof json !== "object") return base;
  const rec = json as { indicators?: unknown; drawings?: unknown };
  const src = rec.indicators && typeof rec.indicators === "object" ? rec.indicators as Record<string, unknown> : {};
  const pick = (key: keyof IndicatorSettings) => (src[key] && typeof src[key] === "object" ? src[key] as Record<string, unknown> : {});
  const sma = pick("sma");
  const ema = pick("ema");
  const bb = pick("bb");
  const vwap = pick("vwap");
  const volume = pick("volume");
  const rsi = pick("rsi");
  const macd = pick("macd");
  const stoch = pick("stoch");
  const d = DEFAULT_INDICATORS;
  base.indicators = {
    sma: { on: flag(sma.on, d.sma.on), period: period(sma.period, d.sma.period) },
    ema: { on: flag(ema.on, d.ema.on), period: period(ema.period, d.ema.period) },
    bb: { on: flag(bb.on, d.bb.on), period: period(bb.period, d.bb.period), mult: clampMult(bb.mult, d.bb.mult) },
    vwap: { on: flag(vwap.on, d.vwap.on) },
    volume: { on: flag(volume.on, d.volume.on) },
    rsi: { on: flag(rsi.on, d.rsi.on), period: period(rsi.period, d.rsi.period) },
    macd: {
      on: flag(macd.on, d.macd.on),
      fast: period(macd.fast, d.macd.fast),
      slow: period(macd.slow, d.macd.slow),
      signal: period(macd.signal, d.macd.signal),
    },
    stoch: {
      on: flag(stoch.on, d.stoch.on),
      rsi: period(stoch.rsi, d.stoch.rsi),
      stoch: period(stoch.stoch, d.stoch.stoch),
      k: period(stoch.k, d.stoch.k),
      d: period(stoch.d, d.stoch.d),
    },
  };
  if (base.indicators.macd.fast >= base.indicators.macd.slow) base.indicators.macd.slow = base.indicators.macd.fast + 1;
  if (rec.drawings && typeof rec.drawings === "object") {
    for (const [key, value] of Object.entries(rec.drawings as Record<string, unknown>)) {
      if (key.length > 120) continue;
      const rows = parseDrawings(value);
      if (rows.length > 0) base.drawings[key] = rows.slice(0, 80);
    }
  }
  return base;
}

function clampMult(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10, Math.max(0.1, Math.round(n * 10) / 10));
}

export function enabledNames(settings: IndicatorSettings): string[] {
  return (Object.keys(settings) as (keyof IndicatorSettings)[]).filter((key) => settings[key].on);
}
