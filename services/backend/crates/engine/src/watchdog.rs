//! Per-stage heartbeats, health roll-up and alerts.
//!
//! Every pipeline stage (each feed, the router, Scout, ...) calls [`Watchdog::beat`]. A stage
//! with a `stall_after_ms` that has not beaten in time turns `stalled` and raises an alert;
//! the supervisor reacts (restart the feed, start the fallback). Alerts go to the log, an
//! in-memory ring (shown on `/health` and the localhost view) and `alerts.jsonl` in the data dir.
use serde::Serialize;
use std::collections::{BTreeMap, VecDeque};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StageState {
    /// Not started yet / intentionally idle (e.g. fallback feed on standby).
    Standby,
    Up,
    Stalled,
    Down,
}

#[derive(Debug, Clone, Serialize)]
pub struct Stage {
    pub state: StageState,
    pub last_beat_ms: Option<i64>,
    pub beats: u64,
    pub stall_after_ms: Option<i64>,
    pub restarts: u64,
    pub since_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    Info,
    Warn,
    Critical,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Alert {
    pub ts_ms: i64,
    pub level: Level,
    pub stage: String,
    /// Stable code: FEED_STALLED, FEED_DOWN, FEED_RECONNECTED, FAILOVER_ON, FAILOVER_OFF, ...
    pub code: String,
    pub msg: String,
}

pub struct Watchdog {
    stages: Mutex<BTreeMap<String, Stage>>,
    alerts: Mutex<VecDeque<Alert>>,
    alert_seq: std::sync::atomic::AtomicU64,
    log_path: Option<PathBuf>,
    started_ms: i64,
}

const ALERT_RING: usize = 200;

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match m.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    }
}

impl Watchdog {
    pub fn new(log_path: Option<PathBuf>, now_ms: i64) -> Self {
        Self {
            stages: Mutex::new(BTreeMap::new()),
            alerts: Mutex::new(VecDeque::new()),
            alert_seq: Default::default(),
            log_path,
            started_ms: now_ms,
        }
    }

    pub fn register(
        &self,
        stage: &str,
        stall_after_ms: Option<i64>,
        state: StageState,
        now_ms: i64,
    ) {
        lock(&self.stages)
            .entry(stage.to_string())
            .or_insert(Stage {
                state,
                last_beat_ms: None,
                beats: 0,
                stall_after_ms,
                restarts: 0,
                since_ms: now_ms,
            });
    }

    /// Heartbeat. A stalled/down stage that beats again recovers (alert `<stage> recovered`).
    pub fn beat(&self, stage: &str, now_ms: i64) {
        let recovered = {
            let mut st = lock(&self.stages);
            let s = st.entry(stage.to_string()).or_insert(Stage {
                state: StageState::Up,
                last_beat_ms: None,
                beats: 0,
                stall_after_ms: None,
                restarts: 0,
                since_ms: now_ms,
            });
            s.last_beat_ms = Some(now_ms);
            s.beats += 1;
            let was = s.state;
            if was != StageState::Up {
                s.state = StageState::Up;
                s.since_ms = now_ms;
            }
            matches!(was, StageState::Stalled | StageState::Down)
        };
        if recovered {
            self.alert(
                Level::Info,
                stage,
                "FEED_RECONNECTED",
                "frames flowing again",
                now_ms,
            );
        }
    }

    pub fn set_state(&self, stage: &str, state: StageState, now_ms: i64) {
        if let Some(s) = lock(&self.stages).get_mut(stage) {
            if s.state != state {
                s.state = state;
                s.since_ms = now_ms;
            }
        }
    }

    pub fn note_restart(&self, stage: &str) {
        if let Some(s) = lock(&self.stages).get_mut(stage) {
            s.restarts += 1;
        }
    }

    pub fn state(&self, stage: &str) -> Option<StageState> {
        lock(&self.stages).get(stage).map(|s| s.state)
    }

