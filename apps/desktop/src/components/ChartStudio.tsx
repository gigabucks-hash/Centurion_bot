"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from "lightweight-charts";
import { formatPrice } from "@explore/candles";
import {
  browserChartStore,
  enabledNames,
  parseChartFile,
  type ChartFile,
  type ChartStore,
  type IndicatorSettings,
} from "@explore/chartFile";
import {
  drawingKey,
  fibPrices,
  measureOf,
  segmentDistance,
  snapOhlc,
  type Anchor,
  type Drawing,
  type DrawTool,
} from "@explore/drawings";
import { bollinger, ema, macd, rsi, sma, stochRsi, vwap, type Bar } from "@explore/indicators";

export type { ChartStore };
export { browserChartStore };

export interface ChartLabels {
  indicators: string;
  sma: string;
  ema: string;
  bb: string;
  vwap: string;
  volume: string;
  rsi: string;
  macd: string;
  stoch: string;
  period: string;
  mult: string;
  fast: string;
  slow: string;
  signal: string;
  k: string;
  d: string;
  trend: string;
  hline: string;
  hray: string;
  vline: string;
  rect: string;
  fib: string;
  measure: string;
  select: string;
  magnet: string;
  lock: string;
  delete: string;
  clear: string;
  fullscreen: string;
  exitFullscreen: string;
  open: string;
  high: string;
  low: string;
  close: string;
  vol: string;
}

const TOOLS: { id: "select" | DrawTool; key: keyof ChartLabels }[] = [
  { id: "select", key: "select" },
  { id: "trend", key: "trend" },
  { id: "hline", key: "hline" },
  { id: "hray", key: "hray" },
  { id: "vline", key: "vline" },
  { id: "rect", key: "rect" },
  { id: "fib", key: "fib" },
  { id: "measure", key: "measure" },
];

type Drag =
  | { kind: "draw"; tool: DrawTool; a: Anchor }
  | { kind: "end"; id: string; end: "a" | "b"; origin: Drawing }
  | { kind: "move"; id: string; origin: Drawing; from: Anchor };

interface Legend {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  index: number;
}

