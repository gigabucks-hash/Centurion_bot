//! OS-wide (global) shortcuts via tauri-plugin-global-shortcut, handled entirely in Rust
//! so they work even when the webview is hidden/minimised. Window-local keys (J/K/A/S/X/⇧A…)
//! live in the frontend. Per UX Tauri README: global shortcuts only OPEN UI (terminal /
//! approval queue) — they never approve, skip or sell.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::view::ShortcutConfig;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Focus,
    OpenApprovals,
}

/// Currently registered (shortcut, action) pairs.
pub struct Bindings(pub Mutex<Vec<(Shortcut, Action)>>);

pub fn plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let action = {
                let b = app.state::<Bindings>();
                let v = b.0.lock().unwrap();
                v.iter().find(|(s, _)| s == shortcut).map(|(_, a)| *a)
            };
            if let Some(a) = action {
                handle(app, a);
            }
        })
        .build()
}

fn handle<R: Runtime>(app: &AppHandle<R>, a: Action) {
    match a {
        Action::Focus => crate::windows::focus_main(app),
        Action::OpenApprovals => {
            let popup = app
                .state::<AppState>()
                .engine
                .lock()
                .unwrap()
                .settings
                .approval_popup;
            if popup && crate::windows::POPUP_SUPPORTED {
                if let Err(e) = crate::windows::open_approval_popup(app, true) {
                    log::warn!("open approval popup failed: {e}");
                }
            } else {
                crate::windows::focus_main(app);
            }
        }
    }
}

fn parse(s: &str) -> AppResult<Shortcut> {
    s.parse::<Shortcut>()
        .map_err(|e| AppError::Shortcut(format!("{s}: {e}")))
}

/// Validate everything first, then swap registrations (unregister old, register new).
pub fn apply<R: Runtime>(app: &AppHandle<R>, cfg: &ShortcutConfig) -> AppResult<()> {
    let mut next = vec![(parse(&cfg.focus_terminal)?, Action::Focus)];
    if let Some(s) = cfg.open_approvals.as_deref().filter(|s| !s.is_empty()) {
        next.push((parse(s)?, Action::OpenApprovals));
    }
    for i in 0..next.len() {
        for j in i + 1..next.len() {
            if next[i].0 == next[j].0 {
                return Err(AppError::Shortcut("duplicate shortcut".into()));
            }
        }
    }
    let gs = app.global_shortcut();
    let bindings = app.state::<Bindings>();
    let mut cur = bindings.0.lock().unwrap();
    for (s, _) in cur.iter() {
        let _ = gs.unregister(*s);
    }
    cur.clear();
    for (s, a) in next {
        // On Linux/Wayland global shortcuts may be unavailable; report but keep going.
        match gs.register(s) {
            Ok(()) => cur.push((s, a)),
            Err(e) => log::warn!("register {s:?} failed: {e}"),
        }
    }
    Ok(())
}
