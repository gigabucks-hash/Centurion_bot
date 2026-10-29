use serde::{Deserialize, Serialize};

use crate::{TsMs, Untrusted};

/// Who caused an event (shown in the activity feed). Aligned with the web
/// `ActorKind` union.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Actor {
    Ingest,
    Screener,
    Guard,
    Entry,
    Executor,
    Exit,
    User,
    System,
}

/// Canonical, namespaced event kinds (`<domain>.<verb>`). Append-only: new kinds
/// may be added, existing ones are never renamed. See docs/EVENTS_SCHEMA.md.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EventKind {
    #[serde(rename = "coin.found")]
    CoinFound,
    #[serde(rename = "coin.passed")]
    CoinPassed,
    #[serde(rename = "coin.rejected")]
    CoinRejected,
    #[serde(rename = "coin.blocked")]
    CoinBlocked,
    #[serde(rename = "entry.armed")]
    EntryArmed,
    #[serde(rename = "entry.expired")]
    EntryExpired,
    #[serde(rename = "proposal.created")]
    ProposalCreated,
    #[serde(rename = "proposal.approved")]
    ProposalApproved,
    #[serde(rename = "proposal.rejected")]
    ProposalRejected,
    #[serde(rename = "proposal.expired")]
    ProposalExpired,
    #[serde(rename = "position.opened")]
    PositionOpened,
    #[serde(rename = "position.partial_exit")]
    PositionPartialExit,
    #[serde(rename = "position.closed")]
    PositionClosed,
    #[serde(rename = "strategy.changed")]
    StrategyChanged,
    #[serde(rename = "strategy.archived")]
    StrategyArchived,
    #[serde(rename = "strategy.deleted")]
    StrategyDeleted,
    #[serde(rename = "guard.change_requested")]
    GuardChangeRequested,
    #[serde(rename = "guard.change_applied")]
    GuardChangeApplied,
    #[serde(rename = "guard.change_reverted")]
    GuardChangeReverted,
    #[serde(rename = "portfolio.snapshot")]
    PortfolioSnapshot,
    #[serde(rename = "alert")]
    Alert,
}

impl EventKind {
    pub fn as_str(self) -> &'static str {
        use EventKind::*;
        match self {
            CoinFound => "coin.found",
            CoinPassed => "coin.passed",
            CoinRejected => "coin.rejected",
            CoinBlocked => "coin.blocked",
            EntryArmed => "entry.armed",
            EntryExpired => "entry.expired",
            ProposalCreated => "proposal.created",
            ProposalApproved => "proposal.approved",
            ProposalRejected => "proposal.rejected",
            ProposalExpired => "proposal.expired",
            PositionOpened => "position.opened",
            PositionPartialExit => "position.partial_exit",
            PositionClosed => "position.closed",
            StrategyChanged => "strategy.changed",
            StrategyArchived => "strategy.archived",
            StrategyDeleted => "strategy.deleted",
            GuardChangeRequested => "guard.change_requested",
            GuardChangeApplied => "guard.change_applied",
            GuardChangeReverted => "guard.change_reverted",
            PortfolioSnapshot => "portfolio.snapshot",
            Alert => "alert",
        }
    }
}

/// Why a proposal (approval-queue item) expired. Wire values are fixed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExpireReason {
    Timeout,
    StrategyDeleted,
    StrategyArchived,
    GuardFailed,
    PriceMoved,
}

/// One immutable entry in the trail / activity feed. `seq` is assigned by the
/// database (monotonic `bigint identity`) and is the pagination / resume cursor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    /// `<subject>:<epoch ms>:<kind>`; subject = coin key, proposal id, strategy id...
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seq: Option<i64>,
    pub workspace_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strategy_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ck: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mint: Option<String>,
    pub ts: TsMs,
    pub kind: EventKind,
    pub actor: Actor,
    /// Trusted, machine-generated payload. Amounts are strings (see `units`).
    pub data: serde_json::Value,
    /// Anything copied from token metadata or user free text. Render as plain text.
    pub untrusted: serde_json::Value,
}

impl Event {
    pub fn new(
        workspace_id: impl Into<String>,
        subject: &str,
        ts: TsMs,
        kind: EventKind,
        actor: Actor,
        data: serde_json::Value,
    ) -> Self {
        Self {
            id: format!("{subject}:{ts}:{}", kind.as_str()),
            seq: None,
            workspace_id: workspace_id.into(),
            strategy_id: None,
            ck: None,
            mint: None,
            ts,
            kind,
            actor,
            data,
            untrusted: serde_json::Value::Object(Default::default()),
        }
    }

    pub fn with_untrusted_symbol(
        mut self,
        name: &Untrusted<String>,
        symbol: &Untrusted<String>,
    ) -> Self {
        self.untrusted =
            serde_json::json!({ "name": name.sanitized(), "symbol": symbol.sanitized() });
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_round_trip_and_match_as_str() {
        for k in [
            EventKind::CoinFound,
            EventKind::ProposalExpired,
            EventKind::PositionPartialExit,
            EventKind::Alert,
        ] {
            let s = serde_json::to_string(&k).expect("ser");
            assert_eq!(s, format!("\"{}\"", k.as_str()));
            assert_eq!(serde_json::from_str::<EventKind>(&s).expect("de"), k);
        }
        assert_eq!(
            serde_json::to_string(&ExpireReason::StrategyDeleted).expect("ser"),
            "\"strategy_deleted\""
        );
    }

    #[test]
    fn event_id_and_camel_case() {
        let e = Event::new(
            "ws",
            "abc",
            17,
            EventKind::CoinPassed,
            Actor::Screener,
            serde_json::json!({}),
        );
        assert_eq!(e.id, "abc:17:coin.passed");
        let v = serde_json::to_value(&e).expect("ser");
        assert!(v.get("workspaceId").is_some());
    }
}
