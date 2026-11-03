//! RPC credit meter: daily cap (`ENGINE_RPC_DAILY_CREDIT_CAP`, default 25000) + month-to-date
//! meter, per check. Days and months are UTC (the provider's billing clock).
//!
//! Spec v1 rev 3.1 (Bubu): a check that cannot get credits is **UNVERIFIED -> REJECT** with
//! reason `credit_cap`; callers must treat [`CapHit`] as a failed check, never a skip.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("credit_cap: daily RPC credit cap {cap} reached ({used} used, {asked} asked)")]
pub struct CapHit {
    pub cap: u64,
    pub used: u64,
    pub asked: u64,
}

impl CapHit {
    /// Decision reason code (Spec v1 rev 3.1).
    pub const REASON: &'static str = "credit_cap";
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct CreditState {
    /// `YYYY-MM-DD` (UTC).
    pub day: String,
    pub day_used: u64,
    pub day_by_check: BTreeMap<String, u64>,
    /// Calls refused today because of the cap.
    pub day_cap_hits: u64,
    /// `YYYY-MM` (UTC).
    pub month: String,
    pub month_used: u64,
    /// Finished days of the current month, for Nero's report.
    #[serde(default)]
    pub history: BTreeMap<String, u64>,
}

pub struct CreditMeter {
    cap: u64,
    state: Mutex<CreditState>,
    path: Option<PathBuf>,
}

fn day_month(ts_ms: i64) -> (String, String) {
    let dt = chrono::DateTime::from_timestamp_millis(ts_ms).unwrap_or_default();
    (
        dt.format("%Y-%m-%d").to_string(),
        dt.format("%Y-%m").to_string(),
    )
}

impl CreditMeter {
    pub fn new(cap: u64, path: Option<PathBuf>) -> Self {
        let state = path
            .as_deref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self {
            cap,
            state: Mutex::new(state),
            path,
        }
    }

    pub fn cap(&self) -> u64 {
        self.cap
    }

    fn roll(st: &mut CreditState, now_ms: i64) {
        let (day, month) = day_month(now_ms);
        if st.month != month {
            st.month = month;
            st.month_used = 0;
            st.history.clear();
        }
        if st.day != day {
            if !st.day.is_empty() && st.day_used > 0 {
                st.history.insert(st.day.clone(), st.day_used);
            }
            st.day = day;
            st.day_used = 0;
            st.day_by_check.clear();
            st.day_cap_hits = 0;
        }
    }

    /// Reserve `n` credits for `check` before making the calls. All-or-nothing.
    pub fn try_spend(&self, check: &str, n: u64, now_ms: i64) -> Result<(), CapHit> {
        let mut st = match self.state.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        Self::roll(&mut st, now_ms);
        if st.day_used.saturating_add(n) > self.cap {
            st.day_cap_hits += 1;
            return Err(CapHit {
                cap: self.cap,
                used: st.day_used,
                asked: n,
            });
        }
        st.day_used += n;
        st.month_used += n;
        *st.day_by_check.entry(check.to_string()).or_default() += n;
        Ok(())
    }

    /// Record credits that were spent outside the engine's control (e.g. a source's own reads).
    pub fn record(&self, check: &str, n: u64, now_ms: i64) {
        let mut st = match self.state.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        Self::roll(&mut st, now_ms);
        st.day_used += n;
        st.month_used += n;
        *st.day_by_check.entry(check.to_string()).or_default() += n;
    }

    pub fn snapshot(&self, now_ms: i64) -> CreditState {
        let mut st = match self.state.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        Self::roll(&mut st, now_ms);
        st.clone()
    }

    /// Persist atomically (write temp + rename).
    pub fn flush(&self) -> std::io::Result<()> {
        let Some(p) = &self.path else { return Ok(()) };
        let body = serde_json::to_vec_pretty(&self.snapshot(crate::now_ms()))?;
        write_atomic(p, &body)
    }
}

pub fn write_atomic(p: &Path, body: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, body)?;
    std::fs::rename(tmp, p)
}

#[cfg(test)]
mod tests {
    use super::*;
    const D1: i64 = 1_793_664_000_000; // 2026-11-03T00:00:00Z
    const DAY: i64 = 86_400_000;

    #[test]
    fn cap_is_all_or_nothing_and_fails_closed() {
        let m = CreditMeter::new(100, None);
        assert!(m.try_spend("lp_safe", 60, D1).is_ok());
        let hit = m.try_spend("holders", 50, D1).unwrap_err();
        assert_eq!(
            hit,
            CapHit {
                cap: 100,
                used: 60,
                asked: 50
            }
        );
        assert!(m.try_spend("holders", 40, D1).is_ok());
        let s = m.snapshot(D1);
        assert_eq!(s.day, "2026-11-03");
        assert_eq!(s.day_used, 100);
        assert_eq!(s.day_cap_hits, 1);
        assert_eq!(s.day_by_check["holders"], 40);
        assert_eq!(CapHit::REASON, "credit_cap");
    }

    #[test]
    fn rolls_day_and_month() {
        let m = CreditMeter::new(100, None);
        m.try_spend("a", 70, D1).unwrap();
        m.try_spend("a", 70, D1 + DAY).unwrap(); // new day: cap resets
        let s = m.snapshot(D1 + DAY);
        assert_eq!(s.day_used, 70);
        assert_eq!(s.month_used, 140);
        assert_eq!(s.history["2026-11-03"], 70);
        let s = m.snapshot(D1 + 30 * DAY); // December
        assert_eq!(s.month, "2026-12");
        assert_eq!(s.month_used, 0);
    }

    #[test]
    fn persists() {
        let dir = std::env::temp_dir().join(format!("centurion-credits-{}", std::process::id()));
        let p = dir.join("credits.json");
        let m = CreditMeter::new(100, Some(p.clone()));
        m.record("pumpportal_enrich", 3, crate::now_ms());
        m.flush().unwrap();
        let m2 = CreditMeter::new(100, Some(p));
        assert_eq!(m2.snapshot(crate::now_ms()).day_used, 3);
        let _ = std::fs::remove_dir_all(dir);
    }
}
