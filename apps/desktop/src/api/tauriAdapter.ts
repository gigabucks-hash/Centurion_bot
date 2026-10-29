import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Candle, CoreApi, SellQuote, Settings, Snapshot } from "./contract";

/** Thin typed wrapper over Tauri IPC. Command names match #[tauri::command] fns in src-tauri/src/commands.rs. */
export const tauriAdapter: CoreApi = {
  snapshot: () => invoke<Snapshot>("get_snapshot"),
  candles: (mint) => invoke<Candle[]>("get_candles", { mint }),
  approveSignal: (id) => invoke<void>("approve_signal", { id }),
  approveMany: (ids) => invoke<void>("approve_many", { ids }),
  skipSignal: (id) => invoke<void>("skip_signal", { id }),
  requestSell: (mint, pct) => invoke<SellQuote>("request_sell", { mint, pct }),
  confirmSell: (nonce) => invoke<void>("confirm_sell", { nonce }),
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
