//! Event bus: engine/commands produce `Out` values while holding the state lock,
//! then `dispatch` emits them to every webview (and side channels like
//! notifications) after the lock is released.

use crate::model::{ActivityEvent, Position, Settings, Signal, Tick};
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const SIGNAL_NEW: &str = "signal:new";
pub const SIGNAL_UPDATE: &str = "signal:update";
pub const TICKS: &str = "market:ticks";
pub const ACTIVITY: &str = "activity:event";
pub const POSITIONS: &str = "positions:update";
pub const CONNECTION: &str = "conn:status";
pub const SETTINGS: &str = "settings:update";
pub const ACCOUNT: &str = "account:update";
/// Rust → main only: focus a pick and open its confirmation (popup hand-off).
pub const FOCUS_SIGNAL: &str = "ui:focus-signal";

#[derive(Debug, Clone)]
pub enum Out {
    SignalNew(Signal),
    SignalUpdate(Signal),
    Ticks(Vec<Tick>),
    Activity(ActivityEvent),
    Positions(Vec<Position>),
    Connection(bool),
    Settings(Settings),
}

pub fn dispatch<R: Runtime>(app: &AppHandle<R>, outs: Vec<Out>) {
    for o in outs {
        let res = match &o {
            Out::SignalNew(s) => {
                let (mode, popup) = {
                    let st = app.state::<AppState>();
                    let e = st.engine.lock().unwrap();
                    (e.mode, e.settings.approval_popup)
                };
                crate::notify::new_signal(app, s, mode);
                if popup {
                    // Show (not focus) the opt-in always-on-top approval window.
                    let _ = crate::windows::open_approval_popup(app, false);
                }
                app.emit(SIGNAL_NEW, s)
            }
            Out::SignalUpdate(s) => {
                // UX: popup hides automatically once the queue is empty (after the 3 s expired notice).
                let any_pending = app.state::<AppState>().engine.lock().unwrap().signals.iter().any(|x| x.stage == crate::model::Stage::Pending);
                if !any_pending {
                    crate::windows::hide_approval_popup_later(app, 3_200);
                }
                app.emit(SIGNAL_UPDATE, s)
            }
            Out::Ticks(t) => app.emit(TICKS, t),
            Out::Activity(a) => app.emit(ACTIVITY, a),
            Out::Positions(p) => {
                let cash = app.state::<AppState>().engine.lock().unwrap().paper_cash_sol;
                let _ = app.emit(ACCOUNT, cash);
                app.emit(POSITIONS, p)
            }
            Out::Connection(c) => app.emit(CONNECTION, c),
            Out::Settings(x) => app.emit(SETTINGS, x),
        };
        if let Err(e) = res {
            log::warn!("emit failed: {e}");
        }
    }
}
