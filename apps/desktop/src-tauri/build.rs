fn main() {
    // Declaring app commands here makes Tauri generate `allow-<command>` permissions,
    // so each window only gets the commands its capability file grants (deny by default).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_snapshot",
            "get_candles",
            "approve_signal",
            "skip_signal",
            "request_sell",
            "confirm_sell",
            "open_chart_window",
            "open_activity_window",
            "approve_many",
            "open_approval_window",
            "set_settings",
            "focus_main_for_signal",
            "hide_approval_popup",
        ]),
    ))
    .expect("failed to run tauri-build");
}
