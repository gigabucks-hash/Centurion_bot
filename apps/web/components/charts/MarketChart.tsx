"use client";
/**
 * GeckoTerminal candles (free, no key) with the bot's own entry, take-profit, stop, and exit marks.
 * TradingView Lightweight Charts™ stays attributed. GeckoTerminal is named under the chart.
 */
import { useEffect, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PricePoint, TradeEvent } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import { readToken, tokenVar } from "@/lib/theme";
import { formatPrice, visibleRange } from "@explore/candles";
import { PriceChart } from "./PriceChart";

const TFS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Tf = (typeof TFS)[number];

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartBody {
  ok: boolean;
  reason: string;
  candles: Candle[];
  pool: string | null;
  pair: string | null;
  solSide: "base" | "quote" | null;
  currency: "usd" | "sol";
  attribution: string | null;
}

function markOf(e: TradeEvent): "Entry" | "TP" | "SL" | "Exit" | null {
  if (e.kind === "bought") return "Entry";
  if (e.kind !== "sold") return null;
  if (e.partial || e.exitReason === "profit_target") return "TP";
  if (e.exitReason === "loss_guard" || e.exitReason === "peak_trail" || e.exitReason === "sell_floor") return "SL";
  return "Exit";
}

export function MarketChart({ mint, events, fallback, symbol }: { mint: string; events: TradeEvent[]; fallback: PricePoint[]; symbol?: string }) {
  const t = useT();
  const [tf, setTf] = useState<Tf>("5m");
  const [currency, setCurrency] = useState<"usd" | "sol">("usd");
  const [body, setBody] = useState<ChartBody | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "down">("loading");
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let stop = false;
      const pull = () => {
      const q = new URLSearchParams({ mint, tf, currency });
      void fetch(`/api/market/candles?${q}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((json: ChartBody | null) => {
          if (stop) return;
          setBody(json);
          setPhase(json?.ok ? "ready" : "down");
        })
        .catch(() => { if (!stop) setPhase("down"); });
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

  const solOk = body?.solSide != null;
  const candles = body?.ok ? body.candles : [];

  useEffect(() => {
    if (!node || candles.length === 0) return;
    const c = (name: string) => readToken(name);
    const up = c(tokenVar.brand);
    const down = c(tokenVar.loss);
    const chart = createChart(node, {
      height: 360,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: c(tokenVar.surface) },
        textColor: c(tokenVar.textSecondary),
        fontFamily: getComputedStyle(document.body).fontFamily,
        attributionLogo: true,
      },
      grid: { vertLines: { color: c(tokenVar.borderSubtle) }, horzLines: { color: c(tokenVar.borderSubtle) } },
      rightPriceScale: { borderColor: c(tokenVar.borderSubtle), scaleMargins: { top: 0.08, bottom: 0.22 } },
      localization: { priceFormatter: formatPrice },
      timeScale: { borderColor: c(tokenVar.borderSubtle), timeVisible: tf !== "1d", secondsVisible: false, barSpacing: 8, rightOffset: 2 },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false,
      priceFormat: { type: "custom", minMove: 1e-12, formatter: formatPrice },
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    series.setData(candles.map((bar) => ({ time: bar.time as UTCTimestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
    volume.setData(candles.map((bar) => ({
      time: bar.time as UTCTimestamp,
      value: bar.volume,
      color: bar.close >= bar.open ? up : down,
    })));
    const times = candles.map((bar) => bar.time);
    const snap = (sec: number) => times.reduce((best, t0) => (Math.abs(t0 - sec) < Math.abs(best - sec) ? t0 : best), times[0]);
    const markers: SeriesMarker<Time>[] = events.flatMap((e) => {
      const label = markOf(e);
      if (!label || !Number.isFinite(e.ts)) return [];
      const color = label === "Entry" ? up : label === "TP" ? c(tokenVar.profit) : label === "SL" ? down : c(tokenVar.info);
      return [{
        time: snap(Math.floor(e.ts / 1000)) as UTCTimestamp,
        position: label === "Entry" ? "belowBar" as const : "aboveBar" as const,
        shape: label === "Entry" ? "arrowUp" as const : "arrowDown" as const,
        color,
        text: label,
      }];
    }).sort((a, b) => Number(a.time) - Number(b.time));
    createSeriesMarkers(series, markers);
    chart.timeScale().applyOptions({ barSpacing: 8, rightOffset: 2 });
    chart.timeScale().setVisibleLogicalRange(visibleRange(candles.length, node.clientWidth || 960));
    node.dataset.bars = String(candles.length);
    const mo = new MutationObserver(() => {
      const nextUp = readToken(tokenVar.brand);
      const nextDown = readToken(tokenVar.loss);
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: readToken(tokenVar.surface) }, textColor: readToken(tokenVar.textSecondary) },
        grid: { vertLines: { color: readToken(tokenVar.borderSubtle) }, horzLines: { color: readToken(tokenVar.borderSubtle) } },
      });
      series.applyOptions({ upColor: nextUp, downColor: nextDown, wickUpColor: nextUp, wickDownColor: nextDown });
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mo.disconnect();
      chart.remove();
    };
    // candles is body.candles when the chart is live, so it changes only with the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, body, events, currency, tf]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("trail.price")} className="flex gap-0.5">
          {TFS.map((item) => (
            <button key={item} type="button" aria-pressed={item === tf} onClick={() => setTf(item)} className={`rounded-md px-2 py-1 text-caption ${item === tf ? "bg-bg-raised text-brand-primary" : "text-text-tertiary hover:text-text-primary"}`}>{item}</button>
          ))}
        </div>
        <div role="group" aria-label={t("trail.marketQuote")} className="ml-auto flex gap-0.5">
          {(["usd", "sol"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={currency === item} disabled={item === "sol" && body != null && !solOk} onClick={() => setCurrency(item)} className={`rounded-md px-2 py-1 text-caption ${currency === item ? "bg-bg-raised text-brand-primary" : "text-text-tertiary hover:text-text-primary"} disabled:opacity-40`}>{item === "usd" ? t("trail.marketUsd") : t("trail.marketSol")}</button>
          ))}
        </div>
      </div>
      <p className="mb-2 text-caption text-text-secondary">
        {[symbol ? `$${symbol}` : null, body?.pair, tf, currency.toUpperCase(), "GeckoTerminal"].filter(Boolean).join(" · ")}
      </p>
      {candles.length > 0 ? <div ref={setNode} className="h-[360px] w-full" role="img" aria-label={t("trail.marketChart")} /> : phase === "loading" ? (
        <p className="py-16 text-center text-caption text-text-tertiary" role="status">{t("trail.marketLoading")}</p>
      ) : (
        <>
          <p className="mb-2 text-caption text-text-secondary" role="status">{t("trail.marketNote")}</p>
          {fallback.length > 1 ? <PriceChart prices={fallback} events={events} /> : <p className="text-body text-text-secondary">{t("trail.noPrice")}</p>}
        </>
      )}
      {body?.attribution && (
        <p className="mt-2 text-caption text-text-tertiary">
          <a href={body.attribution} target="_blank" rel="noreferrer" className="hover:text-text-primary hover:underline">{t("trail.marketBy")}</a>
        </p>
      )}
    </div>
  );
}
