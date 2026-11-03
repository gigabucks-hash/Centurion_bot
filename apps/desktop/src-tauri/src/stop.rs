//! STOP quick action: halt auto-trading in the **current** mode by pausing every running strategy.
//!
//! Entry points: the in-app Stop button, the tray menu "Stop" item, and the OS app-shortcut action
//! (`--stop`: Linux .desktop `Actions=Stop`, a second launch reaches us via single-instance argv). None of
//! them pauses anything directly: they only *request* a stop ([`request`]), which focuses the main window
//! and opens the confirm dialog. The dialog then calls the single command `stop_trading`, whose
//! arguments are validated here ([`StopRequest::parse`]).
//!
//! Backend has no workspace-level stop / kill-switch endpoint yet (1.1.5 reserves phase7 KillSwitch
//! types only), so Stop = `POST …/strategies/{id}/pause` with If-Match per running strategy.
use crate::model::Mode;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

/// Event asking the UI to show the Stop confirm (payload: the source).
pub const STOP_REQUEST: &str = "ui:stop-request";
/// The literal the confirm dialog sends; anything else is refused (no accidental stops from a stray call).
pub const CONFIRM_WORD: &str = "STOP";
/// argv flag used by the app-shortcut quick action.
pub const ARG: &str = "--stop";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StopSource {
    Ui,
    Tray,
    Shortcut,
}

#[derive(Debug, PartialEq, Eq)]
pub struct StopRequest {
    pub mode: Mode,
    pub source: StopSource,
}

impl StopRequest {
    /// `mode` must name the mode the app is in (a stale dialog from another mode is refused),
    /// `source` one of ui|tray|shortcut, `confirm` exactly [`CONFIRM_WORD`].
    pub fn parse(
        mode: &str,
        current: Mode,
        source: &str,
        confirm: &str,
    ) -> Result<Self, &'static str> {
        let mode = match mode {
            "practice" => Mode::Practice,
            "real" => Mode::Real,
            _ => return Err("mode"),
        };
        if mode != current {
            return Err("mode_mismatch");
        }
        let source = match source {
            "ui" => StopSource::Ui,
            "tray" => StopSource::Tray,
            "shortcut" => StopSource::Shortcut,
            _ => return Err("source"),
        };
        if confirm != CONFIRM_WORD {
            return Err("confirm");
        }
        Ok(Self { mode, source })
    }
}

/// Result for the UI: what was paused, what already was, what failed (with the error code).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct StopResult {
    pub paused: Vec<String>,
    pub already_paused: Vec<String>,
    pub failed: Vec<(String, String)>,
}

/// Ask the UI for a confirmed stop (tray / shortcut / second launch). Never pauses by itself.
pub fn request<R: Runtime>(app: &AppHandle<R>, source: StopSource) {
    crate::windows::focus_main(app);
    let _ = app.emit(STOP_REQUEST, source);
}

/// argv of a (second) launch carries the quick action?
pub fn wants_stop(argv: &[String]) -> bool {
    argv.iter().skip(1).any(|a| a == ARG)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stop_arguments_are_validated() {
        assert_eq!(
            StopRequest::parse("practice", Mode::Practice, "tray", "STOP"),
            Ok(StopRequest {
                mode: Mode::Practice,
                source: StopSource::Tray
            })
        );
        assert_eq!(
            StopRequest::parse("real", Mode::Practice, "ui", "STOP"),
            Err("mode_mismatch")
        );
        assert_eq!(
            StopRequest::parse("live", Mode::Practice, "ui", "STOP"),
            Err("mode")
        );
        assert_eq!(
            StopRequest::parse("practice", Mode::Practice, "mcp", "STOP"),
            Err("source")
        );
        assert_eq!(
            StopRequest::parse("practice", Mode::Practice, "ui", "stop"),
            Err("confirm")
        );
        assert_eq!(
            StopRequest::parse("practice", Mode::Practice, "ui", ""),
            Err("confirm")
        );
    }
    #[test]
    fn quick_action_flag_is_exact_and_not_argv0() {
        assert!(wants_stop(&["centurion-trade".into(), "--stop".into()]));
        assert!(!wants_stop(&["--stop".into()]));
        assert!(!wants_stop(&["x".into(), "--stopall".into()]));
    }
}
