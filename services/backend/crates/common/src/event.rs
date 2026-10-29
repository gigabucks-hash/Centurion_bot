//! Stream event envelope (contract v1). Mirrors docs/EVENTS_SCHEMA.md and
//! packages/contracts/src/events.ts. Wire format is snake_case JSON; `ts` is RFC 3339 UTC
//! with millisecond precision; payload amounts are strings (see `units`).
use serde::{Deserialize, Serialize};

use crate::{Mode, TsMs, Untrusted};

pub const EVENT_SCHEMA_VERSION: u16 = 1;

/// Who caused an event (activity-feed actor). UI renders `user` as "You".
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

macro_rules! event_kinds {
    ($( $variant:ident => $wire:literal ),+ $(,)?) => {
        /// Event `type`. Append-only vocabulary: new types may be added, existing ones are
        /// never renamed. Clients must ignore unknown types.
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        pub enum EventKind {
            $( #[serde(rename = $wire)] $variant, )+
        }

        impl EventKind {
            pub const ALL: &'static [EventKind] = &[ $( EventKind::$variant, )+ ];
            pub fn as_str(self) -> &'static str {
                match self { $( EventKind::$variant => $wire, )+ }
            }
        }
    };
}

event_kinds! {
    CoinDetected => "coin.detected",
    ScreenerScored => "screener.scored",
    GuardResult => "guard.result",
    PickCreated => "pick.created",
    EntryArmed => "entry.armed",
    EntryExpired => "entry.expired",
    ProposalCreated => "proposal.created",
    ProposalApproved => "proposal.approved",
    ProposalRejected => "proposal.rejected",
    ProposalExpired => "proposal.expired",
    PositionOpened => "position.opened",
    PositionUpdated => "position.updated",
    PositionClosed => "position.closed",
    FillSimulated => "fill.simulated",
    ExitTriggered => "exit.triggered",
    PortfolioSnapshot => "portfolio.snapshot",
    GuardChanged => "guard.changed",
    StrategyCreated => "strategy.created",
    StrategyUpdated => "strategy.updated",
    StrategyPaused => "strategy.paused",
    StrategyResumed => "strategy.resumed",
    StrategyArchived => "strategy.archived",
    StrategyDeleted => "strategy.deleted",
    SystemNotice => "system.notice",
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

/// One immutable row of `public.events`: activity feed, coin trail and transactional outbox.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    /// Deterministic `<subject>:<epoch ms>:<type>` (subject = coin key, proposal id, ...).
    /// Unique: re-emitting the same fact is a no-op (idempotent writers).
    pub id: String,
    /// Assigned by the database (`bigint identity`). Ordering, pagination and resume cursor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seq: Option<i64>,
    #[serde(rename = "type")]
    pub kind: EventKind,
    pub version: u16,
    pub workspace_id: String,
    pub strategy_id: Option<String>,
    /// Coin key (pick key) for trail lookups.
    pub ck: Option<String>,
    pub mint: Option<String>,
    #[serde(with = "rfc3339_ms")]
    pub ts: TsMs,
    pub actor: Actor,
    pub mode: Mode,
    /// Trusted, machine-generated payload. Amounts/prices are strings.
    pub payload: serde_json::Value,
    /// Anything copied from token metadata or user free text. Render as plain text only.
    pub untrusted: serde_json::Value,
}

impl Event {
    pub fn new(
        workspace_id: impl Into<String>,
        subject: &str,
        ts: TsMs,
        kind: EventKind,
        actor: Actor,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            id: format!("{subject}:{ts}:{}", kind.as_str()),
            seq: None,
            kind,
            version: EVENT_SCHEMA_VERSION,
            workspace_id: workspace_id.into(),
            strategy_id: None,
            ck: None,
            mint: None,
            ts,
            actor,
            mode: Mode::Practice,
            payload,
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

/// `ts` as RFC 3339 UTC with milliseconds on the wire, epoch ms in memory.
pub mod rfc3339_ms {
    use chrono::{DateTime, SecondsFormat, Utc};
    use serde::{de, Deserialize, Deserializer, Serializer};

    pub fn to_string(ms: i64) -> String {
        DateTime::<Utc>::from_timestamp_millis(ms)
            .unwrap_or_default()
            .to_rfc3339_opts(SecondsFormat::Millis, true)
    }

    pub fn serialize<S: Serializer>(ms: &i64, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&to_string(*ms))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
        let s = String::deserialize(d)?;
        DateTime::parse_from_rfc3339(&s)
            .map(|t| t.timestamp_millis())
            .map_err(de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_round_trip_and_match_as_str() {
        for k in EventKind::ALL {
            let s = serde_json::to_string(k).expect("ser");
            assert_eq!(s, format!("\"{}\"", k.as_str()));
            assert_eq!(serde_json::from_str::<EventKind>(&s).expect("de"), *k);
        }
        assert_eq!(
            serde_json::to_string(&ExpireReason::StrategyDeleted).expect("ser"),
            "\"strategy_deleted\""
        );
    }

    #[test]
    fn contract_event_types_present() {
        for t in [
            "coin.detected",
            "screener.scored",
            "guard.result",
            "pick.created",
            "proposal.created",
            "proposal.approved",
            "proposal.rejected",
            "proposal.expired",
            "position.opened",
            "position.updated",
            "position.closed",
            "fill.simulated",
            "exit.triggered",
            "portfolio.snapshot",
            "guard.changed",
        ] {
            assert!(
                EventKind::ALL.iter().any(|k| k.as_str() == t),
                "missing {t}"
            );
        }
    }

    #[test]
    fn envelope_shape_matches_contract() {
        let mut e = Event::new(
            "ws",
            "abc",
            1_793_263_320_123,
            EventKind::PickCreated,
            Actor::Screener,
            serde_json::json!({}),
        );
        e.seq = Some(42);
        assert_eq!(e.id, "abc:1793263320123:pick.created");
        let v = serde_json::to_value(&e).expect("ser");
        for k in [
            "id",
            "seq",
            "type",
            "version",
            "workspace_id",
            "strategy_id",
            "ts",
            "actor",
            "mode",
            "payload",
            "untrusted",
        ] {
            assert!(v.get(k).is_some(), "envelope missing {k}");
        }
        assert_eq!(v["type"], "pick.created");
        assert_eq!(v["ts"], "2026-10-29T08:42:00.123Z");
        assert_eq!(v["mode"], "practice");
        let back: Event = serde_json::from_value(v).expect("de");
        assert_eq!(back, e);
    }
}
