import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { core, EVT, type Tick } from "../api";
import { useTerm } from "../state/store";
import { safeLocale } from "./format";

const BUCKET_SEC = 5;

/** Candles from the core snapshot, then live 5s candles built from pushed (batched) ticks. */
export function PriceChart({ mint }: { mint: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const chart = createChart(host.current, {
      autoSize: true,
      localization: {
        locale: safeLocale,
        timeFormatter: (t: number) => new Date(t * 1000).toLocaleTimeString(safeLocale, { hour12: false }),
      },
      layout: { background: { type: ColorType.Solid, color: v("--color-bg-canvas") }, textColor: v("--color-text-secondary"), fontFamily: v("--font-mono") },
      grid: { vertLines: { color: v("--color-border-subtle") }, horzLines: { color: v("--color-border-subtle") } },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        // Show local time instead of UTC on the axis.
        tickMarkFormatter: (t: number) =>
          new Date(t * 1000).toLocaleTimeString(safeLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      },
      rightPriceScale: { borderColor: v("--color-border-default") },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: v("--color-semantic-profit"),
      downColor: v("--color-semantic-loss"),
      wickUpColor: v("--color-semantic-profit"),
      wickDownColor: v("--color-semantic-loss"),
      borderVisible: false,
      priceFormat: { type: "price", precision: 9, minMove: 1e-9 },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    // Re-read token colors when the theme attribute flips (dark <-> light).
    const applyTheme = () => {
      const c = getComputedStyle(document.documentElement);
      const g = (n: string) => c.getPropertyValue(n).trim();
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: g("--color-bg-canvas") }, textColor: g("--color-text-secondary") },
        grid: { vertLines: { color: g("--color-border-subtle") }, horzLines: { color: g("--color-border-subtle") } },
      });
    };
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mo.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !mint) return;
    let last: CandlestickData<UTCTimestamp> | null = null;
    let disposed = false;
    let unsub: (() => void) | undefined;
    (async () => {
      const candles = await core.candles(mint);
      if (disposed) return;
      const data = candles.map((c) => ({ ...c, time: c.time as UTCTimestamp }));
      series.setData(data);
      last = data[data.length - 1] ?? null;
      chartRef.current?.timeScale().scrollToRealTime();
      unsub = await core.on<Tick[]>(EVT.ticks, (batch) => {
        for (const t of batch) {
          if (t.mint !== mint) continue;
          const b = (t.time - (t.time % BUCKET_SEC)) as UTCTimestamp;
          if (last && last.time === b) {
            last = { ...last, high: Math.max(last.high, t.price), low: Math.min(last.low, t.price), close: t.price };
          } else if (!last || b > last.time) {
            last = { time: b, open: last?.close ?? t.price, high: t.price, low: t.price, close: t.price };
          } else continue; // out-of-order tick
          series.update(last);
        }
      });
      if (disposed) unsub();
    })().catch((e) => useTerm.getState().reportError(e));
    return () => {
      disposed = true;
      unsub?.();
      // The chart may already be disposed (unmount order), so only reset a live series.
      if (seriesRef.current === series) series.setData([]);
    };
  }, [mint]);

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div ref={host} className="chart-host" />
      {!mint && <div className="empty" style={{ position: "absolute", inset: 0 }}>Pilih token</div>}
    </div>
  );
}
