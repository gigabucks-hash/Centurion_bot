//! Centurion desktop core (Tauri v2). Prototype: mock backend (wire v1.1) only (PRACTICE by default; CENTURION_MOCK_MODE=real previews Real chrome/gating, still mock).

mod auth;
mod backend;
mod brand;
mod commands;
mod config;
#[cfg(test)]
mod contract_tests;
mod deeplink;
mod errmap;
mod error;
mod events;
mod hotkeys;
mod keychain;
mod keys;
mod logo;
mod model;
mod notify;
mod real;
mod rejmap;
mod state;
mod stop;
mod strategy_mode;
mod sync;
mod tray;
mod util;
mod view;
mod windows;

use backend::Transport;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub fn run() {
    // Backend from the saved Settings file (Connection). A dev launcher's `CENTURION_BACKEND` env
    // var still wins. The mock's clock runs ahead (CENTURION_MOCK_SKEW_MS, default 2500 ms) so
    // countdowns provably use server_now.
    let skew = std::env::var("CENTURION_MOCK_SKEW_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(2_500);
    let (conn, load_error) = config::load();
    if let Some(page) = conn.login_page() {
        // `auth_login` reads this; the saved page is validated by `config::validate_login_url`.
        std::env::set_var("CENTURION_LOGIN_URL", page);
    }
    let transport = match backend::ActiveTransport::from_connection(&conn, skew) {
        Ok(t) => Arc::new(t),
        Err(e) => {
            // Never pretend "connected": start on the mock and surface the reason in Settings.
            log::error!("saved backend unusable, using mock: {e}");
            Arc::new(backend::ActiveTransport::Mock(
                backend::mock::MockTransport::new(skew),
            ))
        }
    };
    let mut engine = state::Engine::new(transport.workspace_id());
    engine.logo_origin = Some(transport.logo_origin());
    let app_state = state::AppState {
        engine: Mutex::new(engine),
        transport,
    };
    let conn_state = config::ConnectionState::new(conn, load_error);

    tauri::Builder::default()
        // Second launch just focuses the running terminal (avoids double global hotkeys).
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second launch focuses the running app; `--stop` (app-shortcut quick action) asks for a Stop.
            if stop::wants_stop(&argv) {
                stop::request(app, stop::StopSource::Shortcut);
            } else if let Some(url) = deeplink::url_in_argv(&argv) {
                // centurion://auth?code=&state= from the browser (OS URL handler launched us again).
                commands::handle_deep_link(app, url);
                windows::focus_main(app);
            } else {
                windows::focus_main(app);
            }
        }))
        .plugin(tauri_plugin_notification::init())
        // Windows desktop: check the latest GitHub release and install the signed update, then relaunch.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(hotkeys::plugin())
        .manage(app_state)
        .manage(conn_state)
        .manage(hotkeys::Bindings(Mutex::new(Vec::new())))
        .manage(deeplink::PendingLogins::default())
        .setup(|app| {
            let handle = app.handle().clone();
            // Coin logos (COIN_LOGO §2): only load from the proxy origin if the compiled CSP img-src
            // allows exactly it; otherwise identicons only (never a request the CSP would block).
            {
                let csp = serde_json::to_value(&app.config().app.security.csp).unwrap_or_default();
                let st = handle.state::<state::AppState>();
                let mut e = st.engine.lock().unwrap();
                if let Some(origin) = e.logo_origin.clone() {
                    if origin != logo::MOCK_ORIGIN && !logo::csp_allows_img(&csp, &origin) {
                        log::warn!("coin logos off: CSP img-src does not list {origin} (build with npm run tauri:build:backend)");
                        e.logo_origin = None;
                    }
                }
            }
            // Mock-only switch to preview REAL SOL chrome + gating. No wallet / network either way.
            if std::env::var("CENTURION_MOCK_MODE").as_deref() == Ok("real") {
                handle.state::<state::AppState>().engine.lock().unwrap().mode = model::Mode::Real;
                if let Some(w) = handle.get_webview_window("main") {
                    let _ = w.set_title(&format!("{} {}", notify::mode_prefix(model::Mode::Real), brand::app_name()));
                }
            }
            let cfg = handle.state::<state::AppState>().engine.lock().unwrap().settings.shortcuts.clone();
            if let Err(e) = hotkeys::apply(&handle, &cfg) {
                log::warn!("global shortcuts not registered: {e}");
            }
            if let Err(e) = tray::build(&handle) {
                log::warn!("tray not available: {e}");
            }
            // First launch from the quick action (`centurion-trade --stop`): ask once the UI is up.
            if stop::wants_stop(&std::env::args().collect::<Vec<_>>()) {
                let h = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                    stop::request(&h, stop::StopSource::Shortcut);
                });
            }
            let t = handle.state::<state::AppState>().transport.clone();
            t.start();
            sync::spawn(handle, t);
            commands::warm_real_lane();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::get_candles,
            commands::approve_signal,
            commands::skip_signal,
            commands::refresh_quote,
            commands::patch_strategy,
            commands::auth_status,
            commands::auth_login,
            commands::auth_logout,
            commands::connection_status,
            commands::save_connection,
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
            commands::set_strategy_mode,
            commands::reset_practice,
            commands::get_coin_timeline,
            commands::get_exit_reason_stats,
            commands::get_pnl_report,
            commands::get_pnl_page,
            commands::stop_trading,
            commands::resume_buys,
            commands::sell_all,
            commands::real_status,
            commands::real_enable_message,
            commands::real_limits_message,
            commands::real_enable,
            commands::real_apply,
            commands::real_set_rpc,
            commands::real_set_strategies,
            commands::real_sign,
            commands::real_prepare_swap,
            commands::real_submit,
            commands::real_prepare_sell_all,
            commands::real_submit_many,
            commands::real_set_fast_rpc,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Centurion Trade");
}
