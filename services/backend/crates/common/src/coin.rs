use serde::{Deserialize, Serialize};

use crate::{Mint, TsMs, Untrusted};

/// Which discovery stream a coin came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stream {
    /// Still on a launchpad bonding curve.
    Bonding,
    /// Migrated to an AMM pool.
    Graduated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Launchpad {
    PumpFun,
    PumpSwap,
    RaydiumLaunchLab,
    MeteoraDbc,
    Moonshot,
    Other,
}

/// Point-in-time metrics for a coin. Every field is optional: absent data must be
/// handled explicitly by the rule engines (never silently treated as 0).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct CoinMetrics {
    pub price_usd: Option<f64>,
    pub market_cap_usd: Option<f64>,
    pub liquidity_usd: Option<f64>,
    pub volume_1h_usd: Option<f64>,
    pub volume_24h_usd: Option<f64>,
    pub holders: Option<u64>,
    pub buyers_1h: Option<u64>,
    pub buys_1h: Option<u64>,
    pub sells_1h: Option<u64>,
    pub top10_pct: Option<f64>,
    pub lp_burn_pct: Option<f64>,
    pub move_1h_pct: Option<f64>,
    pub drawdown_pct: Option<f64>,
    pub dev_pct: Option<f64>,
    pub bundlers_pct: Option<f64>,
    pub snipers_pct: Option<f64>,
    pub age_minutes: Option<f64>,
    pub graduated_seconds: Option<f64>,
    /// Bonding-curve progress 0–100 (bonding stream only).
    pub curve_progress_pct: Option<f64>,
}

impl CoinMetrics {
    pub fn buy_sell_ratio(&self) -> Option<f64> {
        match (self.buys_1h, self.sells_1h) {
            (Some(b), Some(0)) if b > 0 => Some(f64::INFINITY),
            (Some(b), Some(s)) if s > 0 => Some(b as f64 / s as f64),
            _ => None,
        }
    }
    pub fn turnover_1h(&self) -> Option<f64> {
        match (self.volume_1h_usd, self.market_cap_usd) {
            (Some(v), Some(m)) if m > 0.0 => Some(v / m),
            _ => None,
        }
    }
}

/// A coin as seen by the pipeline at one instant.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoinSnapshot {
    pub mint: Mint,
    pub stream: Stream,
    pub launchpad: Launchpad,
    pub creator: Option<String>,
    pub observed_at: TsMs,
    pub metrics: CoinMetrics,
    /// Token-provided name/symbol/uri. Never used by rule logic.
    pub name: Untrusted<String>,
    pub symbol: Untrusted<String>,
    pub uri: Untrusted<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derived_metrics() {
        let m = CoinMetrics {
            buys_1h: Some(30),
            sells_1h: Some(10),
            volume_1h_usd: Some(50_000.0),
            market_cap_usd: Some(100_000.0),
            ..Default::default()
        };
        assert_eq!(m.buy_sell_ratio(), Some(3.0));
        assert_eq!(m.turnover_1h(), Some(0.5));
        assert_eq!(CoinMetrics::default().buy_sell_ratio(), None);
    }
}
