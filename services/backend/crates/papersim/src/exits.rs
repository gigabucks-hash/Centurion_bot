//! Time-based exit rules evaluated on every mark for an open paper position (contracts 1.1.4):
//!
//! * `time_stop_s` — sell the whole position once it has been held this many seconds
//!   (exit_reason `max_hold`; the existing reason already means "held too long").
//! * `stall_exit {window_s, min_move_pct}` — sell the whole position when the absolute price change
//!   over the last `window_s` seconds is below `min_move_pct` (exit_reason `stall`). It needs a full
//!   window of price history, so it never fires earlier than `window_s` after entry.
//!
//! Both are off when absent or `null`. `time_stop_s` wins when both are due on the same mark.
//! Bounds mirror `public.strategy_settings_valid()` (scripts/gen_settings.py).

use std::collections::VecDeque;

use common::{ExitReason, TsMs};
use serde::Deserialize;

pub const TIME_STOP_S_RANGE: (u64, u64) = (1, 604_800);
pub const STALL_WINDOW_S_RANGE: (u64, u64) = (5, 86_400);
pub const STALL_MIN_MOVE_PCT_RANGE: (f64, f64) = (0.01, 100.0);

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StallExit {
    pub window_s: u64,
    pub min_move_pct: f64,
}

/// The time-based exit keys of a strategy's settings.
#[derive(Debug, Clone, Copy, Default, PartialEq, Deserialize)]
pub struct TimeExits {
    #[serde(default)]
    pub time_stop_s: Option<u64>,
    #[serde(default)]
    pub stall_exit: Option<StallExit>,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum ExitSettingsError {
    #[error("settings.{0} is invalid: {1}")]
    Invalid(&'static str, String),
}

impl TimeExits {
    /// Read `time_stop_s` / `stall_exit` from a settings object (other keys are ignored here).
    pub fn from_settings(s: &serde_json::Value) -> Result<Self, ExitSettingsError> {
        let mut out = TimeExits::default();
        match s.get("time_stop_s") {
            None | Some(serde_json::Value::Null) => {}
            Some(v) => {
                let n = v.as_u64().ok_or_else(|| {
                    ExitSettingsError::Invalid("time_stop_s", "must be an integer or null".into())
                })?;
                out.time_stop_s = Some(n);
            }
        }
        match s.get("stall_exit") {
            None | Some(serde_json::Value::Null) => {}
            Some(v) => {
                let se: StallExit = serde_json::from_value(v.clone())
                    .map_err(|e| ExitSettingsError::Invalid("stall_exit", e.to_string()))?;
                out.stall_exit = Some(se);
            }
        }
        out.validate()?;
        Ok(out)
    }

    pub fn validate(&self) -> Result<(), ExitSettingsError> {
        if let Some(t) = self.time_stop_s {
            if !(TIME_STOP_S_RANGE.0..=TIME_STOP_S_RANGE.1).contains(&t) {
                return Err(ExitSettingsError::Invalid(
                    "time_stop_s",
                    format!("{t} out of range"),
                ));
            }
        }
        if let Some(se) = self.stall_exit {
            if !(STALL_WINDOW_S_RANGE.0..=STALL_WINDOW_S_RANGE.1).contains(&se.window_s) {
                return Err(ExitSettingsError::Invalid(
                    "stall_exit",
                    format!("window_s {} out of range", se.window_s),
                ));
            }
            let (lo, hi) = STALL_MIN_MOVE_PCT_RANGE;
            if se.min_move_pct.is_nan() || se.min_move_pct < lo || se.min_move_pct > hi {
                return Err(ExitSettingsError::Invalid(
                    "stall_exit",
                    format!("min_move_pct {} out of range", se.min_move_pct),
                ));
            }
        }
        Ok(())
    }
}

/// A sell-everything decision.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TimeExitDecision {
    pub reason: ExitReason,
    /// Always 100: both rules sell the whole position.
    pub sell_portion_pct: f64,
    /// Measured |price change| over the window, % (stall only).
    pub move_pct: Option<f64>,
}

/// Per-position state: entry time and the price history the stall window needs.
#[derive(Debug, Clone)]
pub struct TimeExitClock {
    opened_at: TsMs,
    prices: VecDeque<(TsMs, f64)>,
}

impl TimeExitClock {
    pub fn new(opened_at: TsMs, entry_price: f64) -> Self {
        let mut prices = VecDeque::new();
        if entry_price.is_finite() && entry_price > 0.0 {
            prices.push_back((opened_at, entry_price));
        }
        TimeExitClock { opened_at, prices }
    }

    /// Record a mark. Out-of-order or non-positive prices are ignored.
    pub fn observe(&mut self, ts: TsMs, price: f64, keep_ms: i64) {
        if !price.is_finite() || price <= 0.0 {
            return;
        }
        if self.prices.back().is_some_and(|(t, _)| ts < *t) {
            return;
        }
        self.prices.push_back((ts, price));
        // keep exactly one point at or before the window start
        let cutoff = ts - keep_ms;
        while self.prices.len() >= 2 && self.prices[1].0 <= cutoff {
            self.prices.pop_front();
        }
    }

    /// Record a mark and evaluate both rules at `ts`.
    pub fn on_mark(&mut self, cfg: &TimeExits, ts: TsMs, price: f64) -> Option<TimeExitDecision> {
        let keep = cfg.stall_exit.map_or(0, |s| s.window_s as i64 * 1000);
        self.observe(ts, price, keep);
        self.evaluate(cfg, ts)
    }

