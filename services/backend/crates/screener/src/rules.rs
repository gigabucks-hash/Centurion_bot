use std::collections::HashSet;

use common::{CoinMetrics, Stream};
use serde::{Deserialize, Serialize};

/// Metrics a rule can reference. JSON names are camelCase.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Metric {
    LiquidityUsd,
    MarketCapUsd,
    Volume1hUsd,
    Volume24hUsd,
    Holders,
    Buyers1h,
    BuySellRatio,
    Turnover1h,
    Top10Pct,
    LpBurnPct,
    Move1hPct,
    DrawdownPct,
    DevPct,
    BundlersPct,
    SnipersPct,
    AgeMinutes,
    GraduatedSeconds,
    CurveProgressPct,
}

impl Metric {
    pub fn read(self, m: &CoinMetrics) -> Option<f64> {
        match self {
            Metric::LiquidityUsd => m.liquidity_usd,
            Metric::MarketCapUsd => m.market_cap_usd,
            Metric::Volume1hUsd => m.volume_1h_usd,
            Metric::Volume24hUsd => m.volume_24h_usd,
            Metric::Holders => m.holders.map(|v| v as f64),
            Metric::Buyers1h => m.buyers_1h.map(|v| v as f64),
            Metric::BuySellRatio => m.buy_sell_ratio(),
            Metric::Turnover1h => m.turnover_1h(),
            Metric::Top10Pct => m.top10_pct,
            Metric::LpBurnPct => m.lp_burn_pct,
            Metric::Move1hPct => m.move_1h_pct,
            Metric::DrawdownPct => m.drawdown_pct,
            Metric::DevPct => m.dev_pct,
            Metric::BundlersPct => m.bundlers_pct,
            Metric::SnipersPct => m.snipers_pct,
            Metric::AgeMinutes => m.age_minutes,
            Metric::GraduatedSeconds => m.graduated_seconds,
            Metric::CurveProgressPct => m.curve_progress_pct,
        }
        .filter(|v| !v.is_nan())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub enum MissingPolicy {
    /// Treat as a failed check (hard: reject; weighted: 0 pts / penalty).
    #[default]
    Fail,
    /// Weighted: award 0 points but no penalty. Hard: treat as passed (logged).
    Skip,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
    /// Weighted `gte`/`gt`/`lte`/`lt` only: linear partial credit. At `zeroAt` the rule
    /// is worth 0, at `value` it is worth full points.
    #[serde(default)]
    pub zero_at: Option<f64>,
    #[serde(default)]
    pub on_missing: Option<MissingPolicy>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuleSet {
    pub version: u32,
    pub name: String,
    #[serde(default = "default_streams")]
    pub streams: Vec<Stream>,
    pub pass_mark: f64,
    #[serde(default)]
    pub on_missing: MissingPolicy,
    #[serde(default)]
    pub hard: Vec<Rule>,
    #[serde(default)]
    pub weighted: Vec<Rule>,
}

fn default_streams() -> Vec<Stream> {
    vec![Stream::Bonding, Stream::Graduated]
}

#[derive(Debug, thiserror::Error)]
pub enum RuleSetError {
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid rule set: {0}")]
    Invalid(String),
}

pub const SUPPORTED_VERSION: u32 = 1;
pub const PASS_MARK_RANGE: (f64, f64) = (50.0, 125.0);

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
        let (lo, hi) = PASS_MARK_RANGE;
        if !(lo..=hi).contains(&self.pass_mark) {
            return bad(format!("passMark {} outside {lo}–{hi}", self.pass_mark));
        }
        if self.streams.is_empty() {
            return bad("streams must not be empty".into());
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
                            "{}: hard rules take no points/penalty/zeroAt",
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
                            return bad(format!("{}: zeroAt needs a scalar op", r.id));
                        };
                        let ok = match r.op {
                            Op::Gte | Op::Gt => z < v,
                            Op::Lte | Op::Lt => z > v,
                            _ => false,
                        };
                        if !ok {
                            return bad(format!(
                                "{}: zeroAt must lie on the failing side of value",
                                r.id
                            ));
                        }
                    }
                }
            }
        }
        if self.max_score() < self.pass_mark && !self.weighted.is_empty() {
            return bad(format!(
                "passMark {} unreachable: max weighted score is {}",
                self.pass_mark,
                self.max_score()
            ));
        }
        Ok(())
    }
}
