//! Sentra desktop core (Tauri v2). Prototype: mock backend (wire v1.1) only (PRACTICE by default; SENTRA_MOCK_MODE=real previews Real chrome/gating, still mock).

mod backend;
mod commands;
#[cfg(test)]
mod contract_tests;
mod errmap;
mod error;
mod events;
mod hotkeys;
mod keychain;
mod keys;
mod model;
mod notify;
mod state;
mod sync;
mod util;
mod view;
mod windows;

use backend::Transport;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // Second launch just focuses the running terminal (avoids double global hotkeys).
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| windows::focus_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(hotkeys::plugin())
        .manage({
            // Mock backend speaking wire v1.1. Its clock runs ahead (SENTRA_MOCK_SKEW_MS, default
            // 2500 ms) so countdowns provably use server_now. Week 2: HttpTransport (SSE + REST).
            let skew = std::env::var("SENTRA_MOCK_SKEW_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(2_500);
            let transport = Arc::new(backend::ActiveTransport::from_env(skew));
            state::AppState { engine: Mutex::new(state::Engine::new(transport.workspace_id())), transport }
        })
        .manage(hotkeys::Bindings(Mutex::new(Vec::new())))
        .setup(|app| {
            let handle = app.handle().clone();
            // Mock-only switch to preview REAL SOL chrome + gating. No wallet / network either way.
            if std::env::var("SENTRA_MOCK_MODE").as_deref() == Ok("real") {
                handle.state::<state::AppState>().engine.lock().unwrap().mode = model::Mode::Real;
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.set_title(&format!("{} Sentra — Terminal (mock)", notify::mode_prefix(model::Mode::Real)));
                }
            }
            let cfg = handle.state::<state::AppState>().engine.lock().unwrap().settings.shortcuts.clone();
            if let Err(e) = hotkeys::apply(&handle, &cfg) {
                log::warn!("global shortcuts not registered: {e}");
            }
            let t = handle.state::<state::AppState>().transport.clone();
            t.start();
            sync::spawn(handle, t);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::get_candles,
            commands::approve_signal,
            commands::skip_signal,
            commands::request_sell,
            commands::confirm_sell,
            commands::open_chart_window,
            commands::open_activity_window,
            commands::approve_many,
            commands::open_approval_window,
            commands::set_settings,
            commands::focus_main_for_signal,
            commands::hide_approval_popup,
            commands::set_strategy_paused,
            commands::reset_practice,
            commands::get_coin_timeline,
            commands::get_exit_reason_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sentra");
}
