//! Native notifications (Windows toast / Linux libnotify). macOS is not a supported target.
//! via tauri-plugin-notification. Throttled so a burst of signals is not spammy.
//!
//! Copy comes from @centurion/i18n 0.4.10 `notifications.map.json`: N-01 (`notif.pick_pending.*`) and N-02
//! (`notif.first_buy.*`), rendered in the UI locale with a tiny ICU subset ([`icu`]: `{var}` and one-level
//! `{var, select, … other {…}}`). Titles start with the mode prefix `[PAPER]` / `[REAL]` from the catalog.

use crate::model::{Lamports, Mode};
use crate::view::{Locale, PickView};
use rust_decimal::Decimal;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

static LAST_MS: AtomicU64 = AtomicU64::new(0);
const MIN_GAP_MS: u64 = 3_000;

fn catalog(l: Locale) -> &'static serde_json::Value {
    static EN: OnceLock<serde_json::Value> = OnceLock::new();
    static ID: OnceLock<serde_json::Value> = OnceLock::new();
    match l {
        Locale::En => EN.get_or_init(|| {
            serde_json::from_str(include_str!("../../../../packages/i18n/en.json"))
                .unwrap_or_default()
        }),
        Locale::Id => ID.get_or_init(|| {
            serde_json::from_str(include_str!("../../../../packages/i18n/id.json"))
                .unwrap_or_default()
        }),
    }
}
/// Dotted key → template (locale, then en). Missing → None (no ad-hoc copy).
pub fn template(l: Locale, key: &str) -> Option<&'static str> {
    let get = |c: &'static serde_json::Value| {
        key.split('.')
            .try_fold(c, |v, k| v.get(k))
            .and_then(|v| v.as_str())
    };
    get(catalog(l)).or_else(|| get(catalog(Locale::En)))
}

