//! Static risk estimate for a guard change (ships first: `POST /v1/strategies/{id}/guard-impact/estimate`).
//!
//! No replay: classifies which fields get weaker and bounds the extra coins that could pass using
//! per-check block counts already aggregated in `strategy_funnel_hourly.rejections`. O(fields),
//! answers in microseconds. The full replay ([`crate::impact`]) is served by
//! `POST /v1/strategies/{id}/guard-impact` only when `GUARD_REPLAY_ENABLED=true`.
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{impact::weakened_fields, GuardConfig};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StaticEstimate {
    pub method: String,
    pub weakening: bool,
    pub weakened_fields: Vec<String>,
    pub risk_level: RiskLevel,
    /// Upper bound of coins (in the window) that were blocked *only* by now-weakened checks.
    pub max_extra_passes: u64,
    pub window_evaluated: u64,
    pub reasons: Vec<String>,
}

/// Map a config field (`devPctFail`) to the guard check / rejection reason key it controls.
fn check_of(field: &str) -> &str {
    match field {
        "allowMintAuthority" => "mint_authority",
        "allowFreezeAuthority" => "freeze_authority",
        "minLpSafePctWarn" | "minLpSafePctFail" => "lp_safe",
        "top10PctWarn" | "top10PctFail" | "singleHolderPctFail" => "top_holders",
        "devPctWarn" | "devPctFail" => "dev",
        "bundlersPctWarn" | "bundlersPctFail" => "bundlers",
        "snipersPctWarn" | "snipersPctFail" => "snipers",
        "transferFeeBpsFail" => "transfer_fee",
        "sellTaxBpsWarn" | "sellTaxBpsFail" | "requireSellSim" => "sell_simulation",
        "serialCreatorWarn" | "creatorRugRateFail" => "serial_creator",
        _ => "warn_score",
    }
}

/// `blocked_by`: rejection counts per check over the window; `evaluated`: coins evaluated.
pub fn static_estimate(
    old: &GuardConfig,
    new: &GuardConfig,
    blocked_by: &BTreeMap<String, u64>,
    evaluated: u64,
) -> StaticEstimate {
    let fields = weakened_fields(old, new);
    let mut reasons = Vec::new();
    let critical = fields.iter().any(|f| {
        matches!(
            f.as_str(),
            "allowMintAuthority" | "allowFreezeAuthority" | "requireSellSim"
        )
    });
    let fail_level = fields.iter().filter(|f| f.ends_with("Fail")).count();
    let risk_level = if fields.is_empty() {
        RiskLevel::Low
    } else if critical {
        reasons.push(
            "Allows mint/freeze authority or skips the sell simulation (honeypot risk)".into(),
        );
        RiskLevel::Critical
    } else if fail_level > 0 || fields.len() >= 3 {
        reasons.push(format!("{fail_level} blocking threshold(s) loosened"));
        RiskLevel::High
    } else {
        reasons.push("Only warning thresholds loosened".into());
        RiskLevel::Medium
    };
    let mut checks: Vec<&str> = fields.iter().map(|f| check_of(f)).collect();
    checks.sort_unstable();
    checks.dedup();
    let max_extra_passes = checks
        .iter()
        .map(|c| blocked_by.get(*c).copied().unwrap_or(0))
        .sum::<u64>()
        .min(evaluated);
    StaticEstimate {
        method: "static_v1".into(),
        weakening: !fields.is_empty(),
        weakened_fields: fields,
        risk_level,
        max_extra_passes,
        window_evaluated: evaluated,
        reasons,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stats() -> BTreeMap<String, u64> {
        BTreeMap::from([
            ("dev".into(), 40),
            ("bundlers".into(), 25),
            ("sell_simulation".into(), 5),
        ])
    }

    #[test]
    fn no_change_is_low() {
        let c = GuardConfig::default();
        let e = static_estimate(&c, &c, &stats(), 1000);
        assert_eq!(e.risk_level, RiskLevel::Low);
        assert!(!e.weakening);
        assert_eq!(e.max_extra_passes, 0);
    }

    #[test]
    fn fail_threshold_is_high_and_bounded_by_block_counts() {
        let old = GuardConfig::default();
        let new = GuardConfig {
            dev_pct_fail: 25.0,
            ..old.clone()
        };
        let e = static_estimate(&old, &new, &stats(), 1000);
        assert_eq!(e.risk_level, RiskLevel::High);
        assert_eq!(e.max_extra_passes, 40);
    }

    #[test]
    fn skipping_sell_sim_is_critical() {
        let old = GuardConfig::default();
        let new = GuardConfig {
            require_sell_sim: false,
            ..old.clone()
        };
        let e = static_estimate(&old, &new, &stats(), 1000);
        assert_eq!(e.risk_level, RiskLevel::Critical);
        assert!(serde_json::to_value(&e)
            .map(|v| {
                common::units::assert_no_floats(&v);
                true
            })
            .unwrap_or(false));
    }
}
