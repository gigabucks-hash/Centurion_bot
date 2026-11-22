import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { formatPrice, visibleRange } from "@explore/candles";
import { ChartStudio, type ChartLabels } from "./ChartStudio";
import { core, EVT, runtime, type MarketBody, type TickView } from "../api";
import { browserChartStore } from "@explore/chartFile";
import { useLang, useT } from "../i18n";
import { useTerm } from "../state/store";
import { safeLocale } from "./format";

const BUCKET_SEC = 5;

/** Candles from the core snapshot, then live 5s candles built from pushed (batched) ticks. */
const TFS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

export function PriceChart({ mint, symbol }: { mint: string | null; symbol?: string }) {
  const lang = useLang();
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [live, setLive] = useState<{ chart: IChartApi; series: ISeriesApi<"Candlestick"> } | null>(null);
  const notes = useState(() => runtime === "tauri"
    ? { read: () => core.chartNotesLoad(), write: (body: string) => core.chartNotesSave(body) }
    : browserChartStore())[0];
  const marksRef = useRef<{ setMarkers: (markers: SeriesMarker<Time>[]) => void } | null>(null);
  const [tf, setTf] = useState<(typeof TFS)[number]>("5m");
  const [currency, setCurrency] = useState<"usd" | "sol">("usd");
  const [market, setMarket] = useState<MarketBody | null>(null);
  const note = lang === "id" ? "Data pasar tidak tersedia. Menampilkan isian di komputer ini." : "Market data unavailable. Showing fills from this computer.";
  const by = lang === "id" ? "Candle dari GeckoTerminal" : "Candles by GeckoTerminal";

  useEffect(() => {
    if (!host.current) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const chart = createChart(host.current, {
      autoSize: true,
      localization: {
        locale: safeLocale,
        priceFormatter: formatPrice,
        timeFormatter: (t: number) => new Date(t * 1000).toLocaleTimeString(safeLocale, { hour: "2-digit", minute: "2-digit", hour12: false }),
      },
      layout: { background: { type: ColorType.Solid, color: v("--color-bg-canvas") }, textColor: v("--color-text-secondary"), fontFamily: v("--font-mono") },
      grid: { vertLines: { color: v("--color-border-subtle") }, horzLines: { color: v("--color-border-subtle") } },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        rightOffset: 2,
        tickMarkFormatter: (t: number) =>
          new Date(t * 1000).toLocaleTimeString(safeLocale, { hour: "2-digit", minute: "2-digit", hour12: false }),
      },
      rightPriceScale: { borderColor: v("--color-border-default") },
    });
    const up = v("--color-brand-primary") || v("--color-semantic-profit");
    const down = v("--color-semantic-loss");
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      wickUpColor: up,
      wickDownColor: down,
      borderVisible: false,
      priceFormat: { type: "custom", minMove: 1e-12, formatter: formatPrice },
    });
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
    chartRef.current = chart;
    seriesRef.current = series;
    setLive({ chart, series });
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
      setLive(null);
    };
  }, []);

  useEffect(() => {
    if (!mint) return;
    let stop = false;
    const pull = () => {
      if (document.visibilityState === "hidden") return;
      void core.marketCandles(mint, tf, currency).then((body) => { if (!stop) setMarket(body); }).catch(() => { if (!stop) setMarket(null); });
    };
    pull();
    const id = window.setInterval(pull, tf === "1m" ? 20_000 : 60_000);
    const onVis = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mint, tf, currency]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !mint) return;
    let last: CandlestickData<UTCTimestamp> | null = null;
    let disposed = false;
    let unsub: (() => void) | undefined;
    const paintLocal = async () => {
      const candles = await core.candles(mint);
      if (disposed) return;
      const data = candles.map((c) => ({ time: c.time as UTCTimestamp, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) }));
      series.setData(data);
      last = data[data.length - 1] ?? null;
      chartRef.current?.timeScale().fitContent();
    };
    (async () => {
      if (market?.ok && market.candles.length > 0) {
        const up = getComputedStyle(document.documentElement).getPropertyValue("--color-brand-primary").trim();
        const down = getComputedStyle(document.documentElement).getPropertyValue("--color-semantic-loss").trim();
        series.setData(market.candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
        const times = market.candles.map((c) => c.time);
        const snap = (sec: number) => times.reduce((best, t0) => (Math.abs(t0 - sec) < Math.abs(best - sec) ? t0 : best), times[0]);
        const st = useTerm.getState();
        const markers: SeriesMarker<Time>[] = [];
        for (const p of st.positions) {
          if (p.mint !== mint) continue;
          markers.push({ time: snap(Math.floor(p.opened_at_ms / 1000)) as UTCTimestamp, position: "belowBar", shape: "arrowUp", color: up, text: "Entry" });
        }
        for (const a of st.activity) {
          if (a.mint !== mint) continue;
          const kind = a.kind.toLowerCase();
          const label = kind.includes("profit") ? "TP" : kind.includes("loss") || kind.includes("stop") || kind.includes("trail") ? "SL" : kind.includes("sold") || kind.includes("closed") || kind.includes("exit") ? "Exit" : null;
          if (!label) continue;
          markers.push({ time: snap(Math.floor(a.ts_ms / 1000)) as UTCTimestamp, position: "aboveBar", shape: "arrowDown", color: label === "SL" ? down : up, text: label });
        }
        markers.sort((a, b) => Number(a.time) - Number(b.time));
        if (marksRef.current) marksRef.current.setMarkers(markers);
        else marksRef.current = createSeriesMarkers(series, markers);
        const range = visibleRange(market.candles.length, host.current?.clientWidth || 960);
        chartRef.current?.timeScale().setVisibleLogicalRange(range);
        host.current?.setAttribute("data-bars", String(market.candles.length));
        return;
      }
      await paintLocal();
      unsub = await core.on<TickView[]>(EVT.ticks, (batch) => {
        for (const tv of batch) {
          if (tv.mint !== mint) continue;
          const t = { time: tv.time, price: Number(tv.price_sol) };
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
  }, [mint, market]);

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div data-chart-label style={{ padding: "4px 8px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>
        {[symbol ? `$${symbol}` : null, market?.pair, tf, currency.toUpperCase(), market?.ok ? "GeckoTerminal" : null].filter(Boolean).join(" · ")}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 8px" }}>
        {TFS.map((item) => (
          <button key={item} type="button" className={item === tf ? "sm primary" : "sm"} onClick={() => setTf(item)}>{item}</button>
        ))}
        <span style={{ marginLeft: "auto" }} />
        <button type="button" className={currency === "usd" ? "sm primary" : "sm"} onClick={() => setCurrency("usd")}>USD</button>
        <button type="button" className={currency === "sol" ? "sm primary" : "sm"} disabled={market != null && market.solSide == null} onClick={() => setCurrency("sol")}>SOL</button>
      </div>
      {mint && market && !market.ok && <div className="dim" style={{ padding: "0 8px 4px" }}>{note}</div>}
      <div style={{ flex: 1, minHeight: 280, display: "flex" }}>
        <ChartStudio
          hostRef={(node) => { host.current = node; }}
          chart={live?.chart ?? null}
          candle={live?.series ?? null}
          bars={market?.ok ? market.candles : []}
          mint={mint ?? ""}
          timeframe={tf}
          store={notes}
          height="100%"
          text={(key) => t(`chart.studio.${key}` as `chart.studio.${keyof ChartLabels}`)}
        />
      </div>
      {market?.attribution && <a className="dim" href={market.attribution} target="_blank" rel="noreferrer" style={{ padding: "2px 8px" }}>{by}</a>}
      {!mint && <div className="empty" style={{ position: "absolute", inset: 0 }}>Pilih token</div>}
    </div>
  );
}