export function ChartStudio({
  chart,
  candle,
  bars,
  mint,
  timeframe,
  store,
  text,
  height,
  hostRef,
}: {
  chart: IChartApi | null;
  candle: ISeriesApi<"Candlestick"> | null;
  bars: Bar[];
  mint: string;
  timeframe: string;
  store?: ChartStore;
  text: (key: keyof ChartLabels) => string;
  height?: number | string;
  hostRef: (node: HTMLDivElement | null) => void;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<ChartFile | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<IndicatorSettings | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tool, setTool] = useState<"select" | DrawTool>("select");
  const [magnet, setMagnet] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [menu, setMenu] = useState(false);
  const [full, setFull] = useState(false);
  const [theme, setTheme] = useState(0);
  const [tick, setTick] = useState(0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [legend, setLegend] = useState<Legend | null>(null);
  const notes = store ?? browserChartStore();

  useEffect(() => {
    let stop = false;
    void notes.read().then((raw) => {
      if (stop) return;
      const file = parseChartFile(raw);
      fileRef.current = file;
      setSettings(file.indicators);
      setDrawings(file.drawings[drawingKey(mint, timeframe)] ?? []);
      setReady(true);
    });
    return () => {
      stop = true;
    };
    // The store identity is the browser default or the caller's object. Re-read when the coin or timeframe changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint, timeframe]);

  useEffect(() => {
    if (!ready || !settings) return;
    const prev = fileRef.current ?? parseChartFile(null);
    const next: ChartFile = {
      indicators: settings,
      drawings: { ...prev.drawings, [drawingKey(mint, timeframe)]: drawings },
    };
    fileRef.current = next;
    void notes.write(JSON.stringify(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, drawings, mint, timeframe, ready]);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onFull = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      obs.disconnect();
      document.removeEventListener("fullscreenchange", onFull);
    };
  }, []);

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const bump = () => setTick((n) => n + 1);
    const obs = new ResizeObserver(() => {
      bump();
      setBox({ w: node.clientWidth, h: node.clientHeight });
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!chart) return;
    const bump = () => setTick((n) => n + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump);
  }, [chart]);

  useEffect(() => {
    if (!chart || !candle || !settings) return;
    const made: ISeriesApi<SeriesType>[] = [];
    const brand = read("--color-brand-primary", "#FF7A1A");
    const loss = read("--color-semantic-loss", "#ef4444");
    const closes = bars.map((bar) => bar.close);
    const priceFmt = { type: "custom" as const, minMove: 1e-12, formatter: formatPrice };
    const addLine = (pane: number, color: string, values: (number | null)[], fmt = priceFmt) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: fmt,
      }, pane);
      series.setData(bars.map((bar, i) => values[i] == null ? { time: bar.time as UTCTimestamp } : { time: bar.time as UTCTimestamp, value: values[i] as number }));
      made.push(series);
    };
    if (settings.sma.on) addLine(0, "#f59e0b", sma(closes, settings.sma.period));
    if (settings.ema.on) addLine(0, brand, ema(closes, settings.ema.period));
    if (settings.bb.on) {
      const bands = bollinger(closes, settings.bb.period, settings.bb.mult);
      addLine(0, "#a78bfa", bands.mid);
      addLine(0, "#a78bfa", bands.upper);
      addLine(0, "#a78bfa", bands.lower);
    }
    if (settings.vwap.on) addLine(0, "#22d3ee", vwap(bars));
    const osc = () => {
      const pane = chart.addPane();
      pane.setStretchFactor(1);
      return pane.paneIndex();
    };
    if (settings.volume.on && bars.length > 0) {
      const pane = osc();
      const series = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        lastValueVisible: false,
      }, pane);
      series.setData(bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.volume,
        color: bar.close >= bar.open ? brand : loss,
      })));
      made.push(series);
    }
    const numFmt = { type: "custom" as const, minMove: 0.01, formatter: (value: number) => value.toFixed(2) };
    if (settings.rsi.on) addLine(osc(), brand, rsi(closes, settings.rsi.period), numFmt);
    if (settings.macd.on) {
      const pane = osc();
      const points = macd(closes, settings.macd.fast, settings.macd.slow, settings.macd.signal);
      addLine(pane, brand, points.map((point) => point.macd), priceFmt);
      addLine(pane, "#f59e0b", points.map((point) => point.signal), priceFmt);
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: priceFmt }, pane);
      hist.setData(bars.flatMap((bar, i) => {
        const value = points[i]?.hist;
        return value == null ? [] : [{ time: bar.time as UTCTimestamp, value, color: value >= 0 ? brand : loss }];
      }));
      made.push(hist);
    }
    if (settings.stoch.on) {
      const pane = osc();
      const points = stochRsi(closes, settings.stoch.rsi, settings.stoch.stoch, settings.stoch.k, settings.stoch.d);
      addLine(pane, brand, points.map((point) => point.k), numFmt);
      addLine(pane, "#f59e0b", points.map((point) => point.d), numFmt);
    }
    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(3);
    return () => {
      try {
        for (const series of made) chart.removeSeries(series);
        const left = chart.panes();
        for (let i = left.length - 1; i >= 1; i--) chart.removePane(i);
      } catch {
        /* The price chart may already have been removed. */
      }
    };
  }, [chart, candle, bars, settings, theme]);

  useEffect(() => {
    if (!chart || !candle) return;
    const paint = (param: { time?: unknown; seriesData: Map<ISeriesApi<SeriesType>, unknown> }) => {
      const row = param.seriesData.get(candle) as { open?: number; high?: number; low?: number; close?: number } | undefined;
      const time = typeof param.time === "number" ? param.time : null;
      const bar = row && row.close != null
        ? bars.find((item) => item.time === time) ?? null
        : bars[bars.length - 1] ?? null;
      if (!bar) {
        setLegend(null);
        return;
      }
      const index = bars.findIndex((item) => item.time === bar.time);
      setLegend({ open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, index });
    };
    chart.subscribeCrosshairMove(paint);
    return () => chart.unsubscribeCrosshairMove(paint);
  }, [chart, candle, bars]);

  function place(clientX: number, clientY: number): Anchor | null {
    const node = plotRef.current;
    if (!chart || !candle || !node) return null;
    const rect = node.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const time = chart.timeScale().coordinateToTime(x);
    const price = candle.coordinateToPrice(y);
    if (typeof time !== "number" || price == null) return null;
    return magnet ? snapOhlc(bars, time, price) : { time, price };
  }

  function commit(next: Drawing[]) {
    setDrawings(next);
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement | HTMLDivElement>) {
    if (event.button !== 0) return;
    const point = place(event.clientX, event.clientY);
    if (!point) return;
    if (tool === "select") return;
    dragRef.current = { kind: "draw", tool, a: point };
    setDraft({ id: "draft", tool, a: point, b: point, locked: false });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement | HTMLDivElement>) {
    const drag = dragRef.current;
    const point = place(event.clientX, event.clientY);
    if (!drag || !point) return;
    if (drag.kind === "draw") {
      const b = drag.tool === "hline" || drag.tool === "hray" ? { time: point.time, price: drag.a.price } : drag.tool === "vline" ? { time: drag.a.time, price: point.price } : point;
      setDraft({ id: "draft", tool: drag.tool, a: drag.a, b, locked: false });
      return;
    }
    if (drag.kind === "end") {
      const next = drawings.map((item) => {
        if (item.id !== drag.id || item.locked) return item;
        const end = drag.end === "a" ? { ...item, a: point } : { ...item, b: point };
        if (item.tool === "hline" || item.tool === "hray") return { ...end, a: { ...end.a, price: point.price }, b: { ...end.b, price: point.price } };
        if (item.tool === "vline") return { ...end, a: { ...end.a, time: point.time }, b: { ...end.b, time: point.time } };
        return end;
      });
      commit(next);
      return;
    }
    const dt = point.time - drag.from.time;
    const dp = point.price - drag.from.price;
    commit(drawings.map((item) => item.id === drag.id && !item.locked ? {
      ...item,
      a: { time: drag.origin.a.time + dt, price: drag.origin.a.price + dp },
      b: { time: drag.origin.b.time + dt, price: drag.origin.b.price + dp },
    } : item));
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement | HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    const target = event.target;
    if (target instanceof Element && target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (drag?.kind === "draw") {
      const point = place(event.clientX, event.clientY) ?? drag.a;
      const b = drag.tool === "hline" || drag.tool === "hray" ? { time: point.time, price: drag.a.price } : drag.tool === "vline" ? { time: drag.a.time, price: point.price } : point;
      const id = nextDrawingId();
      const drawing = { id, tool: drag.tool, a: drag.a, b, locked: false };
      commit([...drawings, drawing]);
      setSelected(id);
      setDraft(null);
      setTool("select");
    }
  }

  function xy(anchor: Anchor): { x: number; y: number } | null {
    if (!chart || !candle) return null;
    const x = chart.timeScale().timeToCoordinate(anchor.time as UTCTimestamp);
    const y = candle.priceToCoordinate(anchor.price);
    if (x == null || y == null) return null;
    return { x, y };
  }

  function hit(item: Drawing, px: number, py: number): "a" | "b" | "body" | null {
    if (!chart || !candle) return null;
    if (item.tool === "hline" || item.tool === "hray") {
      const y = candle.priceToCoordinate(item.a.price);
      const x = chart.timeScale().timeToCoordinate(item.a.time as UTCTimestamp) ?? 0;
      if (y == null) return null;
      return Math.abs(py - y) <= 6 && (item.tool === "hline" || px >= x) ? "body" : null;
    }
    if (item.tool === "vline") {
      const x = chart.timeScale().timeToCoordinate(item.a.time as UTCTimestamp);
      if (x == null) return null;
      return Math.abs(px - x) <= 6 ? "body" : null;
    }
    const a = xy(item.a);
    const b = xy(item.b);
    if (!a || !b) return null;
    if (Math.hypot(px - a.x, py - a.y) <= 8) return "a";
    if (Math.hypot(px - b.x, py - b.y) <= 8) return "b";
    if (item.tool === "rect") {
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      const near = px >= x0 - 6 && px <= x1 + 6 && py >= y0 - 6 && py <= y1 + 6 && (px <= x0 + 6 || px >= x1 - 6 || py <= y0 + 6 || py >= y1 - 6);
      return near ? "body" : null;
    }
    if (item.tool === "fib") {
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      if (px < left - 6 || px > right + 6) return null;
      for (const level of fibPrices(item.a.price, item.b.price)) {
        const y = candle.priceToCoordinate(level.price);
        if (y != null && Math.abs(py - y) <= 6) return "body";
      }
      return null;
    }
    return segmentDistance(a.x, a.y, b.x, b.y, px, py) <= 6 ? "body" : null;
  }

  function onHitDown(event: React.PointerEvent<SVGElement>, item: Drawing) {
    if (tool !== "select") return;
    event.stopPropagation();
    const node = plotRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const where = hit(item, event.clientX - rect.left, event.clientY - rect.top);
    setSelected(item.id);
    if (!where || item.locked) return;
    const point = place(event.clientX, event.clientY);
    if (!point) return;
    dragRef.current = where === "body" ? { kind: "move", id: item.id, origin: item, from: point } : { kind: "end", id: item.id, end: where, origin: item };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function removeSelected() {
    const current = drawings.find((item) => item.id === selected);
    if (!current || current.locked) return;
    commit(drawings.filter((item) => item.id !== selected));
    setSelected(null);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelected();
    } else if (event.key === "Escape") {
      setTool("select");
      setDraft(null);
      setSelected(null);
      setMenu(false);
    }
  }

  const shown = draft ? [...drawings, draft] : drawings;
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const shownLegend = legend ?? (lastBar ? { open: lastBar.open, high: lastBar.high, low: lastBar.low, close: lastBar.close, volume: lastBar.volume, index: bars.length - 1 } : null);
  const values = shownLegend && settings ? legendValues(settings, bars, shownLegend.index) : [];
  const selectedDrawing = drawings.find((item) => item.id === selected) ?? null;

  return (
    <div
      ref={rootRef}
      data-indicators={settings ? enabledNames(settings).join(",") : ""}
      data-tool={tool}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      tabIndex={0}
      style={{ display: "flex", minHeight: 0, minWidth: 0, width: "100%", height: height ?? 480, outline: "none", background: "var(--color-bg-canvas)", position: "relative" }}
    >
      <div style={{ width: 40, flex: "none", display: "flex", flexDirection: "column", gap: 4, padding: 4, borderRight: "1px solid var(--color-border-subtle)" }}>
        {TOOLS.map((item) => (
          <button key={item.id} type="button" aria-label={text(item.key)} aria-pressed={tool === item.id} title={text(item.key)} onClick={() => { setTool(item.id); setMenu(false); }} style={iconBtn(tool === item.id)}>
            <ToolIcon id={item.id} />
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" aria-label={text("magnet")} aria-pressed={magnet} title={text("magnet")} onClick={() => setMagnet((on) => !on)} style={iconBtn(magnet)}>M</button>
        <button type="button" aria-label={text("lock")} aria-pressed={selectedDrawing?.locked ?? false} title={text("lock")} disabled={!selectedDrawing} onClick={() => selectedDrawing && commit(drawings.map((item) => item.id === selectedDrawing.id ? { ...item, locked: !item.locked } : item))} style={iconBtn(selectedDrawing?.locked ?? false)}>L</button>
        <button type="button" aria-label={text("delete")} title={text("delete")} onClick={removeSelected} style={iconBtn(false)}>
          <TrashIcon />
        </button>
        <button type="button" aria-label={text("clear")} title={text("clear")} onClick={() => { commit([]); setSelected(null); }} style={iconBtn(false)}>C</button>
      </div>
      <div ref={plotRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <div style={{ position: "absolute", zIndex: 3, top: 8, left: 8, right: 48, display: "flex", flexWrap: "wrap", gap: "2px 10px", pointerEvents: "none", fontFamily: "var(--font-mono), ui-monospace, monospace", fontSize: 12, color: "var(--color-text-secondary)", background: "color-mix(in srgb, var(--color-bg-canvas) 84%, transparent)", padding: "2px 6px" }}>
          {shownLegend && (
            <span>
              {text("open")} {formatPrice(shownLegend.open)} {text("high")} {formatPrice(shownLegend.high)} {text("low")} {formatPrice(shownLegend.low)} {text("close")} {formatPrice(shownLegend.close)} {text("vol")} {formatVolume(shownLegend.volume)}
            </span>
          )}
          {values.map((item) => <span key={item.name} style={{ color: item.color }}>{item.name} {item.value}</span>)}
        </div>
        <div style={{ position: "absolute", zIndex: 3, top: 6, right: 8, display: "flex", gap: 4 }}>
          <button type="button" aria-expanded={menu} aria-controls={menuId} onClick={() => setMenu((open) => !open)} style={textBtn(menu)}>{text("indicators")}</button>
          <button type="button" aria-label={full ? text("exitFullscreen") : text("fullscreen")} onClick={() => { if (full) void document.exitFullscreen(); else void rootRef.current?.requestFullscreen(); }} style={textBtn(full)}>{full ? "⤡" : "⤢"}</button>
        </div>
        {menu && settings && (
          <div id={menuId} role="dialog" aria-label={text("indicators")} style={{ position: "absolute", zIndex: 4, top: 40, right: 8, width: 260, maxHeight: "70%", overflow: "auto", background: "var(--color-bg-canvas)", border: "1px solid var(--color-border-default)", padding: 8, display: "grid", gap: 8 }}>
            <IndicatorRow label={text("sma")} on={settings.sma.on} onToggle={(on) => patch(setSettings, "sma", { on })} fields={[{ label: text("period"), value: settings.sma.period, set: (period) => patch(setSettings, "sma", { period }) }]} />
            <IndicatorRow label={text("ema")} on={settings.ema.on} onToggle={(on) => patch(setSettings, "ema", { on })} fields={[{ label: text("period"), value: settings.ema.period, set: (period) => patch(setSettings, "ema", { period }) }]} />
            <IndicatorRow label={text("bb")} on={settings.bb.on} onToggle={(on) => patch(setSettings, "bb", { on })} fields={[{ label: text("period"), value: settings.bb.period, set: (period) => patch(setSettings, "bb", { period }) }, { label: text("mult"), value: settings.bb.mult, set: (mult) => patch(setSettings, "bb", { mult }) }]} />
            <IndicatorRow label={text("vwap")} on={settings.vwap.on} onToggle={(on) => patch(setSettings, "vwap", { on })} fields={[]} />
            <IndicatorRow label={text("volume")} on={settings.volume.on} onToggle={(on) => patch(setSettings, "volume", { on })} fields={[]} />
            <IndicatorRow label={text("rsi")} on={settings.rsi.on} onToggle={(on) => patch(setSettings, "rsi", { on })} fields={[{ label: text("period"), value: settings.rsi.period, set: (period) => patch(setSettings, "rsi", { period }) }]} />
            <IndicatorRow label={text("macd")} on={settings.macd.on} onToggle={(on) => patch(setSettings, "macd", { on })} fields={[{ label: text("fast"), value: settings.macd.fast, set: (fast) => patch(setSettings, "macd", { fast }) }, { label: text("slow"), value: settings.macd.slow, set: (slow) => patch(setSettings, "macd", { slow }) }, { label: text("signal"), value: settings.macd.signal, set: (signal) => patch(setSettings, "macd", { signal }) }]} />
            <IndicatorRow label={text("stoch")} on={settings.stoch.on} onToggle={(on) => patch(setSettings, "stoch", { on })} fields={[{ label: text("period"), value: settings.stoch.rsi, set: (rsiPeriod) => patch(setSettings, "stoch", { rsi: rsiPeriod }) }, { label: text("k"), value: settings.stoch.k, set: (k) => patch(setSettings, "stoch", { k }) }, { label: text("d"), value: settings.stoch.d, set: (d) => patch(setSettings, "stoch", { d }) }]} />
          </div>
        )}
        <div ref={hostRef} data-chart-host data-bars={bars.length} style={{ height: "100%" }} />
        <svg
          data-draw-layer=""
          data-tick={tick}
          style={{ position: "absolute", inset: 0, zIndex: 2, width: "100%", height: "100%", overflow: "visible", pointerEvents: tool === "select" ? "none" : "auto" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {box.w > 0 && shown.map((item) => (
            <DrawingShape
              key={item.id}
              item={item}
              bars={bars}
              chart={chart}
              candle={candle}
              width={box.w}
              height={box.h}
              selected={item.id === selected}
              onDown={(event) => onHitDown(event, item)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

let drawingSeq = 0;
function nextDrawingId(): string {
  drawingSeq += 1;
  return `d${drawingSeq.toString(36)}`;
}

function patch<K extends keyof IndicatorSettings>(set: React.Dispatch<React.SetStateAction<IndicatorSettings | null>>, key: K, part: Partial<IndicatorSettings[K]>) {
  set((current) => current ? { ...current, [key]: { ...current[key], ...part } } : current);
}

function read(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(0);
}

function legendValues(settings: IndicatorSettings, bars: Bar[], index: number): { name: string; value: string; color: string }[] {
  if (index < 0 || !bars[index]) return [];
  const closes = bars.map((bar) => bar.close);
  const out: { name: string; value: string; color: string }[] = [];
  const push = (name: string, value: number | null, color: string) => {
    if (value == null) return;
    out.push({ name, value: formatPrice(value), color });
  };
  if (settings.sma.on) push(`SMA ${settings.sma.period}`, sma(closes, settings.sma.period)[index], "#f59e0b");
  if (settings.ema.on) push(`EMA ${settings.ema.period}`, ema(closes, settings.ema.period)[index], read("--color-brand-primary", "#FF7A1A"));
  if (settings.bb.on) {
    const bands = bollinger(closes, settings.bb.period, settings.bb.mult);
    push("BB", bands.mid[index], "#a78bfa");
  }
  if (settings.vwap.on) push("VWAP", vwap(bars)[index], "#22d3ee");
  if (settings.rsi.on) {
    const value = rsi(closes, settings.rsi.period)[index];
    if (value != null) out.push({ name: `RSI ${settings.rsi.period}`, value: value.toFixed(2), color: read("--color-brand-primary", "#FF7A1A") });
  }
  if (settings.macd.on) {
    const point = macd(closes, settings.macd.fast, settings.macd.slow, settings.macd.signal)[index];
    if (point?.macd != null) out.push({ name: "MACD", value: formatPrice(point.macd), color: read("--color-brand-primary", "#FF7A1A") });
  }
  return out;
}

function DrawingShape({
  item,
  bars,
  chart,
  candle,
  width,
  height,
  selected,
  onDown,
}: {
  item: Drawing;
  bars: { time: number }[];
  chart: IChartApi | null;
  candle: ISeriesApi<"Candlestick"> | null;
  width: number;
  height: number;
  selected: boolean;
  onDown: (event: React.PointerEvent<SVGElement>) => void;
}) {
  if (!chart || !candle) return null;
  const xOf = (time: number) => chart.timeScale().timeToCoordinate(time as UTCTimestamp);
  const yOf = (price: number) => candle.priceToCoordinate(price);
  const color = selected ? read("--color-brand-primary", "#FF7A1A") : read("--color-text-secondary", "#a1a1aa");
  const yA = yOf(item.a.price);
  const yB = yOf(item.b.price);
  const xA = xOf(item.a.time);
  const xB = xOf(item.b.time);
  const common = { stroke: color, fill: "none", strokeWidth: selected ? 2 : 1.5, "data-drawing": item.id, onPointerDown: onDown, style: { pointerEvents: "stroke" as const } };
  if ((item.tool === "hline" || item.tool === "hray") && yA != null) {
    const x = item.tool === "hray" ? (xA ?? 0) : 0;
    return <line {...common} x1={x} y1={yA} x2={width} y2={yA} />;
  }
  if (item.tool === "vline" && xA != null) return <line {...common} x1={xA} y1={0} x2={xA} y2={height} />;
  if (xA == null || xB == null || yA == null || yB == null) return null;
  if (item.tool === "rect") {
    return <rect {...common} x={Math.min(xA, xB)} y={Math.min(yA, yB)} width={Math.abs(xB - xA)} height={Math.abs(yB - yA)} fill={color} fillOpacity={0.08} />;
  }
  if (item.tool === "fib") {
    const left = Math.min(xA, xB);
    const right = Math.max(xA, xB);
    return (
      <g {...common}>
        {fibPrices(item.a.price, item.b.price).map((level) => {
          const y = yOf(level.price);
          if (y == null) return null;
          return (
            <g key={level.ratio}>
              <line x1={left} y1={y} x2={right} y2={y} stroke={color} />
              <text x={right + 4} y={y - 2} fill={color} fontSize={10} fontFamily="var(--font-mono), ui-monospace, monospace">{level.ratio} {formatPrice(level.price)}</text>
            </g>
          );
        })}
      </g>
    );
  }
  const label = item.tool === "measure" ? measureOf(bars, item.a, item.b) : null;
  return (
    <g {...common}>
      <line x1={xA} y1={yA} x2={xB} y2={yB} stroke={color} />
      {selected && <><circle cx={xA} cy={yA} r={4} fill={color} /><circle cx={xB} cy={yB} r={4} fill={color} /></>}
      {label && (
        <text x={(xA + xB) / 2} y={(yA + yB) / 2 - 6} fill={color} fontSize={11} fontFamily="var(--font-mono), ui-monospace, monospace">
          {formatPrice(label.price)} ({label.pct.toFixed(2)}%) · {label.bars}
        </text>
      )}
    </g>
  );
}

function IndicatorRow({ label, on, onToggle, fields }: { label: string; on: boolean; onToggle: (on: boolean) => void; fields: { label: string; value: number; set: (value: number) => void }[] }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={on} onChange={(event) => onToggle(event.target.checked)} />
        {label}
      </label>
      {on && fields.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {fields.map((field) => (
            <label key={field.label} style={{ display: "grid", fontSize: 11, color: "var(--color-text-secondary)" }}>
              {field.label}
              <input
                inputMode="decimal"
                value={field.value}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next)) field.set(next);
                }}
                style={{ width: 64, fontFamily: "var(--font-mono), ui-monospace, monospace", background: "transparent", color: "inherit", border: "1px solid var(--color-border-default)", padding: "2px 4px" }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function iconBtn(on: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
    border: "1px solid var(--color-border-subtle)",
    background: on ? "var(--color-brand-primary)" : "transparent",
    color: on ? "var(--color-bg-canvas)" : "var(--color-text-secondary)",
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    fontSize: 12,
  };
}

function textBtn(on: boolean): React.CSSProperties {
  return {
    border: "1px solid var(--color-border-subtle)",
    background: on ? "var(--color-brand-primary)" : "var(--color-bg-canvas)",
    color: on ? "var(--color-bg-canvas)" : "var(--color-text-primary)",
    fontSize: 12,
    padding: "4px 8px",
  };
}

function ToolIcon({ id }: { id: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5 };
  if (id === "select") return <svg {...common}><path d="M3 2l4 12 1.5-4.5L13 8z" /></svg>;
  if (id === "trend") return <svg {...common}><path d="M2 13L13 3" /><circle cx="2" cy="13" r="1.2" fill="currentColor" /><circle cx="13" cy="3" r="1.2" fill="currentColor" /></svg>;
  if (id === "hline") return <svg {...common}><path d="M1 8h14" /></svg>;
  if (id === "hray") return <svg {...common}><path d="M2 8h12" /><path d="M11 5l3 3-3 3" /></svg>;
  if (id === "vline") return <svg {...common}><path d="M8 1v14" /></svg>;
  if (id === "rect") return <svg {...common}><rect x="2.5" y="3" width="11" height="10" /></svg>;
  if (id === "fib") return <svg {...common}><path d="M2 4h12M2 8h12M2 12h12" /></svg>;
  return <svg {...common}><path d="M3 12l8-8" /><path d="M3 5v7h7" /></svg>;
}

function TrashIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V2h4v2M5 4l.5 10h5L11 4" /></svg>;
}
