import type { MarkMessage } from "@centurion/contracts/wire";
import type { OpenPosition } from "./types";

/**
 * Display-only mark → position view (marks are never persisted and never drive a decision).
 *
 * Realtime scaling uses the SOL mark against the SOL mark already on the row, so it works without a SOL/USD
 * rate (the paper REST wire has none). The old USD ratio is only a fallback for mock rows, where both prices
 * come from the same mock table. Marks for other mints, non-finite/non-positive prices, and rows with no
 * baseline are ignored, and a mark never invents a USD price.
 */
export function applyMark(p: OpenPosition, m: MarkMessage | undefined): OpenPosition {
  if (!m || m.mint !== p.mint) return p;
  const markSol = Number(m.price_sol);
  const baseSol = p.nowPriceSol ?? null;
  const hasSol = Number.isFinite(markSol) && markSol > 0 && baseSol != null && Number.isFinite(baseSol) && baseSol > 0;
  const markUsd = Number(m.price_usd);
  const hasUsd = !hasSol && Number.isFinite(markUsd) && markUsd > 0 && p.nowPriceUsd > 0;
  const ratio = hasSol ? markSol / (baseSol as number) : hasUsd ? markUsd / p.nowPriceUsd : null;
  if (ratio == null) return p;
  const value = p.solIn * (1 + p.pnlPct / 100) * ratio;
  const pnlSol = value - p.solIn;
  return {
    ...p,
    ...(hasSol ? { nowPriceSol: markSol } : { nowPriceUsd: markUsd }),
    pnlSol,
    pnlPct: p.solIn > 0 ? (pnlSol / p.solIn) * 100 : p.pnlPct,
  };
}
