//! Rust mirror of the Sentra **wire contract v1.1** (`packages/contracts/src/wire`, `EVENTS_SCHEMA.md`,
//! `API_ENDPOINTS.md`, `CHANGELOG.md`; contracts 1.1.x, per-event `version` 1). Owner: Backend API Specialist.
//!
//! Wire rules enforced by the types below (v1.1 number rule):
//! - SOL amounts = integer strings in lamports ([`Lamports`]), token amounts = raw integer strings
//!   ([`RawQty`]), **prices** = decimal strings without exponent ([`Dec`], `rust_decimal`). Money never
//!   passes through a float.
//! - Percentages, ratios, bps, USD notionals, scores, measured values = JSON numbers ([`Num`] = `f64`):
//!   display / threshold values only, never used for lamport math.
//! - All keys and enum values snake_case (guard verdicts `PASS|WARN|FAIL`, error codes UPPER_SNAKE).
//! - `mode` = practice | real (real rejected by the API until Phase 7).
//! - `untrusted` = attacker-controlled token metadata: plain text only (see [`Untrusted::display_symbol`]).
//! - Clients ignore unknown event types ([`KnownEvent::decode`] returns `None`).

use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;
use std::str::FromStr;

pub const EVENT_SCHEMA_VERSION: u32 = 1;
/// Contracts release this mirror was verified against (contract test checks major.minor).
pub const CONTRACTS_VERSION: &str = "1.1.1";
/// JSON number on the wire (pcts, ratios, bps, USD notionals, scores). Display/threshold only.
pub type Num = f64;
pub const LAMPORTS_PER_SOL: i128 = 1_000_000_000;

// ---------------------------------------------------------------- units

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum UnitError {
    #[error("not an integer string: {0:?}")]
    NotInteger(String),
    #[error("not a plain decimal string (no exponent): {0:?}")]
    NotDecimal(String),
}

macro_rules! int_string {
    ($name:ident, $inner:ty, $doc:literal) => {
        #[doc = $doc]
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash)]
        pub struct $name(pub $inner);
        impl Serialize for $name {
            fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
                s.serialize_str(&self.0.to_string())
            }
        }
        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
                let s = String::deserialize(d)?;
                s.parse::<$inner>().map($name).map_err(|_| serde::de::Error::custom(UnitError::NotInteger(s)))
            }
        }
        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(f)
            }
        }
    };
}
int_string!(Lamports, i128, "Lamports as an integer string (`\"250000000\"` = 0.25 SOL). Signed so PnL fits.");
int_string!(RawQty, u128, "Raw SPL token base units as an integer string.");

impl Lamports {
    /// SOL as a decimal (display / internal math only).
    pub fn sol(self) -> Decimal {
        Decimal::from_i128_with_scale(self.0, 9).normalize()
    }
    pub fn from_sol(sol: Decimal) -> Self {
        Lamports((sol * Decimal::from(LAMPORTS_PER_SOL as i64)).round().to_i128().unwrap_or(0))
    }
}

/// Decimal string (prices). Serialises without exponent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Hash)]
pub struct Dec(pub Decimal);

impl Dec {
    pub fn parse(s: &str) -> Result<Self, UnitError> {
        let t = s.trim();
        if t.is_empty() || t.contains(['e', 'E']) || t.starts_with('+') {
            return Err(UnitError::NotDecimal(s.into()));
        }
        Decimal::from_str(t).map(Dec).map_err(|_| UnitError::NotDecimal(s.into()))
    }
}
impl fmt::Display for Dec {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0.normalize())
    }
}
impl Serialize for Dec {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
impl<'de> Deserialize<'de> for Dec {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Dec::parse(&s).map_err(serde::de::Error::custom)
    }
}

/// RFC 3339 UTC with ms (`2026-10-29T08:42:00.123Z`). Kept as the wire string; parsed on demand.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Hash)]
#[serde(transparent)]
pub struct IsoTs(pub String);

