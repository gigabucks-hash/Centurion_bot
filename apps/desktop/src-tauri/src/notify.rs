//! Native notifications (Windows toast / macOS UNUserNotification / Linux libnotify)
//! via tauri-plugin-notification. Throttled so a burst of signals is not spammy.

use crate::model::Mode;
use crate::view::PickView;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

static LAST_MS: AtomicU64 = AtomicU64::new(0);
const MIN_GAP_MS: u64 = 3_000;

pub fn new_signal<R: Runtime>(app: &AppHandle<R>, s: &PickView, mode: Mode) {
    let now = crate::util::now_ms();
    let last = LAST_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < MIN_GAP_MS {
        return;
    }
    LAST_MS.store(now, Ordering::Relaxed);
    // Token symbol is untrusted text (already sanitised by model::plain_text); capped again here
    // and never put in a URL/action.
    let sym: String = s.symbol.chars().take(12).collect();
    let fit = match (&s.score, &s.score_threshold) {
        (Some(a), Some(b)) => format!(" · fit {a}/{b}"),
        _ => String::new(),
    };
    let res = app
        .notification()
        .builder()
        // UX rule: notification title always starts with the mode prefix.
        .title(format!("{} Pick baru: {sym}{fit}", mode_prefix(mode)))
        .body("Buka approval queue: A approve · S skip")
        .show();
    if let Err(e) = res {
        log::warn!("notification failed (headless/permission?): {e}");
    }
}

pub fn mode_prefix(mode: Mode) -> &'static str {
    match mode {
        Mode::Practice => "[PRACTICE]",
        Mode::Real => "[REAL SOL]",
    }
}
