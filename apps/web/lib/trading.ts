import type { TradingState } from "./types";

export interface TradingWire {
  buys_paused: boolean;
  buys_paused_via: string | null;
  buys_paused_at: string | null;
  agent_trade_enabled: boolean;
  rev: number;
}

/** Safe default while the paper API does not serve /trading yet (fail open: never claim a pause we cannot read). */
export const DEFAULT_TRADING: TradingState = {
  buysPaused: false, buysPausedVia: null, buysPausedAt: null, agentTradeEnabled: true, rev: 1,
};

export function tradingFromWire(w: TradingWire): TradingState {
  const at = w.buys_paused_at == null ? null : Date.parse(w.buys_paused_at);
  return {
    buysPaused: w.buys_paused, buysPausedVia: w.buys_paused_via ?? null,
    buysPausedAt: at != null && Number.isFinite(at) ? at : null,
    agentTradeEnabled: w.agent_trade_enabled, rev: w.rev,
  };
}
