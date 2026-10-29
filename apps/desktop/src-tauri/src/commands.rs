//! IPC surface. Each command is individually permissioned (see build.rs + capabilities/).
//! Commands validate input, mutate `Engine` under the lock, then dispatch events.

use crate::error::{AppError, AppResult};
use crate::events::dispatch;
use crate::model::*;
use crate::state::AppState;
use crate::util::is_valid_mint;
use tauri::{AppHandle, Emitter, Runtime, State, Window};

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> Snapshot {
    state.engine.lock().unwrap().snapshot()
}

#[tauri::command]
pub fn get_candles(state: State<'_, AppState>, mint: String) -> AppResult<Vec<Candle>> {
    if !is_valid_mint(&mint) {
        return Err(AppError::Invalid("mint".into()));
    }
    Ok(state.engine.lock().unwrap().candles(&mint))
}

#[tauri::command]
pub fn approve_signal<R: Runtime>(app: AppHandle<R>, window: Window<R>, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let outs = {
        let mut e = state.engine.lock().unwrap();
        crate::state::check_approve_origin(window.label(), e.mode)?;
        e.approve(&id)?
    };
    dispatch(&app, outs);
    Ok(())
}

#[tauri::command]
pub fn skip_signal<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let outs = state.engine.lock().unwrap().skip(&id)?;
    dispatch(&app, outs);
    Ok(())
}

#[tauri::command]
pub fn request_sell(state: State<'_, AppState>, mint: String, pct: u8) -> AppResult<SellQuote> {
    if !is_valid_mint(&mint) {
        return Err(AppError::Invalid("mint".into()));
    }
    state.engine.lock().unwrap().request_sell(&mint, pct)
}

#[tauri::command]
pub fn confirm_sell<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, nonce: String) -> AppResult<()> {
    let outs = state.engine.lock().unwrap().confirm_sell(&nonce)?;
    dispatch(&app, outs);
    Ok(())
}

#[tauri::command]
pub fn open_chart_window<R: Runtime>(app: AppHandle<R>, mint: String) -> AppResult<()> {
    crate::windows::open_chart(&app, &mint)
}

#[tauri::command]
pub fn open_activity_window<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    crate::windows::open_activity(&app)
}

#[tauri::command]
pub fn approve_many<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, ids: Vec<String>) -> AppResult<()> {
    if ids.len() > 20 {
        return Err(AppError::Invalid("max 20 per batch".into()));
    }
    let outs = state.engine.lock().unwrap().approve_many(&ids)?;
    dispatch(&app, outs);
    Ok(())
}

#[tauri::command]
pub fn open_approval_window<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    crate::windows::open_approval_popup(&app, true)
}

#[tauri::command]
pub fn set_settings<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, mut settings: Settings) -> AppResult<Settings> {
    // C19: popup cannot be enabled where the no-focus-steal test has not passed yet.
    settings.approval_popup &= crate::windows::POPUP_SUPPORTED;
    crate::hotkeys::apply(&app, &settings.shortcuts)?;
    state.engine.lock().unwrap().settings = settings.clone();
    if !settings.approval_popup {
        crate::windows::close_approval_popup(&app);
    }
    dispatch(&app, vec![crate::events::Out::Settings(settings.clone())]);
    Ok(settings)
}

/// Popup → main hand-off ("Buka untuk approve ↗"): focus the terminal and ask it to open the
/// pick with the normal confirmation. Never approves anything itself.
#[tauri::command]
pub fn focus_main_for_signal<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let known = state.engine.lock().unwrap().signals.iter().any(|s| s.id == id);
    if !known {
        return Err(AppError::SignalNotPending);
    }
    crate::windows::focus_main(&app);
    app.emit_to("main", crate::events::FOCUS_SIGNAL, &id)?;
    Ok(())
}

/// Esc in the popup: hide until the next new pick (no window-API permission needed in the popup).
#[tauri::command]
pub fn hide_approval_popup<R: Runtime>(app: AppHandle<R>) {
    crate::windows::hide_approval_popup(&app);
}
