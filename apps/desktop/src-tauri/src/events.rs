//! Event bus: the reducer/commands produce `Out` values while holding the state lock, then
//! `dispatch` emits them to every webview (and side channels like notifications) after the lock
//! is released.

use crate::model::ProposalStatus;
use crate::state::AppState;
use crate::view::{Account, ActivityView, ConflictView, PickView, PositionView, Settings, StrategyView, SyncStatus, TickView};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const SIGNAL_NEW: &str = "signal:new";
pub const SIGNAL_UPDATE: &str = "signal:update";
pub const TICKS: &str = "market:ticks";
pub const ACTIVITY: &str = "activity:event";
pub const POSITIONS: &str = "positions:update";
pub const CONNECTION: &str = "conn:status";
pub const SETTINGS: &str = "settings:update";
pub const ACCOUNT: &str = "account:update";
/// Resume watermark, gap/resync counters and server clock skew.
pub const SYNC: &str = "sync:status";
pub const STRATEGIES: &str = "strategies:update";
/// 409 on a write: conflict toast + refresh.
pub const CONFLICT: &str = "write:conflict";
/// Rust → main only: focus a pick and open its confirmation (popup hand-off).
pub const FOCUS_SIGNAL: &str = "ui:focus-signal";

#[derive(Debug, Clone)]
pub enum Out {
    SignalNew(PickView),
    SignalUpdate(PickView),
    Ticks(Vec<TickView>),
    Activity(ActivityView),
    Positions(Vec<PositionView>),
    Connection(bool),
    Settings(Settings),
    Account(Account),
    Sync(SyncStatus),
    Strategies(Vec<StrategyView>),
    Conflict(ConflictView),
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
                let any_pending = app.state::<AppState>().engine.lock().unwrap().signals.iter().any(|x| x.status == ProposalStatus::Pending);
                if !any_pending {
                    crate::windows::hide_approval_popup_later(app, 3_200);
                }
                app.emit(SIGNAL_UPDATE, s)
            }
            Out::Ticks(t) => app.emit(TICKS, t),
            Out::Activity(a) => app.emit(ACTIVITY, a),
            Out::Positions(p) => app.emit(POSITIONS, p),
            Out::Connection(c) => app.emit(CONNECTION, c),
            Out::Settings(x) => app.emit(SETTINGS, x),
            Out::Account(a) => app.emit(ACCOUNT, a),
            Out::Sync(s) => app.emit(SYNC, s),
            Out::Strategies(s) => app.emit(STRATEGIES, s),
            Out::Conflict(c) => app.emit(CONFLICT, c),
        };
        if let Err(e) = res {
            log::warn!("emit failed: {e}");
        }
    }
}
