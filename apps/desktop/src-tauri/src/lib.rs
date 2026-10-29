//! Sentra desktop core (Tauri v2). Prototype: mock data only (PRACTICE by default; SENTRA_MOCK_MODE=real previews Real chrome/gating, still mock).

mod commands;
mod error;
mod events;
mod hotkeys;
mod keychain;
mod mock;
mod model;
mod notify;
mod state;
mod util;
mod windows;

use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // Second launch just focuses the running terminal (avoids double global hotkeys).
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| windows::focus_main(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(hotkeys::plugin())
        .manage(state::AppState { engine: Mutex::new(state::Engine::new()) })
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
            mock::spawn(handle);
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sentra");
}
