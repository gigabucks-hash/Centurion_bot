use async_trait::async_trait;
use common::{Mint, Venue};
use serde::{Deserialize, Serialize};

/// Result of simulating a small buy-then-sell (honeypot check). Produced by
/// `simulateTransaction` against current state; never signed or sent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SellSimulation {
    pub can_sell: bool,
    /// Effective round-trip loss beyond pool fees, in bps.
    pub tax_bps: u32,
    pub error: Option<String>,
}

/// State of a mint/freeze authority. JSON: `"revoked"` or `{"set": "<pubkey>"}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Authority {
    Revoked,
    Set(String),
}

/// Everything the guard needs. Absent fields => that check reports UNKNOWN.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct GuardInput {
    pub venue: Option<Venue>,
    pub mint_authority: Option<Authority>,
    pub freeze_authority: Option<Authority>,
    pub lp_burned_pct: Option<f64>,
    pub lp_locked_pct: Option<f64>,
    /// Holder balances as % of supply, descending, excluding pool/burn accounts.
    pub holder_pcts: Option<Vec<f64>>,
    pub creator_share_pct: Option<f64>,
    pub bundled_share_pct: Option<f64>,
    pub sniper_share_pct: Option<f64>,
    /// Token-2022 transfer-fee extension, if any.
    pub transfer_fee_bps: Option<u32>,
    pub sell_sim: Option<SellSimulation>,
    pub creator_launches_30d: Option<u32>,
    pub creator_rugged_30d: Option<u32>,
}

#[derive(Debug, thiserror::Error)]
pub enum SourceError {
    #[error("upstream unavailable: {0}")]
    Unavailable(String),
    #[error("not implemented in phase 1: {0}")]
    NotImplemented(&'static str),
}

/// Fetches guard inputs for a mint (Helius DAS + RPC + our holder index).
#[async_trait]
pub trait GuardDataSource: Send + Sync {
    async fn fetch(&self, mint: &Mint) -> Result<GuardInput, SourceError>;
}

/// Phase-1 stub: returns a fixed input (used by tests and `--replay`).
#[derive(Debug, Clone, Default)]
pub struct StubDataSource {
    pub fixed: GuardInput,
}

#[async_trait]
impl GuardDataSource for StubDataSource {
    async fn fetch(&self, _mint: &Mint) -> Result<GuardInput, SourceError> {
        Ok(self.fixed.clone())
    }
}
