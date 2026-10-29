//! `papersim` — paper-trading fill simulation and the [`Executor`] trait.
//!
//! Only [`PaperExecutor`] exists. A `LiveExecutor` is compiled **only** with the
//! `live-execution` cargo feature (off by default) and is an explicit
//! `unimplemented!()` stub until Boss approves Phase 7. This crate never sees a
//! private key: a future live executor will request signatures from a remote custody
//! signer (MPC/KMS) under policy, not hold keys.

mod executor;
mod failure;
mod model;

pub use executor::{ExecError, Executor, PaperExecutor};
pub use failure::{no_pool_reason, order_failed, order_failed_from, OrderFailed};
pub use model::{simulate, Fill, FillWire, Order, PoolState, Side, SimConfig, SimError};

#[cfg(feature = "live-execution")]
pub mod live;
