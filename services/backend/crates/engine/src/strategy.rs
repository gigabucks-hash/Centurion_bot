//! Versioned strategy JSON (settings v1.2.0, Spec v1 rev 3.1) with hot reload.
//!
//! One file per strategy in `config/strategies/*.json`. The store polls mtimes every 2 s; a file
//! that fails to parse or validate is rejected (alert) and the last valid version keeps running.
//! Sections not used by M1 (entry, momentum, exit, guard_checks, paper) are kept as raw JSON and
//! typed in later milestones.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub const SCHEMA_VERSION: &str = "1.2.0";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StrategyMode {
    Paper,
    Real,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AntiTop {
    pub basis: String,
    pub range_pct_1h: f64,
    pub range_pct_6h: f64,
    pub near_high_pct: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoutCfg {
    pub mcap_usd_min: f64,
    pub mcap_usd_max: Option<f64>,
    pub mcap_basis: String,
    pub liquidity_usd_min: f64,
    pub volume_24h_usd_min: f64,
    pub volume_to_mcap_1h_min: Option<f64>,
    pub volume_to_mcap_1h_max: Option<f64>,
    pub top_holders_share_pct_max: f64,
    pub lp_safe_pct_min: f64,
    pub since_migration_seconds_min: i64,
    pub since_migration_seconds_max: Option<i64>,
    pub holder_count_min: u64,
    pub crash_skip_1h_pct: f64,
    pub anti_top: Option<AntiTop>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoringCfg {
    pub version: u32,
    pub phase: String,
    pub weights_by_phase: BTreeMap<String, BTreeMap<String, f64>>,
    pub min_score: f64,
    pub floors: BTreeMap<String, f64>,
    pub required: Vec<String>,
    pub vetoes: Vec<String>,
    pub missing: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RiskCfg {
    pub ticket_lamports: String,
    pub max_concurrent_positions: u32,
    pub bankroll_lamports: String,
    pub budget_basis: String,
    #[serde(flatten)]
    pub rest: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StrategyConfig {
    pub schema_version: String,
    pub strategy_key: String,
    pub config_rev: u32,
    pub spec_ref: String,
    pub enabled: bool,
    pub name: String,
    pub venues: Vec<String>,
    /// Requested mode. `real` is always locked in P1 (see [`StrategyConfig::effective_mode`]).
    pub mode: StrategyMode,
    pub scout: ScoutCfg,
    pub scoring: ScoringCfg,
    pub risk: RiskCfg,
    #[serde(flatten)]
    pub rest: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum StrategyError {
    #[error("parse: {0}")]
    Parse(String),
    #[error("invalid: {0}")]
    Invalid(String),
}

fn key_ok(k: &str) -> bool {
    (3..=40).contains(&k.len())
        && k.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

impl StrategyConfig {
    pub fn parse(raw: &str) -> Result<Self, StrategyError> {
        let c: Self = serde_json::from_str(raw).map_err(|e| StrategyError::Parse(e.to_string()))?;
        c.validate()?;
        Ok(c)
    }

    pub fn validate(&self) -> Result<(), StrategyError> {
        let bad = |m: String| Err(StrategyError::Invalid(m));
        if self.schema_version != SCHEMA_VERSION {
            return bad(format!(
                "schema_version {} != {SCHEMA_VERSION}",
                self.schema_version
            ));
        }
        if !key_ok(&self.strategy_key) {
            return bad(format!("strategy_key '{}'", self.strategy_key));
        }
        if self.config_rev < 1 {
            return bad("config_rev must be >= 1".into());
        }
        if self.venues != ["amm"] {
            return bad("P1 venues must be [\"amm\"]".into());
        }
        let s = &self.scout;
        if s.mcap_usd_min < 0.0 || s.mcap_usd_max.is_some_and(|m| m < s.mcap_usd_min) {
            return bad("scout.mcap range".into());
        }
        if s.since_migration_seconds_max
            .is_some_and(|m| m < s.since_migration_seconds_min)
        {
            return bad("scout.since_migration range".into());
        }
        if !(0.0..=100.0).contains(&s.lp_safe_pct_min)
            || !(0.0..=100.0).contains(&s.top_holders_share_pct_max)
        {
            return bad("scout percentages must be 0-100".into());
        }
        let sc = &self.scoring;
        for (phase, w) in &sc.weights_by_phase {
            let sum: f64 = w.values().sum();
            if (sum - 100.0).abs() > 1e-6 {
                return bad(format!(
                    "scoring.weights_by_phase.{phase} sums to {sum}, not 100"
                ));
            }
        }
        if !sc.weights_by_phase.contains_key(&sc.phase) {
            return bad(format!("scoring.phase '{}' has no weights", sc.phase));
        }
        if !(0.0..=100.0).contains(&sc.min_score)
            || sc.floors.values().any(|f| !(0.0..=100.0).contains(f))
        {
            return bad("scoring min_score/floors must be 0-100".into());
        }
        for req in ["scout", "guard", "momentum", "risk"] {
            if !sc.required.iter().any(|r| r == req) {
                return bad(format!("scoring.required must include {req}"));
            }
        }
        if sc.missing != "renormalize_optional_only" {
            return bad("scoring.missing must be renormalize_optional_only".into());
        }
        for (k, v) in [
            ("ticket_lamports", &self.risk.ticket_lamports),
            ("bankroll_lamports", &self.risk.bankroll_lamports),
        ] {
            if v.parse::<u64>().map(|n| n == 0).unwrap_or(true) {
                return bad(format!("risk.{k} must be a positive integer string"));
            }
        }
        Ok(())
    }

    /// P1: Real is locked for every strategy (needs_owner_approval); the engine runs paper.
    pub fn effective_mode(&self) -> StrategyMode {
        StrategyMode::Paper
    }

    pub fn real_locked_reason(&self) -> &'static str {
        "needs_owner_approval"
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct LoadedStrategy {
    pub path: String,
    pub config: StrategyConfig,
    pub loaded_ms: i64,
    pub reloads: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct RejectedFile {
    pub path: String,
    pub error: String,
    pub ts_ms: i64,
}

/// Directory-backed strategy store with mtime-poll hot reload.
pub struct StrategyStore {
    dir: PathBuf,
    mtimes: BTreeMap<PathBuf, SystemTime>,
    pub active: BTreeMap<String, LoadedStrategy>,
    pub rejected: Vec<RejectedFile>,
}

#[derive(Debug, Default, PartialEq)]
pub struct ReloadReport {
    pub loaded: Vec<String>,
    pub rejected: Vec<String>,
}

impl StrategyStore {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self {
            dir: dir.into(),
            mtimes: BTreeMap::new(),
            active: BTreeMap::new(),
            rejected: Vec::new(),
        }
    }

    fn files(dir: &Path) -> Vec<PathBuf> {
        let mut v: Vec<PathBuf> = std::fs::read_dir(dir)
            .map(|rd| rd.filter_map(|e| e.ok().map(|e| e.path())).collect())
            .unwrap_or_default();
        v.retain(|p| p.extension().is_some_and(|e| e == "json"));
        v.sort();
        v
    }

    /// Reload changed files. Invalid files keep the previous valid version active.
    pub fn poll(&mut self, now_ms: i64) -> ReloadReport {
        let mut rep = ReloadReport::default();
        for p in Self::files(&self.dir) {
            let Ok(mt) = std::fs::metadata(&p).and_then(|m| m.modified()) else {
                continue;
            };
            if self.mtimes.get(&p) == Some(&mt) {
                continue;
            }
            self.mtimes.insert(p.clone(), mt);
            let path = p.display().to_string();
            let parsed = std::fs::read_to_string(&p)
                .map_err(|e| StrategyError::Parse(e.to_string()))
                .and_then(|raw| StrategyConfig::parse(&raw));
            match parsed {
                Ok(cfg) => {
                    let key = cfg.strategy_key.clone();
                    let reloads = self.active.get(&key).map(|l| l.reloads + 1).unwrap_or(0);
                    tracing::info!(strategy = %key, rev = cfg.config_rev, reloads, "strategy loaded");
                    self.active.insert(
                        key.clone(),
                        LoadedStrategy {
                            path,
                            config: cfg,
                            loaded_ms: now_ms,
                            reloads,
                        },
                    );
                    rep.loaded.push(key);
                }
                Err(e) => {
                    tracing::warn!(%path, error = %e, "strategy rejected; keeping last valid version");
                    self.rejected.push(RejectedFile {
                        path: path.clone(),
                        error: e.to_string(),
                        ts_ms: now_ms,
                    });
                    if self.rejected.len() > 50 {
                        self.rejected.remove(0);
                    }
                    rep.rejected.push(path);
                }
            }
        }
        rep
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub fn repo_strategy(file: &str) -> String {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/../../config/strategies/");
        std::fs::read_to_string(format!("{p}{file}")).expect("strategy file")
    }

    #[test]
    fn shipped_strategies_validate() {
        let a = StrategyConfig::parse(&repo_strategy("swing_hunter.json")).expect("A");
        assert_eq!(a.strategy_key, "swing_hunter");
        assert!(a.enabled);
        assert_eq!(a.scout.mcap_usd_min, 250_000.0);
        assert_eq!(a.scoring.min_score, 68.0);
        assert!(a.scout.anti_top.is_some());
        let b = StrategyConfig::parse(&repo_strategy("hot_dip_reload.json")).expect("B");
        assert!(!b.enabled, "B is config-only in P1");
        assert_eq!(b.scoring.min_score, 65.0);
        assert!(b.scout.anti_top.is_none());
        // rev 3.1 guard keys present
        let g = &a.rest["guard_checks"]["clustering"];
        assert_eq!(g["funder_hops_top10_dev"], 2);
        assert_eq!(g["funder_hops_other"], 1);
        assert!(g.get("funder_hops").is_none());
    }

    #[test]
    fn real_is_locked() {
        let mut v: serde_json::Value =
            serde_json::from_str(&repo_strategy("swing_hunter.json")).unwrap();
        v["mode"] = "real".into();
        let c = StrategyConfig::parse(&v.to_string()).unwrap();
        assert_eq!(c.mode, StrategyMode::Real);
        assert_eq!(c.effective_mode(), StrategyMode::Paper);
        assert_eq!(c.real_locked_reason(), "needs_owner_approval");
    }

    #[test]
    fn rejects_bad_weights_and_missing_required() {
        let mut v: serde_json::Value =
            serde_json::from_str(&repo_strategy("swing_hunter.json")).unwrap();
        v["scoring"]["weights_by_phase"]["p1"]["momentum"] = 40.into();
        assert!(matches!(
            StrategyConfig::parse(&v.to_string()),
            Err(StrategyError::Invalid(_))
        ));
        let mut v: serde_json::Value =
            serde_json::from_str(&repo_strategy("swing_hunter.json")).unwrap();
        v["scoring"]["required"] = serde_json::json!(["scout", "risk"]);
        assert!(StrategyConfig::parse(&v.to_string()).is_err());
    }

    #[test]
    fn hot_reload_keeps_last_valid() {
        let dir = std::env::temp_dir().join(format!(
            "centurion-strat-{}-{}",
            std::process::id(),
            crate::now_ms()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.json");
        std::fs::write(&f, repo_strategy("swing_hunter.json")).unwrap();
        let mut st = StrategyStore::new(&dir);
        assert_eq!(st.poll(1).loaded, vec!["swing_hunter".to_string()]);
        assert_eq!(
            st.poll(2),
            ReloadReport::default(),
            "unchanged file is not reloaded"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&f, "{ broken").unwrap();
        let r = st.poll(3);
        assert_eq!(r.rejected.len(), 1);
        assert_eq!(
            st.active["swing_hunter"].config.config_rev, 1,
            "last valid kept"
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
        let mut v: serde_json::Value =
            serde_json::from_str(&repo_strategy("swing_hunter.json")).unwrap();
        v["config_rev"] = 2.into();
        std::fs::write(&f, v.to_string()).unwrap();
        st.poll(4);
        assert_eq!(st.active["swing_hunter"].config.config_rev, 2);
        assert_eq!(st.active["swing_hunter"].reloads, 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