impl IsoTs {
    pub fn from_ms(ms: i64) -> Self {
        let dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms).unwrap_or_default();
        IsoTs(dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    }
    pub fn ms(&self) -> Option<i64> {
        chrono::DateTime::parse_from_rfc3339(&self.0).ok().map(|d| d.timestamp_millis())
    }
}

// ---------------------------------------------------------------- vocabularies

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Practice,
    /// Reserved. Rejected by the API (`REAL_SOL_DISABLED`) until Phase 7.
    Real,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Actor {
    Ingest,
    Screener,
    Guard,
    Entry,
    Executor,
    Exit,
    /// UI label "You".
    User,
    System,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum GuardVerdict {
    Pass,
    Warn,
    Fail,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum GuardCheckStatus {
    Pass,
    Warn,
    Fail,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProposalKind {
    BuyPick,
    GuardChange,
    TeamAction,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProposalStatus {
    Pending,
    Approved,
    /// UI label "Skipped".
    Rejected,
    Expired,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProposalExpiredReason {
    Timeout,
    StrategyDeleted,
    StrategyArchived,
    GuardFailed,
    PriceMoved,
    PracticeReset,
    AccountDeleted,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalMode {
    Off,
    AskFirstBuy,
    AskEveryBuy,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DecidedVia {
    Web,
    Mobile,
    Desktop,
    Mcp,
    Push,
}

/// Exit rule ids. Wire ids are mapped to UI labels in one place: `keys.rs`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ExitReason {
    /// Evaluated before every other exit rule.
    SellFloor,
    ProfitTarget,
    LossGuard,
    PeakTrail,
    MaxHold,
    Idle,
    SellPressure,
    NoNewHigh,
    RugDetected,
    DrawdownHalt,
    Manual,
    StrategyRetired,
    PracticeReset,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FillSide {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
/// Where a coin trades when discovered (v1.0 `stream: bonding|graduated`).
pub enum Venue {
    Curve,
    Amm,
}

/// Attacker-controlled token metadata. Never HTML, never a URL/action, never in an LLM prompt.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Untrusted {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Plain-text sanitiser for untrusted strings shown in UI/notifications/window titles:
/// drops control + bidi-override chars, collapses whitespace, caps length (chars).
pub fn plain_text(s: &str, max: usize) -> String {
    let cleaned: String = s
        .chars()
        .filter(|c| !c.is_control() && !matches!(*c, '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{200B}'..='\u{200F}'))
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(max).collect()
}

impl Untrusted {
    /// Display symbol: sanitised `untrusted.symbol`, else a short mint.
    pub fn display_symbol(&self, mint: Option<&str>) -> String {
        match self.symbol.as_deref().map(|s| plain_text(s, 16)).filter(|s| !s.is_empty()) {
            Some(s) => s,
            None => mint.map(|m| format!("{}…{}", &m[..4.min(m.len())], &m[m.len().saturating_sub(4)..])).unwrap_or_else(|| "?".into()),
        }
    }
    pub fn display_name(&self) -> Option<String> {
        self.name.as_deref().map(|s| plain_text(s, 48)).filter(|s| !s.is_empty())
    }
}

// ---------------------------------------------------------------- envelope

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventEnvelope {
    /// Deterministic `<subject>:<epoch_ms>:<type>`; dedupe key.
    pub id: String,
    /// Monotonic, NOT gapless. Order by seq, never by ts.
    pub seq: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub version: u32,
    pub workspace_id: String,
    pub strategy_id: Option<String>,
    pub ck: Option<String>,
    pub mint: Option<String>,
    pub ts: IsoTs,
    pub actor: Actor,
    pub mode: Mode,
    pub payload: serde_json::Value,
    #[serde(default)]
    pub untrusted: Untrusted,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_now: Option<IsoTs>,
}

// ---------------------------------------------------------------- payloads

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScreenerCheck {
    pub id: String,
    pub class: String,
    pub passed: bool,
    pub measured: Option<Num>,
    pub points: Num,
    pub reason: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScreenerResult {
    pub passed: bool,
    pub score: Num,
    /// v1.0 `pass_mark`.
    pub score_threshold: Num,
    pub max_score: Num,
    pub checks: Vec<ScreenerCheck>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GuardCheck {
    pub name: String,
    pub status: GuardCheckStatus,
    pub measured: Option<Num>,
    pub reason: String,
    pub weight: Num,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CoinDetected {
    pub mint: String,
    pub venue: Venue,
    pub launchpad: Option<String>,
    pub creator: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScreenerScored {
    pub mint: String,
    pub passed: bool,
    pub summary: String,
    pub rejected_by: Option<String>,
    pub failed: Vec<String>,
    pub result: ScreenerResult,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GuardResult {
    pub mint: String,
    pub verdict: GuardVerdict,
    pub risk_score: Num,
    pub reasons: Vec<String>,
    pub checks: Vec<GuardCheck>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PickCreated {
    pub mint: String,
    pub summary: String,
    pub score: ScreenerResult,
    pub guard_verdict: GuardVerdict,
    pub guard_reasons: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EntryArmed {
    pub pick_id: String,
    pub condition: String,
    pub expires_at: IsoTs,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EntryExpired {
    pub pick_id: String,
    pub reason: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StaticEstimate {
    pub method: String,
    pub weakening: bool,
    pub weakened_fields: Vec<String>,
    pub risk_level: RiskLevel,
    pub max_extra_passes: i64,
    pub window_evaluated: i64,
    pub reasons: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProposalCreated {
    pub proposal_id: String,
    pub kind: ProposalKind,
    pub version: u32,
    pub expires_at: IsoTs,
    pub first_buy: bool,
    pub approval_mode: ApprovalMode,
    pub amount_lamports: Option<Lamports>,
    pub risk_level: Option<RiskLevel>,
    pub summary: String,
    pub base_rev: Option<u64>,
    pub weakening: bool,
    pub diff: Option<serde_json::Value>,
    pub estimate: Option<StaticEstimate>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProposalDecided {
    pub proposal_id: String,
    pub kind: ProposalKind,
    pub version: u32,
    pub decided_by: String,
    pub decided_via: DecidedVia,
    pub reason: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProposalExpired {
    pub proposal_id: String,
    pub kind: ProposalKind,
    pub version: u32,
    pub reason: ProposalExpiredReason,
    pub at: IsoTs,
}
/// `position.opened.fill`. `mid_price_sol` is required in the TS type but absent from the
/// EVENTS_SCHEMA.md fill example → optional here (schema question to Backend).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FillWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub side: Option<FillSide>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub simulated: Option<bool>,
    pub sol_lamports: Lamports,
    pub token_amount_raw: RawQty,
    pub exec_price_sol: Dec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mid_price_sol: Option<Dec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price_impact_bps: Option<Num>,
    pub slippage_bps: Num,
    pub swap_fee_lamports: Lamports,
    pub network_fee_lamports: Lamports,
    pub latency_ms: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PositionOpened {
    pub position_key: String,
    pub mint: String,
    pub fill: FillWire,
    pub first_buy: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PositionUpdated {
    pub position_key: String,
    pub qty_raw: RawQty,
    pub peak_price_sol: Dec,
    pub realized_lamports: Lamports,
    pub plan_state: serde_json::Value,
    /// v1.1 prep: optional resource revision for If-Match writes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rev: Option<u64>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PositionClosed {
    pub position_key: String,
    pub exit_reason: ExitReason,
    pub exit_price_sol: Dec,
    pub sol_out_lamports: Lamports,
    pub pnl_lamports: Lamports,
    pub pnl_pct: Num,
    pub hold_seconds: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FillSimulated {
    pub position_key: String,
    pub side: FillSide,
    pub simulated: bool,
    pub mark_price_sol: Dec,
    pub exec_price_sol: Dec,
    pub token_amount_raw: RawQty,
    pub sol_lamports: Lamports,
    pub fee_bps: i64,
    pub swap_fee_lamports: Lamports,
    pub network_fee_lamports: Lamports,
    pub slippage_bps: Num,
    pub latency_ms: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mid_price_sol: Option<Dec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price_impact_bps: Option<Num>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExitTriggered {
    pub position_key: String,
    pub rule: ExitReason,
    pub rule_index: i64,
    /// v1.0 `sell_pct`.
    pub sell_portion_pct: Num,
    pub trigger_price_sol: Dec,
    pub detail: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PortfolioSnapshot {
    pub cash_lamports: Lamports,
    pub positions_cost_lamports: Lamports,
    pub positions_value_lamports: Lamports,
    pub equity_lamports: Lamports,
    pub peak_equity_lamports: Lamports,
    pub drawdown_bps: i64,
    pub drawdown_pct: Num,
    pub realized_pnl_lamports: Lamports,
    pub unrealized_pnl_lamports: Lamports,
    pub open_positions: i64,
    pub as_of_seq: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StrategyLifecycle {
    pub rev: u64,
    /// A local edit based on `base_rev < rev` enters the conflict state (API_ENDPOINTS 2.1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_rev: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changed_fields: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expired_proposals: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResetArchived {
    pub positions: i64,
    pub closed_open_positions: i64,
    pub fills: i64,
    pub snapshots: i64,
    pub expired_proposals: i64,
}
/// `practice.reset`: clients drop cached positions/equity and refetch for the new epoch.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PracticeReset {
    pub epoch: i64,
    pub previous_epoch: i64,
    pub starting_balance_lamports: Lamports,
    pub archived: ResetArchived,
    pub next_allowed_at: IsoTs,
    pub at: IsoTs,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AccountDeletionScheduled {
    pub scheduled_for: IsoTs,
    pub grace_days: i64,
    pub at: IsoTs,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AccountLifecycle {
    pub at: IsoTs,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SystemNotice {
    pub code: String,
    pub message: String,
}

/// Typed view of an envelope. Unknown types (or a newer `version` we cannot read) → `None`
/// so the client ignores them (contract rule).
#[derive(Debug, Clone, PartialEq)]
pub enum KnownEvent {
    CoinDetected(CoinDetected),
    ScreenerScored(ScreenerScored),
    GuardResult(GuardResult),
    PickCreated(PickCreated),
    EntryArmed(EntryArmed),
    EntryExpired(EntryExpired),
    ProposalCreated(ProposalCreated),
    ProposalApproved(ProposalDecided),
    ProposalRejected(ProposalDecided),
    ProposalExpired(ProposalExpired),
    PositionOpened(PositionOpened),
    PositionUpdated(PositionUpdated),
    PositionClosed(PositionClosed),
    FillSimulated(FillSimulated),
    ExitTriggered(ExitTriggered),
    PortfolioSnapshot(PortfolioSnapshot),
    Strategy(String, StrategyLifecycle),
    PracticeReset(PracticeReset),
    AccountDeletionScheduled(AccountDeletionScheduled),
    AccountDeletionCancelled(AccountLifecycle),
    AccountDeleted(AccountLifecycle),
    SystemNotice(SystemNotice),
}

impl KnownEvent {
    pub fn decode(env: &EventEnvelope) -> Option<Result<KnownEvent, serde_json::Error>> {
        if env.version > EVENT_SCHEMA_VERSION {
            return None; // newer payload version → ignore until the client is updated
        }
        fn p<T: serde::de::DeserializeOwned>(v: &serde_json::Value) -> Result<T, serde_json::Error> {
            serde_json::from_value(v.clone())
        }
        let v = &env.payload;
        Some(match env.kind.as_str() {
            "coin.detected" => p(v).map(Self::CoinDetected),
            "screener.scored" => p(v).map(Self::ScreenerScored),
            "guard.result" => p(v).map(Self::GuardResult),
            "pick.created" => p(v).map(Self::PickCreated),
            "entry.armed" => p(v).map(Self::EntryArmed),
            "entry.expired" => p(v).map(Self::EntryExpired),
            "proposal.created" => p(v).map(Self::ProposalCreated),
            "proposal.approved" => p(v).map(Self::ProposalApproved),
            "proposal.rejected" => p(v).map(Self::ProposalRejected),
            "proposal.expired" => p(v).map(Self::ProposalExpired),
            "position.opened" => p(v).map(Self::PositionOpened),
            "position.updated" => p(v).map(Self::PositionUpdated),
            "position.closed" => p(v).map(Self::PositionClosed),
            "fill.simulated" => p(v).map(Self::FillSimulated),
            "exit.triggered" => p(v).map(Self::ExitTriggered),
            "portfolio.snapshot" => p(v).map(Self::PortfolioSnapshot),
            "practice.reset" => p(v).map(Self::PracticeReset),
            "account.deletion_scheduled" => p(v).map(Self::AccountDeletionScheduled),
            "account.deletion_cancelled" => p(v).map(Self::AccountDeletionCancelled),
            "account.deleted" => p(v).map(Self::AccountDeleted),
            "system.notice" => p(v).map(Self::SystemNotice),
            t if t.starts_with("strategy.") => p(v).map(|x| Self::Strategy(t.to_owned(), x)),
            // guard.changed and anything new: ignored by the desktop for now.
            _ => return None,
        })
    }
}

// ---------------------------------------------------------------- transport messages

/// Broadcast `marks:<workspace_id>:<mode>` → `mark`. Never persisted.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MarkMessage {
    pub mint: String,
    pub price_usd: Dec,
    pub price_sol: Dec,
    pub liquidity_usd: Num,
    pub slot: i64,
    pub ts: IsoTs,
    pub position_ids: Vec<String>,
    pub server_now: IsoTs,
}
/// Broadcast `clock` heartbeat (every 15 s).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClockMessage {
    pub server_now: IsoTs,
    pub safe_seq: i64,
}
/// `GET /v1/workspaces/{ws}/events` page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventPage {
    pub items: Vec<EventEnvelope>,
    pub next_after_seq: Option<i64>,
    pub next_before_seq: Option<i64>,
    pub has_more: bool,
    pub safe_seq: i64,
    pub server_now: IsoTs,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Approve,
    Reject,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApprovalDecisionRequest {
    pub decision: Decision,
    /// Opaque single-use token from `GET /approvals/{id}`.
    pub token: String,
    pub expected_version: u32,
    pub client: DecidedVia,
    pub reason: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApprovalDecisionResponse {
    pub proposal_id: String,
    pub status: ProposalStatus,
    pub version: u32,
    pub replayed: bool,
}
/// `GET /approvals/{id}` (subset the desktop needs).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApprovalDetail {
    pub proposal_id: String,
    pub version: u32,
    pub status: ProposalStatus,
    pub expires_at: IsoTs,
    pub decision_token: Option<String>,
    pub decision_token_expires_at: Option<IsoTs>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiItem<T> {
    pub data: T,
    pub server_now: IsoTs,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiErrorBody {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub details: Option<serde_json::Value>,
    pub request_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiError {
    pub error: ApiErrorBody,
    pub server_now: IsoTs,
}
/// Strategy (subset). `rev` drives optimistic concurrency (`If-Match: "<rev>"` / `expected_rev`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StrategySummary {
    pub id: String,
    pub name: String,
    pub rev: u64,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub mode: Option<Mode>,
    pub settings: serde_json::Value,
}

/// `GET /workspaces/{ws}` (subset).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceSummary {
    pub id: String,
    pub name: String,
    pub rev: u64,
    pub modes_enabled: Vec<Mode>,
}
/// `POST /workspaces/{ws}/practice/reset` 200 body (`server_now` sits on the wrapper).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PracticeResetResponse {
    pub epoch: i64,
    pub starting_balance_lamports: Lamports,
    pub archived: ResetArchived,
    pub next_allowed_at: IsoTs,
}

/// 409 conflict body (`STRATEGY_REV_CONFLICT` / `VERSION_CONFLICT` / `CONFIRMATION_RESTART_REQUIRED`):
/// merge data at the top level next to `error` (API_ENDPOINTS 2.1).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChangedBy {
    pub actor: Option<String>,
    pub via: Option<String>,
    pub device: Option<String>,
}
#[allow(dead_code)] // typed body for the Week-2 HttpTransport; asserted by the contract test
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConflictBody {
    pub error: ApiErrorBody,
    #[serde(default)]
    pub current_rev: Option<u64>,
    #[serde(default)]
    pub base_rev: Option<u64>,
    #[serde(default)]
    pub changed_fields: Vec<String>,
    #[serde(default)]
    pub changed_by: Option<ChangedBy>,
    #[serde(default)]
    pub changed_at: Option<IsoTs>,
    #[serde(default)]
    pub current: Option<serde_json::Value>,
    pub server_now: IsoTs,
}

/// `POST /positions/{id}/sell`. API_ENDPOINTS still shows `sell_pct: "100"` (string) while the v1.1
/// number rule makes `*_pct` a JSON number → sent as a number (schema question to Backend).
#[allow(dead_code)] // request body for the Week-2 HttpTransport
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SellRequest {
    pub mode: Mode,
    pub sell_pct: Num,
}

/// `GET /coins/{mint}/timeline` (v1.0 `/trail`): events by mint, seq ordered.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CoinTimeline {
    pub items: Vec<EventEnvelope>,
    pub server_now: IsoTs,
}
/// `GET /stats/exit-reasons` row (shape not specified in the contract yet → minimal subset).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExitReasonStat {
    pub exit_reason: ExitReason,
    pub count: i64,
    pub pnl_lamports: Lamports,
    pub avg_pnl_pct: Num,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn units_are_strings_and_exact() {
        let l: Lamports = serde_json::from_str("\"250000000\"").unwrap();
        assert_eq!(l.sol().to_string(), "0.25");
        assert_eq!(serde_json::to_string(&l).unwrap(), "\"250000000\"");
        assert!(serde_json::from_str::<Lamports>("250000000").is_err(), "JSON numbers rejected");
        assert!(serde_json::from_str::<Lamports>("\"0.5\"").is_err());
        let d: Dec = serde_json::from_str("\"0.000000213400\"").unwrap();
        assert_eq!(d.to_string(), "0.0000002134");
        assert!(Dec::parse("1e-7").is_err(), "exponent rejected");
        assert!(serde_json::from_str::<Dec>("0.5").is_err(), "float rejected");
        assert_eq!(Lamports::from_sol(Dec::parse("0.25").unwrap().0), Lamports(250_000_000));
    }

    #[test]
    fn untrusted_is_plain_text() {
        let u = Untrusted { symbol: Some("<b>\u{202E}EVIL\u{0007}   COIN</b>xxxxxxxxxxxxxx".into()), ..Default::default() };
        let s = u.display_symbol(None);
        assert!(!s.contains('\u{202E}') && !s.contains('\u{0007}'));
        assert!(s.chars().count() <= 16);
        // Markup stays literal text; the UI renders it via text nodes only.
        assert!(s.starts_with("<b>"));
    }

    #[test]
    fn iso_roundtrip() {
        let t = IsoTs::from_ms(1_793_263_320_123);
        assert_eq!(t.0, "2026-10-29T08:42:00.123Z");
        assert_eq!(t.ms(), Some(1_793_263_320_123));
    }
}
