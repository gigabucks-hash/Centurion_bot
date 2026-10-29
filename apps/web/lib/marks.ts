import type { MarkMessage } from "@sentra/contracts/wire";
import type { OpenPosition } from "./types";

/**
 * Display-only mark → position view (marks are never persisted and never drive a decision). The position value
 * scales with price_usd / the server's nowPriceUsd, so PnL stays consistent with the REST snapshot (fees included).
 * Ignores marks for other mints, non-finite or non-positive prices, and marks older than the snapshot.
 */
export function applyMark(p: OpenPosition, m: MarkMessage | undefined): OpenPosition {
  if (!m || m.mint !== p.mint || !(p.nowPriceUsd > 0)) return p;
  const usd = Number(m.price_usd);
  if (!Number.isFinite(usd) || usd <= 0) return p;
  const ratio = usd / p.nowPriceUsd;
  const value = p.solIn * (1 + p.pnlPct / 100) * ratio;
  const pnlSol = value - p.solIn;
  return { ...p, nowPriceUsd: usd, pnlSol, pnlPct: p.solIn > 0 ? (pnlSol / p.solIn) * 100 : p.pnlPct };
}