/// ICU subset: `{name}` → value; `{name, select, a {A} other {B}}` (branch bodies may hold `{name}`).
/// Unknown names render empty. Enough for the notification templates; the UI uses the full formatter.
pub fn icu(t: &str, args: &[(&str, &str)]) -> String {
    let val = |n: &str| {
        args.iter()
            .find(|(k, _)| *k == n.trim())
            .map(|(_, v)| *v)
            .unwrap_or("")
    };
    let b = t.as_bytes();
    let (mut out, mut i) = (String::new(), 0);
    while i < b.len() {
        if b[i] != b'{' {
            let next = t[i..].find('{').map_or(t.len(), |j| i + j);
            out.push_str(&t[i..next]);
            i = next;
            continue;
        }
        // matching close brace (depth-aware)
        let (mut d, mut j) = (0i32, i);
        while j < b.len() {
            match b[j] {
                b'{' => d += 1,
                b'}' => {
                    d -= 1;
                    if d == 0 {
                        break;
                    }
                }
                _ => {}
            }
            j += 1;
        }
        let inner = &t[i + 1..j.min(t.len())];
        let parts: Vec<&str> = inner.splitn(3, ',').collect();
        if parts.len() == 3 && parts[1].trim() == "select" {
            let v = val(parts[0]);
            let mut rest = parts[2];
            let mut chosen: Option<&str> = None;
            let mut other: Option<&str> = None;
            while let Some(o) = rest.find('{') {
                let label = rest[..o].trim();
                let (mut d, mut k) = (0i32, o);
                for (x, c) in rest[o..].char_indices() {
                    match c {
                        '{' => d += 1,
                        '}' => {
                            d -= 1;
                            if d == 0 {
                                k = o + x;
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                let body = &rest[o + 1..k];
                if label == v {
                    chosen = Some(body);
                } else if label == "other" {
                    other = Some(body);
                }
                rest = &rest[k + 1..];
            }
            out.push_str(&icu(chosen.or(other).unwrap_or(""), args));
        } else {
            out.push_str(val(inner));
        }
        i = j + 1;
    }
    out
}

/// SOL amount in the UI locale (≤ 4 dp, trailing zeros trimmed; `id` uses a decimal comma).
pub fn sol_text(l: Lamports, loc: Locale) -> String {
    let s = l.sol().round_dp(4).normalize();
    let txt = if s < Decimal::ZERO {
        format!("\u{2212}{}", s.abs())
    } else {
        s.to_string()
    };
    let txt = if loc == Locale::Id {
        txt.replace('.', ",")
    } else {
        txt
    };
    format!("{txt} SOL")
}

/// N-01 / N-02 title + body for a new pick.
pub fn signal_copy(s: &PickView, mode: Mode, loc: Locale, server_now_ms: i64) -> (String, String) {
    // Token symbol is untrusted text (already sanitised by model::plain_text); capped again here.
    let sym: String = s.symbol.chars().take(12).collect();
    let strat: String = s.strategy.chars().take(40).collect();
    let amount = s
        .amount_lamports
        .map(|l| sol_text(l, loc))
        .unwrap_or_else(|| "—".into());
    let left = ((s.expires_at_ms - server_now_ms).max(0) / 1000) as u64;
    let mm_ss = format!("{}:{:02}", left / 60, left % 60);
    let mode_s = match mode {
        Mode::Practice => "practice",
        Mode::Real => "real",
    };
    let args = [
        ("mode", mode_s),
        ("symbol", sym.as_str()),
        ("strategy", strat.as_str()),
        ("amount_lamports", amount.as_str()),
        ("mm_ss", mm_ss.as_str()),
    ];
    let base = if s.first_buy {
        "notif.first_buy"
    } else {
        "notif.pick_pending"
    };
    let title = template(loc, &format!("{base}.title"))
        .map(|t| icu(t, &args))
        .unwrap_or_else(|| format!("{} {}", mode_prefix(mode), crate::brand::app_name()));
    let body = template(loc, &format!("{base}.body"))
        .map(|t| icu(t, &args))
        .unwrap_or_default();
    (title, body)
}

pub fn new_signal<R: Runtime>(
    app: &AppHandle<R>,
    s: &PickView,
    mode: Mode,
    loc: Locale,
    server_now_ms: i64,
) {
    let now = crate::util::now_ms();
    let last = LAST_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < MIN_GAP_MS {
        return;
    }
    LAST_MS.store(now, Ordering::Relaxed);
    let (title, body) = signal_copy(s, mode, loc, server_now_ms);
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        log::warn!("notification failed (headless/permission?): {e}");
    }
}

/// Mode prefix of window titles; equals the prefix of the 0.4.10 push titles (checked by a test).
pub fn mode_prefix(mode: Mode) -> &'static str {
    match mode {
        Mode::Practice => "[PAPER]",
        Mode::Real => "[REAL]",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icu_subset_renders_vars_and_select() {
        let t = "[{mode, select, real {REAL} other {PAPER}}] Review {symbol}: x";
        assert_eq!(
            icu(t, &[("mode", "practice"), ("symbol", "ORCA")]),
            "[PAPER] Review ORCA: x"
        );
        assert_eq!(
            icu(t, &[("mode", "real"), ("symbol", "ORCA")]),
            "[REAL] Review ORCA: x"
        );
        assert_eq!(icu("{a} · {missing}", &[("a", "1")]), "1 · ");
    }

    #[test]
    fn push_titles_from_i18n_0_4_10_carry_paper_real_prefix() {
        for loc in [Locale::En, Locale::Id] {
            for key in ["notif.pick_pending.title", "notif.first_buy.title"] {
                let t = template(loc, key).expect(key);
                for (m, ms) in [(Mode::Practice, "practice"), (Mode::Real, "real")] {
                    let out = icu(t, &[("mode", ms), ("symbol", "ORCA"), ("strategy", "S")]);
                    assert!(
                        out.starts_with(&format!("{} ", mode_prefix(m))),
                        "{loc:?} {key}: {out}"
                    );
                    assert!(
                        !out.contains("PRACTICE") && !out.contains("REAL SOL"),
                        "old prefix: {out}"
                    );
                }
            }
        }
        assert_eq!(sol_text(Lamports(250_000_000), Locale::Id), "0,25 SOL");
        assert_eq!(sol_text(Lamports(1_500_000_000), Locale::En), "1.5 SOL");
    }
}
