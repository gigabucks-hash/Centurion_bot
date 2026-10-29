//! Stream sources. The pipeline only sees the provider-agnostic [`StreamSource`] trait; each
//! implementation runs as its own tokio task and pushes [`IngestEvent`]s into a bounded mpsc
//! channel (backpressure instead of unbounded memory).
//!
//! * [`helius::HeliusSource`]: Helius standard WebSocket (`logsSubscribe` on the launch program)
//!   + RPC `getTransaction` enrichment. Default for paper mode (`HELIUS_API_KEY`).
//! * [`pumpportal::PumpPortalSource`]: PumpPortal data WebSocket (kept as an alternative).
//! * [`yellowstone::YellowstoneSource`]: Geyser gRPC, **pending** Boss's provider choice.
//! * [`replay::ReplaySource`]: JSONL fixtures for tests and offline runs.

pub mod helius;
pub mod pumpportal;
pub mod replay;
pub mod yellowstone;

use async_trait::async_trait;
use common::{CoinMetrics, Launchpad, Mint, TsMs, Untrusted, Venue};
use guard::GuardInput;
use papersim::{PoolState, Side};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, watch};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NewCoin {
    pub mint: Mint,
    pub venue: Venue,
    pub launchpad: Launchpad,
    pub creator: Option<String>,
    pub ts: TsMs,
    pub name: Untrusted<String>,
    pub symbol: Untrusted<String>,
    #[serde(default)]
    pub uri: Untrusted<String>,
    #[serde(default)]
    pub pool: Option<PoolState>,
    /// Pre-computed metrics (replay fixtures / enriched sources).
    #[serde(default)]
    pub metrics: Option<CoinMetrics>,
    /// Pre-computed guard input (replay fixtures only).
    #[serde(default)]
    pub guard: Option<GuardInput>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TradeTick {
    pub mint: Mint,
    pub side: Side,
    pub sol: f64,
    pub tokens: f64,
    pub trader: String,
    pub ts: TsMs,
    pub pool: Option<PoolState>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IngestEvent {
    NewCoin(Box<NewCoin>),
    Trade(TradeTick),
    Migrated { mint: Mint, ts: TsMs },
}

impl IngestEvent {
    pub fn mint(&self) -> &Mint {
        match self {
            IngestEvent::NewCoin(c) => &c.mint,
            IngestEvent::Trade(t) => &t.mint,
            IngestEvent::Migrated { mint, .. } => mint,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SourceError {
    #[error("not implemented in phase 1 skeleton: {0}")]
    NotImplemented(&'static str),
    #[error("not configured: {0}")]
    NotConfigured(&'static str),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("decode: {0}")]
    Decode(String),
    #[error("downstream channel closed")]
    ChannelClosed,
}

/// A long-running, provider-agnostic producer of coin events.
#[async_trait]
pub trait StreamSource: Send + Sync {
    fn name(&self) -> &'static str;
    /// Run until `shutdown` flips to `true` or the source ends. Implementations must
    /// reconnect with jittered exponential backoff and resume from the last slot.
    async fn run(
        &self,
        tx: mpsc::Sender<IngestEvent>,
        shutdown: watch::Receiver<bool>,
    ) -> Result<(), SourceError>;
}
