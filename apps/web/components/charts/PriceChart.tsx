"use client";
/**
 * Coin price chart with entry/exit markers.
 * TradingView Lightweight Charts™ (Apache-2.0) — attribution logo kept on per TradingView's request.
 * Colours are read from the Sentra CSS tokens and re-applied on theme change.
 */
import { useEffect, useRef } from "react";
import { AreaSeries, createChart, createSeriesMarkers, type SeriesMarker, type Time, type UTCTimestamp } from "lightweight-charts";
import type { PricePoint, TradeEvent } from "@/lib/types";
import { readToken, tokenVar } from "@/lib/theme";

const TZ = "Asia/Jakarta";
const fmt = (sec: number, withSec: boolean) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", ...(withSec ? { second: "2-digit" } : {}), hour12: false }).format(sec * 1000);

export function PriceChart({ prices, events, height = 280 }: { prices: PricePoint[]; events: TradeEvent[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let dispose = () => {};
    const build = () => {
      dispose();
      const c = (n: string) => readToken(n);
      const chart = createChart(node, {
        height,
        autoSize: true,
        layout: { background: { color: c(tokenVar.surface) }, textColor: c(tokenVar.textSecondary), fontFamily: getComputedStyle(document.body).fontFamily, attributionLogo: true },
        grid: { vertLines: { color: c(tokenVar.borderSubtle) }, horzLines: { color: c(tokenVar.borderSubtle) } },
        rightPriceScale: { borderColor: c(tokenVar.borderSubtle) },
        timeScale: { borderColor: c(tokenVar.borderSubtle), timeVisible: true, secondsVisible: true, tickMarkFormatter: (t: Time) => fmt(Number(t), false) },
        localization: { timeFormatter: (t: Time) => `${fmt(Number(t), true)} WIB`, priceFormatter: (p: number) => `$${p.toPrecision(4)}` },
      });
      const brand = c(tokenVar.brand);
      const series = chart.addSeries(AreaSeries, { lineColor: brand, topColor: `${brand}55`, bottomColor: `${brand}00`, lineWidth: 2, priceLineVisible: false });
      const seen = new Set<number>();
      const data = prices
        .map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.priceUsd }))
        .sort((a, b) => a.time - b.time)
        .filter((d) => (seen.has(d.time) ? false : (seen.add(d.time), true)));
      series.setData(data);
      const snap = (sec: number) => data.reduce((best, d) => (Math.abs(d.time - sec) < Math.abs(best - sec) ? d.time : best), data[0]?.time ?? sec);
      const markers: SeriesMarker<Time>[] = events
        .filter((e) => e.kind === "bought" || e.kind === "sold")
        .sort((a, b) => a.ts - b.ts)
        .map((e) => {
          const buy = e.kind === "bought";
          const loss = (e.pnlSol ?? e.pctChange ?? 0) < 0;
          return {
            time: snap(Math.floor(e.ts / 1000)) as UTCTimestamp,
            position: buy ? "belowBar" : "aboveBar",
            shape: buy ? "arrowUp" : "arrowDown",
            color: buy ? c(tokenVar.profit) : loss ? c(tokenVar.loss) : c(tokenVar.info),
            text: buy ? "Buy" : e.partial ? "TP" : "Exit",
          };
        });
      createSeriesMarkers(series, markers);
      chart.timeScale().fitContent();
      dispose = () => chart.remove();
    };
    build();
    const mo = new MutationObserver(build);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mo.disconnect();
      dispose();
    };
  }, [prices, events, height]);

  return <div ref={el} style={{ height }} className="w-full" role="img" aria-label="Price chart with buy and exit markers (mock data)" />;
}
