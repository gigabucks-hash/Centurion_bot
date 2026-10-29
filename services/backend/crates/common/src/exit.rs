//! Exit reasons (wire vocabulary `ExitReason`, SQL `public.exit_reason`). Order matches contracts.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExitReason {
    SellFloor,
    ProfitTarget,
    LossGuard,
    PeakTrail,
    /// Held too long: `time_stop_s` (and plan step `max_hold`). v1.0 `time_out`.
    MaxHold,
    /// No trade for `idle_exit_seconds`. v1.0 `inactivity`.
    Idle,
    SellPressure,
    /// No new high in time (preset `new_high_timeout`). v1.0 `stall` -> `no_new_high`.
    NoNewHigh,
    RugDetected,
    DrawdownHalt,
    Manual,
    StrategyRetired,
    PracticeReset,
    /// 1.1.4 `stall_exit`: |price change| over `window_s` stayed below `min_move_pct`.
    Stall,
}

impl ExitReason {
    pub const ALL: [ExitReason; 14] = [
        ExitReason::SellFloor,
        ExitReason::ProfitTarget,
        ExitReason::LossGuard,
        ExitReason::PeakTrail,
        ExitReason::MaxHold,
        ExitReason::Idle,
        ExitReason::SellPressure,
        ExitReason::NoNewHigh,
        ExitReason::RugDetected,
        ExitReason::DrawdownHalt,
        ExitReason::Manual,
        ExitReason::StrategyRetired,
        ExitReason::PracticeReset,
        ExitReason::Stall,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            ExitReason::SellFloor => "sell_floor",
            ExitReason::ProfitTarget => "profit_target",
            ExitReason::LossGuard => "loss_guard",
            ExitReason::PeakTrail => "peak_trail",
            ExitReason::MaxHold => "max_hold",
            ExitReason::Idle => "idle",
            ExitReason::SellPressure => "sell_pressure",
            ExitReason::NoNewHigh => "no_new_high",
            ExitReason::RugDetected => "rug_detected",
            ExitReason::DrawdownHalt => "drawdown_halt",
            ExitReason::Manual => "manual",
            ExitReason::StrategyRetired => "strategy_retired",
            ExitReason::PracticeReset => "practice_reset",
            ExitReason::Stall => "stall",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_matches_as_str_and_contracts() {
        let contracts = include_str!("../../../../../packages/contracts/src/wire/events.ts");
        for r in ExitReason::ALL {
            let s = serde_json::to_value(r).expect("ser");
            assert_eq!(s, r.as_str());
            assert!(
                contracts.contains(&format!("\"{}\"", r.as_str())),
                "{} missing in events.ts",
                r.as_str()
            );
        }
    }
}
