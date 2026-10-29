//! `guard` — ShieldBot-equivalent anti-rug checks.
//!
//! Input is a [`GuardInput`] gathered by a [`GuardDataSource`] (RPC/DAS/indexer —
//! stubbed in Phase 1). Each check yields PASS / WARN / FAIL / UNKNOWN with a reason
//! and the measured value; [`assess`] folds them into one [`Verdict`] plus a risk
//! score. Pure functions, no I/O, so everything is unit-testable and replayable.

mod bundles;
mod checks;
mod config;
mod estimate;
mod impact;
mod source;

pub use bundles::{analyze_early_buys, EarlyBuy, EarlyBuyStats};
pub use checks::{assess, CheckStatus, GuardCheck, GuardReport, Verdict};
pub use config::GuardConfig;
pub use estimate::{static_estimate, RiskLevel, StaticEstimate};
pub use impact::{impact, weakened_fields, ImpactReport, Outcome, Sample};
pub use source::{
    Authority, GuardDataSource, GuardInput, SellSimulation, SourceError, StubDataSource,
};
