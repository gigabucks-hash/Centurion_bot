//! Centurion P1 engine (PAPER ONLY). M1: supervised ingest with failover, per-stage watchdog,
//! RPC credit meter, Scout hard filters, specialist/Lead orchestrator, LiveExecutor guard
//! (design-only, refuses everything) and a localhost status view.
//!
//! Hard rules enforced in code: `TRADING_MODE` must be `paper` ([`config::EngineConfig::from_env`]),
//! no key material is loaded, no transaction is ever built or signed ([`live`]).
#![cfg_attr(test, allow(clippy::unwrap_used))]
pub mod config;
pub mod credits;
pub mod http;
pub mod latency;
pub mod lead;
pub mod live;
pub mod scout;
pub mod stats;
pub mod strategy;
pub mod supervisor;
pub mod watchdog;

/// Wall-clock milliseconds since the epoch.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
