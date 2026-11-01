//! Multi-window management. One frontend bundle; the hash route picks the view.
//! Labels are deterministic so re-opening focuses the existing window.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::util::is_valid_mint;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const APPROVAL_LABEL: &str = crate::state::POPUP_LABEL;

pub fn open_chart<R: Runtime>(app: &AppHandle<R>, mint: &str) -> AppResult<()> {
    // Mint goes into a label and URL: validate strictly (base58 only) first.
    if !is_valid_mint(mint) {
        return Err(AppError::Invalid("mint".into()));
    }
    let label = format!("chart-{}", &mint[..12]);
    if let Some(w) = app.get_webview_window(&label) {
        w.show()?;
        w.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App(format!("index.html#/chart?mint={mint}").into()))
        .title(format!("{} {} — Chart {}…", prefix(app), crate::brand::app_name(), &mint[..6]))
        .inner_size(960.0, 600.0)
        .min_inner_size(480.0, 320.0)
        .build()?;
    Ok(())
}

pub fn open_activity<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(w) = app.get_webview_window("activity") {
        w.show()?;
        w.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "activity", WebviewUrl::App("index.html#/activity".into()))
        .title(format!("{} {} — Activity", prefix(app), crate::brand::app_name()))
        .inner_size(520.0, 760.0)
        .build()?;
    Ok(())
}

/// Opt-in always-on-top approval popup (UX DESKTOP_COMPACT_AND_POPUP §4 / WF-13).
/// 360×232 fixed, undecorated, no taskbar entry, bottom-right of the main window's monitor
/// work area (16 px margin). Auto-shows WITHOUT activation (`focus = false`): keyboard stays in
/// the user's other app; popup shortcuts only work after the user clicks it.
/// Approve/Skip only — never Sell/batch (capabilities/approval.json) and no Approve in REAL
/// (`state::check_approve_origin`).
/// C19 test gate: the no-activation popup is only verified on Linux. Windows/macOS keep it
/// disabled until MILESTONES W-NOFOCUS passes there (fallback: OS notifications only).
pub const POPUP_SUPPORTED: bool = cfg!(target_os = "linux");

pub fn open_approval_popup<R: Runtime>(app: &AppHandle<R>, focus: bool) -> AppResult<()> {
    if !POPUP_SUPPORTED {
        return Err(AppError::Invalid("popup dinonaktifkan di OS ini sampai tes W-NOFOCUS lulus".into()));
    }
    let w = match app.get_webview_window(APPROVAL_LABEL) {
        Some(w) => w,
        None => {
            let b = WebviewWindowBuilder::new(app, APPROVAL_LABEL, WebviewUrl::App("index.html#/popup".into()))
                .title(format!("{} {} — Approval", prefix(app), crate::brand::app_name()))
                .inner_size(POPUP_W, POPUP_H)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .decorations(false)
                .shadow(true)
                .always_on_top(true)
                .visible_on_all_workspaces(true)
                .skip_taskbar(true)
                .theme(Some(tauri::Theme::Dark))
                .visible(false)
                .focused(false);
            #[cfg(target_os = "macos")]
            let b = b.accept_first_mouse(false); // first click only focuses the popup
            b.build()?
        }
    };
    if !w.is_visible().unwrap_or(false) {
        place_bottom_right(app, &w);
    }
    // Windows: show() must not call SetForegroundWindow; see MILESTONES W-NOFOCUS test item.
    w.show()?;
    if focus {
        w.set_focus()?;
    }
    Ok(())
}

const POPUP_W: f64 = 360.0;
const POPUP_H: f64 = 232.0;
const POPUP_MARGIN: f64 = 16.0;

fn place_bottom_right<R: Runtime>(app: &AppHandle<R>, w: &tauri::WebviewWindow<R>) {
    let mon = app
        .get_webview_window("main")
        .and_then(|m| m.current_monitor().ok().flatten())
        .or_else(|| w.primary_monitor().ok().flatten());
    if let Some(m) = mon {
        let sf = m.scale_factor();
        let wa = m.work_area(); // excludes taskbar/dock where the OS reports it
        let x = wa.position.x + wa.size.width as i32 - ((POPUP_W + POPUP_MARGIN) * sf) as i32;
        let y = wa.position.y + wa.size.height as i32 - ((POPUP_H + POPUP_MARGIN) * sf) as i32;
        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

pub fn hide_approval_popup<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(APPROVAL_LABEL) {
        let _ = w.hide();
    }
}

/// Hide after `ms` if the queue is still empty (lets the "Expired · waktu habis" notice show).
pub fn hide_approval_popup_later<R: Runtime>(app: &AppHandle<R>, ms: u64) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
        let empty = !app.state::<AppState>().engine.lock().unwrap().signals.iter().any(|s| s.status == crate::model::ProposalStatus::Pending);
        if empty {
            hide_approval_popup(&app);
        }
    });
}

pub fn close_approval_popup<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(APPROVAL_LABEL) {
        let _ = w.close();
    }
}

pub fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// UX: every window title carries the mode prefix.
fn prefix<R: Runtime>(app: &AppHandle<R>) -> &'static str {
    let mode = app.state::<AppState>().engine.lock().unwrap().mode;
    crate::notify::mode_prefix(mode)
}