    /// Mark overdue stages stalled; returns the stages that stalled in this pass.
    pub fn check(&self, now_ms: i64) -> Vec<String> {
        let mut newly = Vec::new();
        {
            let mut st = lock(&self.stages);
            for (name, s) in st.iter_mut() {
                let Some(limit) = s.stall_after_ms else {
                    continue;
                };
                if s.state != StageState::Up {
                    continue;
                }
                let last = s.last_beat_ms.unwrap_or(s.since_ms);
                if now_ms - last > limit {
                    s.state = StageState::Stalled;
                    s.since_ms = now_ms;
                    newly.push(name.clone());
                }
            }
        }
        for n in &newly {
            self.alert(
                Level::Warn,
                n,
                "FEED_STALLED",
                "no heartbeat within the stall window",
                now_ms,
            );
        }
        newly
    }

    pub fn alert(&self, level: Level, stage: &str, code: &str, msg: &str, now_ms: i64) {
        let a = Alert {
            ts_ms: now_ms,
            level,
            stage: stage.into(),
            code: code.into(),
            msg: msg.into(),
        };
        match level {
            Level::Info => tracing::info!(stage, code, msg, "ALERT"),
            Level::Warn => tracing::warn!(stage, code, msg, "ALERT"),
            Level::Critical => tracing::error!(stage, code, msg, "ALERT"),
        }
        if let Some(p) = &self.log_path {
            if let Some(dir) = p.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(p)
            {
                if let Ok(line) = serde_json::to_string(&a) {
                    let _ = writeln!(f, "{line}");
                }
            }
        }
        self.alert_seq
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let mut q = lock(&self.alerts);
        if q.len() == ALERT_RING {
            q.pop_front();
        }
        q.push_back(a);
    }

    pub fn alerts(&self) -> Vec<Alert> {
        lock(&self.alerts).iter().cloned().collect()
    }

    pub fn stages(&self) -> BTreeMap<String, Stage> {
        lock(&self.stages).clone()
    }

    /// `ok` = every non-standby stage up; `degraded` = something stalled/down but at least one
    /// feed is up; `down` = no feed up.
    pub fn overall(&self) -> &'static str {
        let st = lock(&self.stages);
        let feeds_up = st
            .iter()
            .any(|(k, s)| k.starts_with("feed.") && s.state == StageState::Up);
        let any_bad = st
            .values()
            .any(|s| matches!(s.state, StageState::Stalled | StageState::Down));
        match (feeds_up, any_bad) {
            (false, _) => "down",
            (true, true) => "degraded",
            (true, false) => "ok",
        }
    }

    pub fn uptime_ms(&self, now_ms: i64) -> i64 {
        now_ms - self.started_ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stall_then_recover_raises_alerts() {
        let w = Watchdog::new(None, 0);
        w.register("feed.pumpportal", Some(1000), StageState::Up, 0);
        w.beat("feed.pumpportal", 100);
        assert!(w.check(900).is_empty());
        assert_eq!(w.overall(), "ok");
        assert_eq!(w.check(1200), vec!["feed.pumpportal".to_string()]);
        assert_eq!(w.state("feed.pumpportal"), Some(StageState::Stalled));
        assert_eq!(w.overall(), "down");
        assert!(w.check(5000).is_empty(), "alert once per stall");
        w.beat("feed.pumpportal", 5100);
        assert_eq!(w.overall(), "ok");
        let codes: Vec<_> = w.alerts().into_iter().map(|a| a.code).collect();
        assert_eq!(codes, vec!["FEED_STALLED", "FEED_RECONNECTED"]);
    }

    #[test]
    fn standby_is_not_checked() {
        let w = Watchdog::new(None, 0);
        w.register("feed.helius", Some(10), StageState::Standby, 0);
        w.register("feed.pumpportal", Some(10_000), StageState::Up, 0);
        w.beat("feed.pumpportal", 0);
        assert!(w.check(500).is_empty());
        assert_eq!(w.overall(), "ok");
    }
}