    pub fn evaluate(&self, cfg: &TimeExits, now: TsMs) -> Option<TimeExitDecision> {
        if let Some(t) = cfg.time_stop_s {
            if now - self.opened_at >= t as i64 * 1000 {
                return Some(TimeExitDecision {
                    reason: ExitReason::MaxHold,
                    sell_portion_pct: 100.0,
                    move_pct: None,
                });
            }
        }
        let se = cfg.stall_exit?;
        let start = now - se.window_s as i64 * 1000;
        if start < self.opened_at {
            return None; // not a full window since entry
        }
        // price in force at the window start, and the latest price
        let reference = self
            .prices
            .iter()
            .take_while(|(t, _)| *t <= start)
            .last()?
            .1;
        let last = self.prices.back()?.1;
        let move_pct = ((last / reference) - 1.0).abs() * 100.0;
        (move_pct < se.min_move_pct).then_some(TimeExitDecision {
            reason: ExitReason::Stall,
            sell_portion_pct: 100.0,
            move_pct: Some(move_pct),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cfg(v: serde_json::Value) -> TimeExits {
        TimeExits::from_settings(&v).expect("valid")
    }

    #[test]
    fn off_by_default_and_null() {
        let c = cfg(json!({"time_stop_s": null, "stall_exit": null, "stop_loss_pct": 20}));
        assert_eq!(c, TimeExits::default());
        let mut k = TimeExitClock::new(0, 1.0);
        assert_eq!(k.on_mark(&c, 10_000_000, 1.0), None);
    }

    #[test]
    fn time_stop_sells_all_at_the_hold_time() {
        let c = cfg(json!({"time_stop_s": 300}));
        let mut k = TimeExitClock::new(1_000, 1.0);
        assert_eq!(k.on_mark(&c, 300_999, 5.0), None);
        let d = k.on_mark(&c, 301_000, 5.0).expect("due");
        assert_eq!((d.reason, d.sell_portion_pct), (ExitReason::MaxHold, 100.0));
        assert_eq!(d.reason.as_str(), "max_hold");
    }

    #[test]
    fn stall_fires_on_a_flat_window_only() {
        let c = cfg(json!({"stall_exit": {"window_s": 60, "min_move_pct": 2}}));
        let mut k = TimeExitClock::new(0, 1.0);
        // never before a full window since entry, even if flat
        assert_eq!(k.on_mark(&c, 30_000, 1.0), None);
        assert_eq!(k.on_mark(&c, 59_999, 1.001), None);
        // window 0..60s: 1.0 -> 1.01 = 1 % < 2 % -> stall
        let d = k.on_mark(&c, 60_000, 1.01).expect("stall");
        assert_eq!(d.reason, ExitReason::Stall);
        assert_eq!(d.sell_portion_pct, 100.0);
        assert!((d.move_pct.expect("pct") - 1.0).abs() < 1e-9);

        // a moving coin does not stall (down moves count too)
        let mut k = TimeExitClock::new(0, 1.0);
        k.on_mark(&c, 30_000, 1.2);
        assert_eq!(k.on_mark(&c, 60_000, 0.97), None, "-3 % is a move");
        // later window measured from the price in force at its start (1.2 at 30 s for now=90 s)
        let d = k.on_mark(&c, 90_000, 1.19).expect("flat vs 1.2");
        assert!(d.move_pct.expect("pct") < 1.0);
    }

    #[test]
    fn stall_boundary_is_strictly_below() {
        let c = cfg(json!({"stall_exit": {"window_s": 10, "min_move_pct": 5}}));
        let mut k = TimeExitClock::new(0, 100.0);
        assert_eq!(k.on_mark(&c, 10_000, 105.0), None, "exactly 5 % is a move");
        let mut k = TimeExitClock::new(0, 100.0);
        assert!(k.on_mark(&c, 10_000, 104.99).is_some());
    }

    #[test]
    fn time_stop_wins_when_both_are_due() {
        let c = cfg(json!({"time_stop_s": 60, "stall_exit": {"window_s": 60, "min_move_pct": 50}}));
        let mut k = TimeExitClock::new(0, 1.0);
        assert_eq!(
            k.on_mark(&c, 60_000, 1.0).expect("due").reason,
            ExitReason::MaxHold
        );
    }

    #[test]
    fn history_is_pruned_to_the_window() {
        let c = cfg(json!({"stall_exit": {"window_s": 5, "min_move_pct": 1}}));
        let mut k = TimeExitClock::new(0, 1.0);
        for i in 1..=1000 {
            k.on_mark(&c, i * 1000, 1.0 + i as f64);
        }
        assert!(k.prices.len() <= 7, "{}", k.prices.len());
        // out-of-order and bad prices are ignored
        let n = k.prices.len();
        k.observe(1, 1.0, 5000);
        k.observe(2_000_000, f64::NAN, 5000);
        k.observe(2_000_000, 0.0, 5000);
        assert_eq!(k.prices.len(), n);
    }

    #[test]
    fn invalid_settings_are_rejected_like_sql() {
        for bad in [
            json!({"time_stop_s": 0}),
            json!({"time_stop_s": 604_801}),
            json!({"time_stop_s": 1.5}),
            json!({"time_stop_s": "60"}),
            json!({"stall_exit": {"window_s": 4, "min_move_pct": 1}}),
            json!({"stall_exit": {"window_s": 60, "min_move_pct": 0}}),
            json!({"stall_exit": {"window_s": 60, "min_move_pct": 101}}),
            json!({"stall_exit": {"window_s": 60}}),
            json!({"stall_exit": {"window_s": 60, "min_move_pct": 1, "x": 1}}),
            json!({"stall_exit": {"window_s": 60.5, "min_move_pct": 1}}),
            json!({"stall_exit": 5}),
        ] {
            assert!(TimeExits::from_settings(&bad).is_err(), "{bad}");
        }
    }
}
