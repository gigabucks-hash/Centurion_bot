use serde::{Deserialize, Serialize};

/// Thresholds. `*_warn` < `*_fail`. A value of 0 for a `*_fail` disables the FAIL tier.
/// Mirrors blueprint keys `maxDevPercent`, `maxBundlersPercent`, `maxSnipersPercent`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GuardConfig {
    pub allow_mint_authority: bool,
    pub allow_freeze_authority: bool,
    /// LP burned + locked % (graduated pools only).
    pub min_lp_safe_pct_warn: f64,
    pub min_lp_safe_pct_fail: f64,
    pub top10_pct_warn: f64,
    pub top10_pct_fail: f64,
    pub single_holder_pct_fail: f64,
    pub dev_pct_warn: f64,
    pub dev_pct_fail: f64,
    pub bundlers_pct_warn: f64,
    pub bundlers_pct_fail: f64,
    pub snipers_pct_warn: f64,
    pub snipers_pct_fail: f64,
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
            top10_pct_warn: 30.0,
            top10_pct_fail: 50.0,
            single_holder_pct_fail: 20.0,
            dev_pct_warn: 5.0,
            dev_pct_fail: 15.0,
            bundlers_pct_warn: 10.0,
            bundlers_pct_fail: 25.0,
            snipers_pct_warn: 10.0,
            snipers_pct_fail: 30.0,
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
