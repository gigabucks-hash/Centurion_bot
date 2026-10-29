//! Shared domain types for solbot.
//!
//! Design rules:
//! * Anything that originates from token metadata (name, symbol, URI, description)
//!   is wrapped in [`Untrusted`] so it can never be confused with trusted data and is
//!   never fed to rule logic or an LLM prompt unescaped.
//! * Trading mode is [`Mode::Paper`] only during Phases 1–6.

pub mod approval;
pub mod coin;
pub mod event;
pub mod ids;
pub mod mode;
pub mod units;
pub mod untrusted;

pub use approval::{buy_needs_approval, ApprovalKind, ApprovalMode, ApprovalStatus, ApprovalTtls};
pub use coin::{CoinMetrics, CoinSnapshot, Launchpad, Stream};
pub use event::{Actor, Event, EventKind, ExpireReason};
pub use ids::{CoinKey, Mint, PositionKey};
pub use mode::Mode;
pub use units::{Dec, Lamports, RawAmount, SignedLamports, UnitError};
pub use untrusted::Untrusted;

/// Lamports per SOL.
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

/// Milliseconds since the Unix epoch.
pub type TsMs = i64;

/// Convert lamports to SOL.
pub fn lamports_to_sol(l: u64) -> f64 {
    l as f64 / LAMPORTS_PER_SOL as f64
}
