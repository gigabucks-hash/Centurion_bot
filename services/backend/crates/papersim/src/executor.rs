use async_trait::async_trait;
use common::Mode;

use crate::model::{simulate, Fill, Order, PoolState, SimConfig, SimError};

#[derive(Debug, thiserror::Error)]
pub enum ExecError {
    #[error(transparent)]
    Sim(#[from] SimError),
    #[error("live execution is disabled until Phase 7 is approved")]
    LiveDisabled,
}

/// Executes an order against a pool snapshot. Implementations must be idempotent per
/// job id at the caller level (the job queue guarantees at-most-once dispatch).
#[async_trait]
pub trait Executor: Send + Sync {
    fn mode(&self) -> Mode;
    async fn execute(&self, order: &Order, pool: &PoolState) -> Result<Fill, ExecError>;
}

/// The only executor available in Phases 1–6.
#[derive(Debug, Clone, Default)]
pub struct PaperExecutor {
    pub cfg: SimConfig,
}

impl PaperExecutor {
    pub fn new(cfg: SimConfig) -> Self {
        Self { cfg }
    }
}

#[async_trait]
impl Executor for PaperExecutor {
    fn mode(&self) -> Mode {
        Mode::Practice
    }
    async fn execute(&self, order: &Order, pool: &PoolState) -> Result<Fill, ExecError> {
        // Latency is modelled inside `simulate` (competing flow + drift) rather than by
        // sleeping, so replays/backtests run at full speed and stay deterministic.
        Ok(simulate(pool, order, &self.cfg)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Side;

    #[tokio::test]
    async fn paper_executor_fills_and_is_paper_mode() {
        let ex = PaperExecutor::default();
        assert_eq!(ex.mode(), Mode::Practice);
        let pool = PoolState {
            sol_reserve: 30.0,
            token_reserve: 1e9,
        };
        let f = ex
            .execute(
                &Order {
                    side: Side::Buy,
                    amount_in: 0.1,
                    max_slippage_bps: 500,
                },
                &pool,
            )
            .await
            .expect("fill");
        assert!(f.simulated);
    }

    #[test]
    fn live_execution_feature_is_off_by_default() {
        assert!(
            !cfg!(feature = "live-execution"),
            "live-execution must stay disabled until Boss approves Phase 7"
        );
    }
}
