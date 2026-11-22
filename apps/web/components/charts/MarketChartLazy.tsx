"use client";
import dynamic from "next/dynamic";
import type { PricePoint, TradeEvent } from "@/lib/types";

const Chart = dynamic(() => import("./MarketChart").then((m) => m.MarketChart), {
  ssr: false,
  loading: () => <div className="h-[360px] w-full" />,
});

export function MarketChart(props: { mint: string; events: TradeEvent[]; fallback: PricePoint[] }) {
  return <Chart {...props} />;
}
