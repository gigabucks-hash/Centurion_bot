//! Approval-queue policy shared by the worker and API. The *backend* owns
//! `expires_at`; clients only display it.
use serde::{Deserialize, Serialize};

use crate::TsMs;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalKind {
    Buy,
    Sell,
    SellAll,
    StrategySettings,
    GuardWeakening,
    StrategyDelete,
    TeamAction,
    ResumeLive,
    Withdraw,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Executing,
    Filled,
    Failed,
    Rejected,
    Expired,
    Cancelled,
}

impl ApprovalStatus {
    /// Mirrors the SQL `approvals_guard` transition table.
    pub fn can_transition_to(self, next: ApprovalStatus) -> bool {
        use ApprovalStatus::*;
        matches!(
            (self, next),
            (Pending, Approved | Rejected | Expired | Cancelled)
                | (Approved, Executing | Expired)
                | (Executing, Filled | Failed)
        )
    }
}

/// Strategy/portfolio setting `approvalMode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalMode {
    Off,
    #[default]
    AskFirstBuy,
    AskEveryBuy,
}

/// Does this buy need a human approval?
/// `ask_first_buy` covers BOTH the first buy of the strategy/portfolio and the
/// first buy of each coin (UX spec §2; blueprint: "no buy without ask" for
/// portfolios, including the initial picks).
pub fn buy_needs_approval(
    mode: ApprovalMode,
    first_buy_of_owner: bool,
    first_buy_of_coin: bool,
) -> bool {
    match mode {
        ApprovalMode::Off => false,
        ApprovalMode::AskEveryBuy => true,
        ApprovalMode::AskFirstBuy => first_buy_of_owner || first_buy_of_coin,
    }
}

/// Server-side TTLs (per workspace, from `workspaces.*_ttl_seconds`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovalTtls {
    pub pick_seconds: u32,
    pub guard_change_seconds: u32,
}

impl Default for ApprovalTtls {
    fn default() -> Self {
        Self {
            pick_seconds: 600,
            guard_change_seconds: 86_400,
        }
    }
}

impl ApprovalTtls {
    pub fn expires_at(&self, kind: ApprovalKind, created_at: TsMs) -> TsMs {
        let secs = match kind {
            ApprovalKind::GuardWeakening | ApprovalKind::StrategySettings => {
                self.guard_change_seconds
            }
            _ => self.pick_seconds,
        };
        created_at + i64::from(secs) * 1000
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ask_first_buy_covers_first_portfolio_buy() {
        assert!(buy_needs_approval(ApprovalMode::AskFirstBuy, true, false));
        assert!(buy_needs_approval(ApprovalMode::AskFirstBuy, false, true));
        assert!(!buy_needs_approval(ApprovalMode::AskFirstBuy, false, false));
        assert!(buy_needs_approval(ApprovalMode::AskEveryBuy, false, false));
        assert!(!buy_needs_approval(ApprovalMode::Off, true, true));
    }

    #[test]
    fn ttls_are_server_side_defaults() {
        let t = ApprovalTtls::default();
        assert_eq!(t.expires_at(ApprovalKind::Buy, 0), 600_000);
        assert_eq!(t.expires_at(ApprovalKind::GuardWeakening, 0), 86_400_000);
    }

    #[test]
    fn transitions_match_sql() {
        use ApprovalStatus::*;
        assert!(Pending.can_transition_to(Expired));
        assert!(Approved.can_transition_to(Expired));
        assert!(!Approved.can_transition_to(Rejected));
        assert!(!Expired.can_transition_to(Approved));
    }
}
