use serde::{Deserialize, Serialize};

/// Thresholds. `*_warn` < `*_fail`. A value of 0 for a `*_fail` disables the FAIL tier.
/// Wire/JSON keys are the snake_case field names (contracts v1.1).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct GuardConfig {
    pub allow_mint_authority: bool,
    pub allow_freeze_authority: bool,
    /// LP burned + locked % (AMM pools only).
    pub min_lp_safe_pct_warn: f64,
    pub min_lp_safe_pct_fail: f64,
    pub top_holders_share_pct_warn: f64,
    pub top_holders_share_pct_fail: f64,
    pub single_holder_pct_fail: f64,
    pub creator_share_pct_warn: f64,
    pub creator_share_pct_fail: f64,
    pub bundled_share_pct_warn: f64,
    pub bundled_share_pct_fail: f64,
    pub sniper_share_pct_warn: f64,
    pub sniper_share_pct_fail: f64,
    pub transfer_fee_bps_fail: u32,
    pub sell_tax_bps_warn: u32,
    pub sell_tax_bps_fail: u32,
    /// Creator launched >= N coins in the lookback window.
    pub serial_creator_warn: u32,
    /// Fraction of creator's prior coins that rugged (0–1).
    pub creator_rug_rate_fail: f64,
    /// Sum of WARN weights at or above which the verdict escalates to FAIL.
    pub warn_score_fail: u32,
    /// Treat a missing sell simulation as WARN (true) or UNKNOWN (false).
    pub require_sell_sim: bool,
}

impl Default for GuardConfig {
    fn default() -> Self {
        Self {
            allow_mint_authority: false,
            allow_freeze_authority: false,
            min_lp_safe_pct_warn: 95.0,
            min_lp_safe_pct_fail: 50.0,
            top_holders_share_pct_warn: 30.0,
            top_holders_share_pct_fail: 50.0,
            single_holder_pct_fail: 20.0,
            creator_share_pct_warn: 5.0,
            creator_share_pct_fail: 15.0,
            bundled_share_pct_warn: 10.0,
            bundled_share_pct_fail: 25.0,
            sniper_share_pct_warn: 10.0,
            sniper_share_pct_fail: 30.0,
            transfer_fee_bps_fail: 100,
            sell_tax_bps_warn: 300,
            sell_tax_bps_fail: 1_000,
            serial_creator_warn: 5,
            creator_rug_rate_fail: 0.5,
            warn_score_fail: 6,
            require_sell_sim: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::GuardConfig;

    /// The SQL classifier (`guard_weakened_fields`, migration 0007) overlays settings.guard_checks on
    /// `guard_config_defaults()`; it must match `GuardConfig::default()` exactly.
    #[test]
    fn sql_guard_defaults_match_rust() {
        let sql =
            include_str!("../../../supabase/migrations/0007_guard_weaken_requires_approval.sql");
        let start = sql
            .find("select '{\"allow_mint_authority\"")
            .expect("defaults literal")
            + 8;
        let end = start + sql[start..].find("}'").expect("end of literal") + 1;
        let from_sql: serde_json::Value = serde_json::from_str(&sql[start..end]).expect("json");
        let rust = serde_json::to_value(GuardConfig::default()).expect("serialize");
        assert_eq!(from_sql, rust);
    }
}
