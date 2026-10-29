"use client";
import dynamic from "next/dynamic";

/**
 * Perf: lightweight-charts (~55 KB gzip, canvas) is split out of the route bundle and loaded after hydration,
 * client-only (it needs the DOM). The skeleton reserves the exact chart height so nothing shifts (CLS).
 */
export const PriceChart = dynamic(() => import("./PriceChart").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full animate-pulse rounded-md bg-bg-sunken" aria-hidden />,
});
