import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { CandleView, CoreApi, ExitReasonStatView, SellQuote, Settings, Snapshot, StrategyView, TimelineItem } from "./contract";

/** Thin typed wrapper over Tauri IPC. Commands use snake_case args (`#[tauri::command(rename_all = "snake_case")]`). */
export const tauriAdapter: CoreApi = {
  snapshot: () => invoke<Snapshot>("get_snapshot"),
  candles: (mint) => invoke<CandleView[]>("get_candles", { mint }),
  approveSignal: (id) => invoke<void>("approve_signal", { id }),
  approveMany: (ids) => invoke<void>("approve_many", { ids }),
  skipSignal: (id) => invoke<void>("skip_signal", { id }),
  requestSell: (positionKey, pct) => invoke<SellQuote>("request_sell", { position_key: positionKey, pct }),
  confirmSell: (nonce) => invoke<void>("confirm_sell", { nonce }),
  setStrategyPaused: (id, paused, baseRev) => invoke<StrategyView>("set_strategy_paused", { id, paused, base_rev: baseRev }),
  resetPractice: () => invoke<void>("reset_practice"),
  coinTimeline: (mint) => invoke<TimelineItem[]>("get_coin_timeline", { mint }),
  exitReasonStats: () => invoke<ExitReasonStatView[]>("get_exit_reason_stats"),
  openChartWindow: (mint) => invoke<void>("open_chart_window", { mint }),
  openActivityWindow: () => invoke<void>("open_activity_window"),
  openApprovalWindow: () => invoke<void>("open_approval_window"),
  focusMainForSignal: (id) => invoke<void>("focus_main_for_signal", { id }),
  hideApprovalPopup: () => invoke<void>("hide_approval_popup"),
  setSettings: (settings: Settings) => invoke<Settings>("set_settings", { settings }),
  on: async (event, cb) => {
    const un = await listen(event, (e) => cb(e.payload as never));
    return un;
  },
};
