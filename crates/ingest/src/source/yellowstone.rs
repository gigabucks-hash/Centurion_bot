//! Yellowstone (Geyser) gRPC source via Helius LaserStream or any Yellowstone endpoint.
//!
//! Planned subscription (week 1): `SubscribeRequest` with
//! * `transactions` filter `account_include = [pump.fun program, PumpSwap, Raydium
//!   LaunchLab, Meteora DBC, Raydium CPMM/AMM v4]`, `vote = false`, `failed = false`;
//! * commitment `processed` for discovery, `confirmed` for fills;
//! * auth via `x-token` metadata from `YELLOWSTONE_X_TOKEN` (env only).
//!
//! Decoding (create / trade / migrate instructions → [`IngestEvent`]) lives in a pure
//! `decode` module so it can be tested against captured transactions.
//! Phase 1 skeleton: interface only; `tonic` + `yellowstone-grpc-proto` are added in
//! week 1 to keep the initial build light.
use async_trait::async_trait;
use tokio::sync::{mpsc, watch};

use super::{CoinSource, IngestEvent, SourceError};
use crate::config::Secret;

/// Program ids we filter on (public, on-chain).
pub const PUMP_FUN_PROGRAM: &str = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
pub const PUMP_SWAP_PROGRAM: &str = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

pub struct YellowstoneSource {
    pub endpoint: String,
    pub x_token: Secret,
    pub programs: Vec<String>,
}

impl YellowstoneSource {
    pub fn new(endpoint: String, x_token: Secret) -> Self {
        Self {
            endpoint,
            x_token,
            programs: vec![PUMP_FUN_PROGRAM.into(), PUMP_SWAP_PROGRAM.into()],
        }
    }
}

#[async_trait]
impl CoinSource for YellowstoneSource {
    fn name(&self) -> &'static str {
        "yellowstone"
    }
    async fn run(
        &self,
        _tx: mpsc::Sender<IngestEvent>,
        _shutdown: watch::Receiver<bool>,
    ) -> Result<(), SourceError> {
        if self.x_token.is_empty() {
            return Err(SourceError::NotConfigured("YELLOWSTONE_X_TOKEN"));
        }
        tracing::warn!(endpoint = %self.endpoint, programs = ?self.programs, "Yellowstone gRPC client not implemented yet (Phase 1 week 1)");
        Err(SourceError::NotImplemented("yellowstone grpc subscribe"))
    }
}
