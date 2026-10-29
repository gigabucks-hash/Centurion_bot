//! Shared domain types for solbot.
//!
//! Design rules:
//! * Anything that originates from token metadata (name, symbol, URI, description)
//!   is wrapped in [`Untrusted`] so it can never be confused with trusted data and is
//!   never fed to rule logic or an LLM prompt unescaped.
//! * Trading mode is [`Mode::Paper`] only during Phases 1–6.

pub mod approval;
pub mod error_codes;
pub mod portfolio;
pub mod coin;
pub mod event;
pub mod ids;
pub mod mode;
pub mod units;
pub mod untrusted;

pub use approval::{
    buy_needs_approval, decide, expire, Approval, ApprovalKind, ApprovalMode, ApprovalStatus, ApprovalTtls,
    DecidedVia, Decision, DecisionOutcome, DecisionRequest,
};
pub use error_codes::ErrorCode;
pub use coin::{CoinMetrics, CoinSnapshot, Launchpad, Stream};
pub use event::{Actor, Event, EventKind, ExpireReason, EVENT_SCHEMA_VERSION};
pub use ids::{CoinKey, Mint, PositionKey};
pub use mode::Mode;
pub use units::{Dec, Lamports, RawAmount, SignedLamports, UnitError};
pub use untrusted::Untrusted;

/// Lamports per SOL.
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

/// Milliseconds since the Unix epoch.
pub type TsMs = i64;

/// Convert lamports to SOL for internal f64 maths/logging only (never put the result on the wire).
pub fn lamports_to_sol(l: u64) -> f64 {
    l as f64 / LAMPORTS_PER_SOL as f64
}
