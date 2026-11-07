import type { TradingState } from "../types";
import { WireError } from "./store";

const g = globalThis as unknown as { __centurionTrading?: Map<string, TradingState> };
const states = (g.__centurionTrading ??= new Map());
export function getTradingState(ws = "ws_mock"): TradingState {
  const state = states.get(ws) ?? { buysPaused: false, buysPausedVia: null, buysPausedAt: null, agentTradeEnabled: true, rev: 1 };
  states.set(ws, state);
  return { ...state };
}
function setPaused(paused: boolean, rev: number | null, ws: string): TradingState {
  const state = getTradingState(ws);
  if (rev !== state.rev) throw new WireError("VERSION_CONFLICT", { current_rev: state.rev, current: tradingToWire(state) });
  // Repeating an already-applied intent with the current revision is a no-op.
  if (state.buysPaused === paused) return state;
  const next = { ...state, buysPaused: paused, buysPausedVia: paused ? "web" : null, buysPausedAt: paused ? Date.now() : null, rev: state.rev + 1 };
  states.set(ws, next);
  return { ...next };
}
export const pauseBuys = (rev: number | null, ws = "ws_mock") => setPaused(true, rev, ws);
export const resumeBuys = (rev: number | null, ws = "ws_mock") => setPaused(false, rev, ws);
export function tradingToWire(s: TradingState) {
  return { buys_paused: s.buysPaused, buys_paused_via: s.buysPausedVia, buys_paused_at: s.buysPausedAt == null ? null : new Date(s.buysPausedAt).toISOString(), agent_trade_enabled: s.agentTradeEnabled, rev: s.rev };
}
