import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AuthView, StopResult, CandleView, ClosedPageView, ConnectionView, CoreApi, PatchOutcome, ExitReasonStatView, PnlReportView, PnlWindow, SaveConnectionResult, SellQuote, Settings, Snapshot, StrategyView, TimelineItem } from "./contract";
import type { RealStatus, WireKnobs } from "../real/limits";

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
  setStrategyMode: (id, mode, holdMs) => invoke<StrategyView>("set_strategy_mode", { id, mode, hold_ms: Math.max(0, Math.round(holdMs)) }),
  resetPractice: () => invoke<void>("reset_practice"),
  coinTimeline: (mint) => invoke<TimelineItem[]>("get_coin_timeline", { mint }),
  exitReasonStats: () => invoke<ExitReasonStatView[]>("get_exit_reason_stats"),
  pnlReport: (window: PnlWindow) => invoke<PnlReportView>("get_pnl_report", { window }),
  pnlReportPage: ({ window, from, to, cursor }) => invoke<ClosedPageView>("get_pnl_page", { window, from, to, cursor }),
  openChartWindow: (mint) => invoke<void>("open_chart_window", { mint }),
  openActivityWindow: () => invoke<void>("open_activity_window"),
  openApprovalWindow: () => invoke<void>("open_approval_window"),
  focusMainForSignal: (id) => invoke<void>("focus_main_for_signal", { id }),
  hideApprovalPopup: () => invoke<void>("hide_approval_popup"),
  setSettings: (settings: Settings) => invoke<Settings>("set_settings", { settings }),
  refreshQuote: (id) => invoke<void>("refresh_quote", { id }),
  patchStrategy: (id, settingsPatch) => invoke<PatchOutcome>("patch_strategy", { id, settings_patch: settingsPatch }),
  authStatus: () => invoke<AuthView>("auth_status"),
  authLogin: () => invoke<void>("auth_login"),
  authLogout: () => invoke<void>("auth_logout"),
  connectionStatus: () => invoke<ConnectionView>("connection_status"),
  saveConnection: (c) => invoke<SaveConnectionResult>("save_connection", { backend: c.backend, login_url: c.login_url }),
  stopTrading: (mode, source, confirm) => invoke<StopResult>("stop_trading", { mode, source, confirm }),
  resumeBuys: () => invoke<boolean>("resume_buys"),
  sellAll: (confirm) => invoke("sell_all", { confirm }),
  realStatus: () => invoke<RealStatus>("real_status"),
  realEnableMessage: (wallet) => invoke<string>("real_enable_message", { wallet }),
  realLimitsMessage: (scope, knobs: WireKnobs) => invoke<string>("real_limits_message", { scope, knobs }),
  realEnable: (wallet, signature) => invoke<RealStatus>("real_enable", { wallet, signature }),
  realApply: (scope, knobs: WireKnobs, signature) => invoke<RealStatus>("real_apply", { scope, knobs, signature }),
  realSetRpc: (url) => invoke<RealStatus>("real_set_rpc", { url }),
  realSetStrategies: (ids) => invoke<RealStatus>("real_set_strategies", { ids }),
  realSign: (kind, payload) => invoke<string>("real_sign", { kind, payload }),
  on: async (event, cb) => {
    const un = await listen(event, (e) => cb(e.payload as never));
    return un;
  },
};
