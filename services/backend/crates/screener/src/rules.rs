use std::collections::HashSet;

use common::{CoinMetrics, Venue};
use serde::{Deserialize, Serialize};

/// Metrics a rule can reference. JSON names are snake_case.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Metric {
    LiquidityUsd,
    McapUsd,
    #[serde(rename = "volume_1h_usd")]
    Volume1hUsd,
    #[serde(rename = "volume_24h_usd")]
    Volume24hUsd,
    HolderCount,
    #[serde(rename = "unique_buyers_1h")]
    UniqueBuyers1h,
    BuyToSellRatio,
    #[serde(rename = "volume_to_mcap_1h")]
    VolumeToMcap1h,
    TopHoldersSharePct,
    LpBurnedPct,
    #[serde(rename = "change_1h_pct")]
    Change1hPct,
    OffHighPct,
    CreatorSharePct,
    BundledSharePct,
    SniperSharePct,
    AgeMinutes,
    SinceMigrationSeconds,
    CurveProgressPct,
}

impl Metric {
    pub fn read(self, m: &CoinMetrics) -> Option<f64> {
        match self {
            Metric::LiquidityUsd => m.liquidity_usd,
            Metric::McapUsd => m.mcap_usd,
            Metric::Volume1hUsd => m.volume_1h_usd,
            Metric::Volume24hUsd => m.volume_24h_usd,
            Metric::HolderCount => m.holder_count.map(|v| v as f64),
            Metric::UniqueBuyers1h => m.unique_buyers_1h.map(|v| v as f64),
            Metric::BuyToSellRatio => m.buy_to_sell_ratio(),
            Metric::VolumeToMcap1h => m.volume_to_mcap_1h(),
            Metric::TopHoldersSharePct => m.top_holders_share_pct,
            Metric::LpBurnedPct => m.lp_burned_pct,
            Metric::Change1hPct => m.change_1h_pct,
            Metric::OffHighPct => m.off_high_pct,
            Metric::CreatorSharePct => m.creator_share_pct,
            Metric::BundledSharePct => m.bundled_share_pct,
            Metric::SniperSharePct => m.sniper_share_pct,
            Metric::AgeMinutes => m.age_minutes,
            Metric::SinceMigrationSeconds => m.since_migration_seconds,
            Metric::CurveProgressPct => m.curve_progress_pct,
        }
        .filter(|v| !v.is_nan())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Op {
    Gte,
    Gt,
    Lte,
    Lt,
    /// Inclusive range `[lo, hi]`.
    Between,
    /// Outside the inclusive range `[lo, hi]`.
    Outside,
}

/// Either a scalar or a `[lo, hi]` pair, depending on the op.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Threshold {
    Scalar(f64),
    Range([f64; 2]),
}

/// What to do when the metric is unavailable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MissingPolicy {
    /// Treat as a failed check (hard: reject; weighted: 0 pts / penalty).
    #[default]
    Fail,
    /// Weighted: award 0 points but no penalty. Hard: treat as passed (logged).
    Skip,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct Rule {
    pub id: String,
    pub metric: Metric,
    pub op: Op,
    pub value: Threshold,
    /// Weighted rules only: points awarded on pass.
    #[serde(default)]
    pub points: Option<f64>,
    /// Weighted rules only: points subtracted on fail.
    #[serde(default)]
    pub penalty: Option<f64>,
    /// Weighted `gte`/`gt`/`lte`/`lt` only: linear partial credit. At `zero_at` the rule
    /// is worth 0, at `value` it is worth full points.
    #[serde(default)]
    pub zero_at: Option<f64>,
    #[serde(default)]
    pub on_missing: Option<MissingPolicy>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub struct RuleSet {
    pub version: u32,
    pub name: String,
    #[serde(default = "default_venues")]
    pub venues: Vec<Venue>,
    pub score_threshold: f64,
    #[serde(default)]
    pub on_missing: MissingPolicy,
    #[serde(default)]
    pub hard: Vec<Rule>,
    #[serde(default)]
    pub weighted: Vec<Rule>,
}

fn default_venues() -> Vec<Venue> {
    vec![Venue::Curve, Venue::Amm]
}

#[derive(Debug, thiserror::Error)]
pub enum RuleSetError {
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid rule set: {0}")]
    Invalid(String),
}

pub const SUPPORTED_VERSION: u32 = 1;
pub const SCORE_THRESHOLD_RANGE: (f64, f64) = (50.0, 125.0);

impl RuleSet {
    pub fn from_json(s: &str) -> Result<Self, RuleSetError> {
        let rs: RuleSet = serde_json::from_str(s)?;
        rs.validate()?;
        Ok(rs)
    }

    pub fn max_score(&self) -> f64 {
        self.weighted.iter().filter_map(|r| r.points).sum()
    }

    pub fn validate(&self) -> Result<(), RuleSetError> {
        let bad = |m: String| Err(RuleSetError::Invalid(m));
        if self.version != SUPPORTED_VERSION {
            return bad(format!("unsupported version {}", self.version));
        }
        let (lo, hi) = SCORE_THRESHOLD_RANGE;
        if !(lo..=hi).contains(&self.score_threshold) {
            return bad(format!(
                "score_threshold {} outside {lo}–{hi}",
                self.score_threshold
            ));
        }
        if self.venues.is_empty() {
            return bad("venues must not be empty".into());
        }
        let mut seen = HashSet::new();
        for (class, rules) in [("hard", &self.hard), ("weighted", &self.weighted)] {
            for r in rules {
                if r.id.is_empty() || !seen.insert(r.id.clone()) {
                    return bad(format!("duplicate or empty rule id '{}'", r.id));
                }
                match (r.op, r.value) {
                    (Op::Between | Op::Outside, Threshold::Range([a, b])) if a <= b => {}
                    (Op::Between | Op::Outside, _) => {
                        return bad(format!("{}: op needs [lo, hi] with lo <= hi", r.id))
                    }
                    (_, Threshold::Scalar(v)) if v.is_finite() => {}
                    _ => return bad(format!("{}: op needs a finite scalar value", r.id)),
                }
                if class == "hard" {
                    if r.points.is_some() || r.penalty.is_some() || r.zero_at.is_some() {
                        return bad(format!(
                            "{}: hard rules take no points/penalty/zero_at",
                            r.id
                        ));
                    }
                } else {
                    match r.points {
                        Some(p) if p > 0.0 && p <= 100.0 => {}
                        _ => return bad(format!("{}: weighted points must be in (0, 100]", r.id)),
                    }
                    if let Some(p) = r.penalty {
                        if !(0.0..=100.0).contains(&p) {
                            return bad(format!("{}: penalty must be in [0, 100]", r.id));
                        }
                    }
                    if let Some(z) = r.zero_at {
                        let Threshold::Scalar(v) = r.value else {
                            return bad(format!("{}: zero_at needs a scalar op", r.id));
                        };
                        let ok = match r.op {
                            Op::Gte | Op::Gt => z < v,
                            Op::Lte | Op::Lt => z > v,
                            _ => false,
                        };
                        if !ok {
                            return bad(format!(
                                "{}: zero_at must lie on the failing side of value",
                                r.id
                            ));
                        }
                    }
                }
            }
        }
        if self.max_score() < self.score_threshold && !self.weighted.is_empty() {
            return bad(format!(
                "score_threshold {} unreachable: max weighted score is {}",
                self.score_threshold,
                self.max_score()
            ));
        }
        Ok(())
    }
}
