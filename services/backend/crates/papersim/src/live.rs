//! **Phase 7 placeholder. DO NOT ENABLE without Boss approval.**
//!
//! A future `LiveExecutor` will build a swap transaction (Jupiter / direct AMM ix +
//! ComputeBudget + optional Jito tip) and ask a *remote custody signer* (MPC/KMS,
//! policy: max SOL per tx, program allow-list) for a signature. It will never hold or
//! load a raw private key.
use async_trait::async_trait;
use common::Mode;

use crate::{ExecError, Executor, Fill, Order, PoolState};

/// Explicitly unimplemented: always returns `ExecError::LiveDisabled`.
#[derive(Debug, Default)]
pub struct LiveExecutor;

#[async_trait]
impl Executor for LiveExecutor {
    fn mode(&self) -> Mode {
        Mode::Real
    }
    async fn execute(&self, _order: &Order, _pool: &PoolState) -> Result<Fill, ExecError> {
        // Deliberately not implemented: Real SOL is Phase 7 and requires Boss approval.
        Err(ExecError::LiveDisabled)
    }
}
