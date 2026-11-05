//! Rust mirror of the Centurion **wire contract v1.1** (`packages/contracts/src/wire`, `EVENTS_SCHEMA.md`,
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
/// Mirrors `CONTRACTS_VERSION` in the committed `packages/contracts/src/wire/events.ts`. Pinned package is
/// 1.1.6 (`contracts.pin.json`), the TS constant was bumped to it by Backend, and the backend `/healthz`
/// says "1.1.6". The health check accepts any 1.1.x.
pub const CONTRACTS_VERSION: &str = "1.1.6";
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
                s.parse::<$inner>()
                    .map($name)
                    .map_err(|_| serde::de::Error::custom(UnitError::NotInteger(s)))
            }
        }
        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(f)
            }
        }
    };
}
int_string!(
    Lamports,
    i128,
    "Lamports as an integer string (`\"250000000\"` = 0.25 SOL). Signed so PnL fits."
);
int_string!(
    RawQty,
    u128,
    "Raw SPL token base units as an integer string."
);

impl Lamports {
    /// SOL as a decimal (display / internal math only).
    pub fn sol(self) -> Decimal {
        Decimal::from_i128_with_scale(self.0, 9).normalize()
    }
    pub fn from_sol(sol: Decimal) -> Self {
        Lamports(
            (sol * Decimal::from(LAMPORTS_PER_SOL as i64))
                .round()
                .to_i128()
                .unwrap_or(0),
        )
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
        Decimal::from_str(t)
            .map(Dec)
            .map_err(|_| UnitError::NotDecimal(s.into()))
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
        chrono::DateTime::parse_from_rfc3339(&self.0)
            .ok()
            .map(|d| d.timestamp_millis())
    }
}

/// `seq` / cursors: v1.1 sends a JSON number, contracts **1.1.2** an int64 **string** (JS-safe).
/// Accept both; emit the 1.1.2 string form. Internally `i64`.
pub mod seq {
    use serde::{Deserialize, Deserializer, Serializer};
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Wire {
        N(i64),
        S(String),
    }
    fn parse<E: serde::de::Error>(w: Wire) -> Result<i64, E> {
        match w {
            Wire::N(n) => Ok(n),
            Wire::S(s) if !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()) => {
                s.parse().map_err(E::custom)
            }
            Wire::S(s) => Err(E::custom(format!(
                "seq must be an integer string, got {s:?}"
            ))),
        }
    }
    pub fn serialize<S: Serializer>(v: &i64, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&v.to_string())
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
        parse(Wire::deserialize(d)?)
    }
    pub mod opt {
        use super::*;
        pub fn serialize<S: Serializer>(v: &Option<i64>, s: S) -> Result<S::Ok, S::Error> {
            match v {
                Some(n) => s.serialize_str(&n.to_string()),
                None => s.serialize_none(),
            }
        }
        pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Option<i64>, D::Error> {
            Option::<Wire>::deserialize(d)?.map(parse).transpose()
        }
    }
}

/// Wrapped-SOL mint: the only quote asset Practice can trade (Backend `common::quote`).
pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
/// Skip / error code for coins whose pool is quoted in anything but SOL (errors.json, 422).
pub const UNSUPPORTED_QUOTE_MINT: &str = "UNSUPPORTED_QUOTE_MINT";
/// `None` = unknown (legacy producer) → tradeable, like Backend `is_sol_quote`.
pub fn is_sol_quote(quote_mint: Option<&str>) -> bool {
    quote_mint.map_or(true, |m| {
        m == WSOL_MINT || m == "11111111111111111111111111111111"
    })
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
    /// 1.1.5: Stop / kill switch expired every pending proposal.
    KillSwitch,
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
    /// 1.1.4 `stall_exit` (|move| over `window_s` below `min_move_pct`). Not the v1.0 `stall` (= `no_new_high`).
    Stall,
}

/// 1.1.4 `ProposalQuoteFields` (7ba6273): transaction quote for the approval card / review sheet. All
/// optional and nullable; practice values are papersim estimates (never a signed transaction). Real approve
/// with a missing or expired quote → `409 QUOTE_MISSING_OR_STALE`; practice is never blocked.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ProposalQuote {
    /// Base fee + priority fee.
    #[serde(default)]
    pub est_network_fee_lamports: Option<Lamports>,
    #[serde(default)]
    pub priority_fee_lamports: Option<Lamports>,
    #[serde(default)]
    pub swap_fee_bps: Option<Num>,
    #[serde(default)]
    pub max_slippage_bps: Option<Num>,
    /// Minimum tokens out after max slippage (raw units).
    #[serde(default)]
    pub min_out_raw: Option<RawQty>,
    /// Most the buy can cost: SOL in + estimated network fee.
    #[serde(default)]
    pub total_max_lamports: Option<Lamports>,
    #[serde(default)]
    pub quote_ts: Option<IsoTs>,
    #[serde(default)]
    pub quote_expires_at: Option<IsoTs>,
    /// 1.1.5: quote identity (int64 string). A refresh sets a new quote_id and does NOT bump rev.
    #[serde(default)]
    pub quote_id: Option<String>,
    /// 1.1.5: rent for the buyer's token account if it must be created ("0" when it exists).
    #[serde(default)]
    pub est_ata_rent_lamports: Option<Lamports>,
    /// 1.1.5 sell quotes: SOL expected / minimum after max slippage (null on buys).
    #[serde(default)]
    pub expected_out_lamports: Option<Lamports>,
    #[serde(default)]
    pub min_out_lamports: Option<Lamports>,
}
impl ProposalQuote {
    pub fn is_set(&self) -> bool {
        self.quote_ts.is_some()
            || self.total_max_lamports.is_some()
            || self.est_network_fee_lamports.is_some()
    }
    /// Missing or expired at `server_now_ms` (Real approve would be refused).
    #[allow(dead_code)] // used by the mock's Real-mode check and tests
    pub fn is_stale(&self, server_now_ms: i64) -> bool {
        match self.quote_expires_at.as_ref().and_then(|t| t.ms()) {
            Some(exp) => exp <= server_now_ms,
            None => true,
        }
    }
}

/// 1.1.4 `StallExit`: sell all when |price change| over the last `window_s` s is below `min_move_pct`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct StallExit {
    pub window_s: i64,
    pub min_move_pct: Num,
}
/// The 1.1.4 exit settings keys the desktop shows (`ExitSettings.time_stop_s` → exit_reason `max_hold`,
/// `stall_exit` → `stall`). Out-of-range values (contract: 1-604800 s; 5-86400 s and 0.01-100 %) are
/// dropped rather than shown.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct ExitTimers {
    pub time_stop_s: Option<i64>,
    pub stall_exit: Option<StallExit>,
}
impl ExitTimers {
    pub fn from_settings(settings: &serde_json::Value) -> Self {
        let time_stop_s = settings
            .get("time_stop_s")
            .and_then(|v| v.as_i64())
            .filter(|s| (1..=604_800).contains(s));
        let stall_exit = settings
            .get("stall_exit")
            .and_then(|v| serde_json::from_value::<StallExit>(v.clone()).ok())
            .filter(|s| {
                (5..=86_400).contains(&s.window_s) && (0.01..=100.0).contains(&s.min_move_pct)
            });
        ExitTimers {
            time_stop_s,
            stall_exit,
        }
    }
}

/// 1.1.4 `MarketCapFields` (coin.detected, screener.scored, pick.created, REST coin/pick). One backend
/// computation (`common::mcap`); `mcap_usd` is display-only and indicative.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MarketCap {
    /// price × supply / 10^decimals in lamports; null when decimals or supply are unknown.
    #[serde(default)]
    pub market_cap_lamports: Option<Lamports>,
    #[serde(default)]
    pub mcap_usd: Option<Dec>,
    #[serde(default)]
    pub mcap_as_of: Option<IsoTs>,
}
impl MarketCap {
    pub fn is_known(&self) -> bool {
        self.market_cap_lamports.is_some() || self.mcap_usd.is_some()
    }
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
    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

impl Untrusted {
    /// Display symbol: sanitised `untrusted.symbol`, else a short mint.
    pub fn display_symbol(&self, mint: Option<&str>) -> String {
        match self
            .symbol
            .as_deref()
            .map(|s| plain_text(s, 16))
            .filter(|s| !s.is_empty())
        {
            Some(s) => s,
            None => mint
                .map(|m| {
                    format!(
                        "{}…{}",
                        &m[..4.min(m.len())],
                        &m[m.len().saturating_sub(4)..]
                    )
                })
                .unwrap_or_else(|| "?".into()),
        }
    }
    pub fn display_name(&self) -> Option<String> {
        self.name
            .as_deref()
            .map(|s| plain_text(s, 48))
            .filter(|s| !s.is_empty())
    }
}

// ---------------------------------------------------------------- envelope

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventEnvelope {
    /// Deterministic `<subject>:<epoch_ms>:<type>`; dedupe key.
    pub id: String,
    /// Monotonic, NOT gapless. Order by seq, never by ts. (1.1.2: int64 string on the wire.)
    #[serde(with = "seq")]
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
    /// 1.1.6 (f1b7910): our image-proxy URL for `mint`. Validated in `logo::hash_from_url` before use;
    /// never loaded as given.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_url: Option<String>,
    /// 1.1.6 (c99b114): the logo hash next to `logo_url`. Accepted when present (must equal `v` of a valid
    /// `logo_url`); otherwise the hash is read from `v` (older servers).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_hash: Option<String>,
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
    /// 1.1.2: `false` = Practice cannot trade the coin at all (non-SOL quote). `passed` is then
    /// false, `skip_reason` holds the code and the score is informational only. Default true.
    #[serde(default = "yes")]
    pub tradeable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quote_mint: Option<String>,
}
fn yes() -> bool {
    true
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
    /// 1.1.2: pool quote asset (wSOL mint = SOL). Anything else → not tradeable in Practice.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quote_mint: Option<String>,
    /// 1.1.2: SPL token decimals (no more "6" assumption) and token program id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decimals: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_program: Option<String>,
    /// 1.1.4.
    #[serde(flatten)]
    pub mcap: MarketCap,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScreenerScored {
    pub mint: String,
    pub passed: bool,
    /// 1.1.2 also repeats these at the payload top level (authoritative when present).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tradeable: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skip_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quote_mint: Option<String>,
    pub summary: String,
    pub rejected_by: Option<String>,
    pub failed: Vec<String>,
    pub result: ScreenerResult,
    /// 1.1.4.
    #[serde(flatten)]
    pub mcap: MarketCap,
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
    /// 1.1.4: market cap as of the pick.
    #[serde(flatten)]
    pub mcap: MarketCap,
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
    /// Approval rev (1.1.2 `rev`; v1.1 `version` still accepted on input).
    #[serde(rename = "rev", alias = "version")]
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
    /// 1.1.4 quote fields (absent from older producers → all None).
    #[serde(flatten)]
    pub quote: ProposalQuote,
    /// 1.1.2 additions (self-contained card: no join with pick/mark needed).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price_sol: Option<Dec>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProposalDecided {
    pub proposal_id: String,
    pub kind: ProposalKind,
    /// Approval rev (1.1.2 `rev`; v1.1 `version` still accepted on input).
    #[serde(rename = "rev", alias = "version")]
    pub version: u32,
    pub decided_by: String,
    pub decided_via: DecidedVia,
    pub reason: Option<String>,
    /// 1.1.3: set on `proposal.rejected`, null on approved (absent from older producers).
    #[serde(default)]
    pub reject_reason: Option<ApprovalRejectReason>,
}
/// `proposal.updated` (1.1.4 cont., 7ba6273): a pending proposal's quote was set/refreshed (rev + 1).
/// Silent (i18n notifications.meta `silent_events`): merge the quote, keep the new rev for `expected_rev`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProposalUpdated {
    pub proposal_id: String,
    pub kind: ProposalKind,
    #[serde(rename = "rev", alias = "version")]
    pub version: u32,
    #[serde(flatten)]
    pub quote: ProposalQuote,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProposalExpired {
    pub proposal_id: String,
    pub kind: ProposalKind,
    /// Approval rev (1.1.2 `rev`; v1.1 `version` still accepted on input).
    #[serde(rename = "rev", alias = "version")]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub practice_epoch: Option<i64>,
    /// 1.1.2 fill id / creation time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<IsoTs>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PositionOpened {
    pub position_key: String,
    pub mint: String,
    pub fill: FillWire,
    pub first_buy: bool,
    /// 1.1.2: server position id (close path is `/positions/{position_id}/close`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_program: Option<String>,
    /// 1.1.2: positions carry `rev`; close sends `If-Match: "<rev>"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rev: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub practice_epoch: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decimals: Option<u8>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PositionUpdated {
    pub position_key: String,
    pub qty_raw: RawQty,
    pub peak_price_sol: Dec,
    pub realized_lamports: Lamports,
    /// 1.1.2 typed exit-plan runtime state (`PlanState`, discriminated `PlanStep`).
    #[serde(default)]
    pub plan_state: Option<PlanState>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rev: Option<u64>,
    /// 1.1.2: server cost basis / average entry / unrealized (replaces the client-side estimate).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_basis_lamports: Option<Lamports>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "avg_entry_price"
    )]
    pub avg_entry_price_sol: Option<Dec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unrealized_pnl_lamports: Option<Lamports>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub practice_epoch: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PositionClosed {
    pub position_key: String,
    pub exit_reason: ExitReason,
    pub exit_price_sol: Dec,
    pub sol_out_lamports: Lamports,
    pub pnl_lamports: Lamports,
    /// 1.1.2: nullable (zero cost basis).
    #[serde(default)]
    pub pnl_pct: Option<Num>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub practice_epoch: Option<i64>,
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
    #[serde(with = "seq")]
    pub as_of_seq: i64,
    /// 1.1.2: current practice epoch (closes Q18 — desktop no longer guesses it).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub practice_epoch: Option<i64>,
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
/// `order.submitted` / `order.filled` (contracts 1.1.2): close orders; carry the position's new rev.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OrderProgress {
    pub order: OrderWire,
    pub position_id: String,
    pub position_rev: u64,
    /// `order.filled` only.
    #[serde(default)]
    pub fill: Option<FillWire>,
    #[serde(default)]
    pub practice_epoch: Option<i64>,
}
/// Close order resource (`OrderWire`, 1.1.2). `job_id` is an int64 string.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OrderWire {
    pub id: String,
    pub position_id: String,
    pub mint: String,
    pub mode: Mode,
    pub side: FillSide,
    /// `manual_close`.
    pub kind: String,
    pub fraction_bps: u16,
    /// `queued` | `filled` | `failed`.
    pub status: String,
    #[serde(default)]
    pub reason_code: Option<String>,
    #[serde(default, with = "seq::opt")]
    pub job_id: Option<i64>,
    #[serde(default)]
    pub fill_id: Option<String>,
    pub practice_epoch: i64,
    pub created_at: IsoTs,
    pub updated_at: IsoTs,
}
/// Async work handle (`GET /v1/workspaces/{ws}/jobs/{job_id}`). Read by the Phase-2 HttpTransport.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct JobWire {
    #[serde(with = "seq")]
    pub id: i64,
    pub kind: String,
    /// `queued` | `running` | `done` | `failed` | `dead`.
    pub status: String,
    pub attempts: u32,
    pub last_error: Option<String>,
    pub created_at: IsoTs,
    pub updated_at: IsoTs,
}

/// `position.updated.plan_state` (1.1.2 `PlanState`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlanState {
    /// Exit preset id or `custom`.
    pub preset: String,
    /// Index into `steps` of the next step that can fire; `None` = plan finished.
    pub current_step: Option<u32>,
    #[serde(default)]
    pub triggered_steps: Vec<u32>,
    #[serde(default)]
    pub trail_peak_price_sol: Option<Dec>,
    pub steps: Vec<PlanStep>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StepBase {
    pub index: u32,
    pub triggered: bool,
    #[serde(default)]
    pub triggered_at: Option<IsoTs>,
}
/// Discriminated by `kind`; an unknown kind decodes as `Unknown` (forward compatible).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PlanStep {
    ProfitTarget {
        #[serde(flatten)]
        base: StepBase,
        at_gain_pct: Num,
        sell_portion_pct: Num,
        trigger_price_sol: Dec,
    },
    LossGuard {
        #[serde(flatten)]
        base: StepBase,
        at_loss_pct: Num,
        sell_portion_pct: Num,
        trigger_price_sol: Dec,
    },
    /// Hard stop from ENTRY (`stop_loss_pct`).
    StopLoss {
        #[serde(flatten)]
        base: StepBase,
        stop_loss_pct: Num,
        stop_price_sol: Dec,
    },
    /// Trailing stop from the PEAK (`peak_trail_pct`).
    PeakTrail {
        #[serde(flatten)]
        base: StepBase,
        trail_pct: Num,
        armed: bool,
        peak_price_sol: Option<Dec>,
        stop_price_sol: Option<Dec>,
    },
    Giveback {
        #[serde(flatten)]
        base: StepBase,
        giveback_pct: Num,
        after_step: u32,
        peak_price_sol: Option<Dec>,
    },
    MaxHold {
        #[serde(flatten)]
        base: StepBase,
        deadline: IsoTs,
    },
    Idle {
        #[serde(flatten)]
        base: StepBase,
        idle_exit_seconds: i64,
        last_trade_at: Option<IsoTs>,
    },
    SellFloor {
        #[serde(flatten)]
        base: StepBase,
        max_loss_pct: Num,
        liquidity_drop_pct: Num,
    },
    #[serde(other)]
    Unknown,
}

/// `order.failed` (contracts 1.1.2, UX N-05): a simulated order could not be filled.
/// Symbol travels in `untrusted`. `reason_code` → `order.fail_reason.<lower>` (unknown → `.unknown`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OrderFailed {
    pub order_id: String,
    #[serde(default)]
    pub proposal_id: Option<String>,
    pub mint: String,
    pub side: FillSide,
    #[serde(default)]
    pub amount_lamports: Option<Lamports>,
    #[serde(default)]
    pub qty_raw: Option<RawQty>,
    pub reason_code: String,
    /// 1.1.2 WIP: any JSON (was a string).
    #[serde(default)]
    pub detail: serde_json::Value,
    #[serde(default)]
    pub quote_mint: Option<String>,
    #[serde(default)]
    pub position_id: Option<String>,
    #[serde(default)]
    pub fraction_bps: Option<u16>,
    pub mode: Mode,
    #[serde(default)]
    pub practice_epoch: Option<i64>,
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
    ProposalUpdated(ProposalUpdated),
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
    OrderFailed(OrderFailed),
    OrderSubmitted(OrderProgress),
    OrderFilled(OrderProgress),
}

impl KnownEvent {
    pub fn decode(env: &EventEnvelope) -> Option<Result<KnownEvent, serde_json::Error>> {
        if env.version > EVENT_SCHEMA_VERSION {
            return None; // newer payload version → ignore until the client is updated
        }
        fn p<T: serde::de::DeserializeOwned>(
            v: &serde_json::Value,
        ) -> Result<T, serde_json::Error> {
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
            "proposal.updated" => p(v).map(Self::ProposalUpdated),
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
            "order.failed" => p(v).map(Self::OrderFailed),
            "order.submitted" => p(v).map(Self::OrderSubmitted),
            "order.filled" => p(v).map(Self::OrderFilled),
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
    #[serde(with = "seq")]
    pub safe_seq: i64,
}
/// `GET /v1/workspaces/{ws}/events` page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventPage {
    pub items: Vec<EventEnvelope>,
    #[serde(with = "seq::opt", default)]
    pub next_after_seq: Option<i64>,
    #[serde(with = "seq::opt", default)]
    pub next_before_seq: Option<i64>,
    pub has_more: bool,
    #[serde(with = "seq")]
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
    /// Approval rev — required on every channel (1.1.2; `expected_version` removed). Also sent as
    /// `If-Match: "<rev>"`. Actor / channel come from the JWT: never send client / actor / via.
    pub expected_rev: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// 1.1.3: only with `decision = reject` (server default `user_declined`); with approve or an
    /// unknown value → 422 `VALIDATION_FAILED`. The desktop always sends it on a reject.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reject_reason: Option<ApprovalRejectReason>,
}

/// 1.1.3 `ApprovalRejectReason` (closed enum, TS `APPROVAL_REJECT_REASONS`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalRejectReason {
    UserDeclined,
    NotTradeable,
    PriceMoved,
    Other,
}
#[allow(dead_code)] // mirrored list; the contract test pins it to events.ts
pub const APPROVAL_REJECT_REASONS: [ApprovalRejectReason; 4] = [
    ApprovalRejectReason::UserDeclined,
    ApprovalRejectReason::NotTradeable,
    ApprovalRejectReason::PriceMoved,
    ApprovalRejectReason::Other,
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApprovalDecisionResponse {
    pub proposal_id: String,
    pub status: ProposalStatus,
    /// Approval rev (1.1.2 `rev`; v1.1 `version` still accepted on input).
    #[serde(rename = "rev", alias = "version")]
    pub version: u32,
    /// 1.1.3: set when rejected, null when approved.
    #[serde(default)]
    pub reject_reason: Option<ApprovalRejectReason>,
    pub replayed: bool,
}

/// 1.1.3 `ApprovalWire` (SQL `approval_wire()`; also the `current` of an approval 409).
#[allow(dead_code)] // typed body for the Phase-2 HttpTransport; asserted by the contract test
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApprovalWire {
    /// 1.1.6 (f1b7910): proxy URL of the mint logo (validated before use).
    #[serde(default)]
    pub logo_url: Option<String>,
    /// 1.1.6 (c99b114): logo hash of `mint` (required, nullable). Used when it agrees with `v` of `logo_url`;
    /// `v` stays the fallback for servers that do not send it yet.
    #[serde(default)]
    pub logo_hash: Option<String>,
    /// 1.1.5: mint decimals / token program (null on guard_change) and the position a sell refers to.
    #[serde(default)]
    pub decimals: Option<u8>,
    #[serde(default)]
    pub token_program: Option<String>,
    #[serde(default)]
    pub position_id: Option<String>,
    pub id: String,
    pub proposal_id: String,
    pub workspace_id: String,
    pub strategy_id: Option<String>,
    pub kind: ProposalKind,
    pub mode: Mode,
    pub subject: Option<String>,
    pub mint: Option<String>,
    pub amount_lamports: Option<Lamports>,
    pub is_first_buy: bool,
    pub risk: String,
    pub weakening: bool,
    pub status: ProposalStatus,
    pub rev: u32,
    pub expire_reason: Option<ProposalExpiredReason>,
    pub base_rev: Option<u32>,
    pub decision: Option<Decision>,
    pub reject_reason: Option<ApprovalRejectReason>,
    pub decided_via: Option<DecidedVia>,
    pub decided_by: Option<String>,
    pub payload: serde_json::Map<String, serde_json::Value>,
    pub created_at: IsoTs,
    pub expires_at: IsoTs,
    pub decided_at: Option<IsoTs>,
    /// 1.1.4: always present on the resource, null when unset.
    #[serde(flatten)]
    pub quote: ProposalQuote,
}
/// `GET /approvals/{id}` (subset the desktop needs).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApprovalDetail {
    pub proposal_id: String,
    /// Approval rev (1.1.2 `rev`; v1.1 `version` still accepted on input).
    #[serde(rename = "rev", alias = "version")]
    pub version: u32,
    pub status: ProposalStatus,
    pub expires_at: IsoTs,
    pub decision_token: Option<String>,
    pub decision_token_expires_at: Option<IsoTs>,
    /// 1.1.4 quote (refresh-quote reads it back after a 409 QUOTE_MISSING_OR_STALE).
    #[serde(flatten)]
    pub quote: ProposalQuote,
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
    pub request_id: Option<String>,
    pub server_now: IsoTs,
    /// 1.1.2: details are spread inside `error` next to code/message.
    #[serde(flatten)]
    pub details: serde_json::Map<String, serde_json::Value>,
}
/// 1.1.2 error body: always `{"error": {code, message, ...details, server_now}, server_now}`.
#[allow(dead_code)]
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
    /// 1.1.6 (0a2d1b2) per-strategy Real gate (`StrategyRealGateFields`). Absent (older server) → treated as
    /// locked (fail safe), never as unlocked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub real_locked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub real_locked_reason: Option<RealLockedReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paper_progress: Option<PaperProgress>,
}

/// contracts 1.1.6 `RealLockedReason` (closed set; an unknown value from a newer server → `Other`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RealLockedReason {
    NeedsOwnerApproval,
    GateNotMet,
    Policy,
    #[serde(other)]
    Other,
}
#[cfg_attr(not(test), allow(dead_code))]
pub const REAL_LOCKED_REASONS: [RealLockedReason; 4] = [
    RealLockedReason::NeedsOwnerApproval,
    RealLockedReason::GateNotMet,
    RealLockedReason::Policy,
    RealLockedReason::Other,
];

/// contracts 1.1.6 `PaperProgress`: `*_required` null = the owner has not set that rule yet ("not set").
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PaperProgress {
    pub days_done: u32,
    pub days_required: Option<u32>,
    pub trades_done: u32,
    pub trades_required: Option<u32>,
}

/// `GET /workspaces/{ws}` (subset).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkspaceSummary {
    pub id: String,
    pub name: String,
    pub rev: u64,
    pub modes_enabled: Vec<Mode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub practice_epoch: Option<i64>,
    /// 1.1.2 `WorkspaceWire.practice_start_lamports` (was `paper_start_lamports`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub practice_start_lamports: Option<Lamports>,
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
    pub error: ConflictErrorBody,
    pub server_now: IsoTs,
}
/// 1.1.2: conflict details live **inside** `error` (`error.current_rev`, `error.current`, …).
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConflictErrorBody {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub request_id: Option<String>,
    pub server_now: IsoTs,
    pub current_rev: u64,
    pub base_rev: u64,
    #[serde(default)]
    pub changed_fields: Vec<String>,
    #[serde(default)]
    pub changed_by: Option<ChangedBy>,
    #[serde(default)]
    pub changed_at: Option<IsoTs>,
    /// Required and non-null (TS `ConflictError.current`; every 409 `VERSION_CONFLICT` carries it,
    /// API_ENDPOINTS example fixed in contracts 1f24d28).
    #[serde(deserialize_with = "required_non_null")]
    pub current: serde_json::Value,
}

/// A field that must be present **and** non-null (missing → "missing field", null → error).
#[allow(dead_code)] // used by ConflictErrorBody (typed body for the Phase-2 HttpTransport)
fn required_non_null<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<serde_json::Value, D::Error> {
    let v = <serde_json::Value as serde::Deserialize>::deserialize(d)?;
    if v.is_null() {
        return Err(serde::de::Error::custom("`current` must not be null"));
    }
    Ok(v)
}

/// `POST /positions/{key}/close` body (contracts 1.1.2): `fraction_bps` integer 1–10000
/// (`sell_pct` removed; 25/50/100 % → 2500/5000/10000) + `If-Match: "<position rev>"`.
#[allow(dead_code)] // request body for the Week-2 HttpTransport
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CloseRequest {
    /// 1–10000, default 10000 server-side.
    pub fraction_bps: u16,
    /// Only when `If-Match` cannot be sent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_rev: Option<u64>,
}
pub const FRACTION_BPS_MAX: u16 = 10_000;
/// UI percent (1–100) → `fraction_bps`.
pub fn pct_to_bps(pct: u8) -> Option<u16> {
    (1..=100).contains(&pct).then(|| pct as u16 * 100)
}
/// Position as returned by a close (new `rev`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PositionWire {
    /// 1.1.6 (f1b7910): proxy URL of the mint logo (validated before use).
    #[serde(default)]
    pub logo_url: Option<String>,
    /// 1.1.6 (f1b7910): `v` of the logo URL; null → identicon.
    #[serde(default)]
    pub logo_hash: Option<String>,
    pub id: String,
    pub position_key: String,
    pub rev: u64,
    pub qty_raw: RawQty,
    /// `open` | `closed`.
    pub status: String,
    #[serde(default)]
    pub practice_epoch: Option<i64>,
    #[serde(default)]
    pub decimals: Option<u8>,
    #[serde(default)]
    pub token_program: Option<String>,
    #[serde(default)]
    pub cost_basis_lamports: Option<Lamports>,
    #[serde(default)]
    pub avg_entry_price_sol: Option<Dec>,
    #[serde(default)]
    pub exit_reason: Option<ExitReason>,
}
/// `POST /v1/workspaces/{ws}/positions/{id}/close` 200 (`ClosePositionResponse`, contracts 1.1.2).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CloseResponse {
    pub position: PositionWire,
    pub order: OrderWire,
    pub order_id: String,
    #[serde(default)]
    pub fill: Option<FillWire>,
    /// int64 as a string (1.1.2).
    #[serde(default, with = "seq::opt")]
    pub job_id: Option<i64>,
    /// `queued` | `filled` | `failed`.
    pub status: String,
    #[serde(default)]
    pub replayed: bool,
    pub server_now: IsoTs,
}

/// `GET /coins/{mint}/timeline` (v1.0 `/trail`): events by mint, seq ordered.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CoinTimeline {
    pub items: Vec<EventEnvelope>,
    pub server_now: IsoTs,
}
/// `GET /stats/pnl` data (contracts 1.1.6 / 0022): one server-computed PnL card.
///
/// `realized` / `unrealized` / `total` come from `portfolio_latest` (all-time, current epoch);
/// `realized_pnl_window_lamports` and the closed-trade stats only count whole exits inside the
/// requested range. They may differ legitimately (partial take-profits on still-open positions).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PnlSummary {
    pub mode: Mode,
    #[serde(default)]
    pub practice_epoch: Option<i64>,
    /// Echo of the requested range (`24h`, `7d`, `30d`, `all`); null for from/to.
    #[serde(default)]
    pub window: Option<String>,
    #[serde(default)]
    pub from: Option<IsoTs>,
    #[serde(default)]
    pub to: Option<IsoTs>,
    #[serde(default)]
    pub unrealized_pnl_lamports: Option<Lamports>,
    #[serde(default)]
    pub realized_pnl_lamports: Option<Lamports>,
    #[serde(default)]
    pub total_pnl_lamports: Option<Lamports>,
    #[serde(default)]
    pub realized_pnl_window_lamports: Lamports,
    #[serde(default)]
    pub closed_count: i64,
    #[serde(default)]
    pub win_count: i64,
    /// null when `closed_count = 0` (never a fake 0 %).
    #[serde(default)]
    pub win_rate_pct: Option<Num>,
    #[serde(default)]
    pub avg_hold_s: Option<Num>,
    /// Reported context only: the swap fee is already inside sol_in/sol_out.
    #[serde(default)]
    pub fees_lamports: Lamports,
    #[serde(default)]
    pub best_pnl_lamports: Option<Lamports>,
    #[serde(default)]
    pub worst_pnl_lamports: Option<Lamports>,
    #[serde(default)]
    pub as_of_seq: Option<String>,
    #[serde(default)]
    pub ts: Option<IsoTs>,
}

/// `GET /positions?state=closed&window=` row: the realized result is locked at close (`0022`).
/// Only the report fields are decoded; the server sends the full position.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClosedPositionRow {
    pub id: String,
    pub position_key: String,
    pub mint: String,
    #[serde(default)]
    pub logo_hash: Option<String>,
    /// Owning bot; resolved to its name by the UI (the wire only carries the id).
    #[serde(default)]
    pub strategy_id: Option<String>,
    #[serde(default)]
    pub exit_reason: Option<ExitReason>,
    #[serde(default)]
    pub opened_at: Option<IsoTs>,
    #[serde(default)]
    pub closed_at: Option<IsoTs>,
    /// SOL spent to open the position (never reduced by partial sells).
    #[serde(default)]
    pub sol_in_lamports: Option<Lamports>,
    #[serde(default)]
    pub sol_out_lamports: Option<Lamports>,
    /// Reported context only; the swap fee is already inside sol_in/sol_out.
    #[serde(default)]
    pub fees_lamports: Option<Lamports>,
    #[serde(default)]
    pub pnl_lamports: Option<Lamports>,
    #[serde(default)]
    pub pnl_pct: Option<Num>,
    #[serde(default)]
    pub hold_seconds: Option<i64>,
}

/// `GET /stats/exit-reasons` row (shape not specified in the contract yet → minimal subset).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExitReasonStat {
    pub exit_reason: ExitReason,
    pub count: i64,
    pub pnl_lamports: Lamports,
    /// 1.1.2: nullable.
    #[serde(default)]
    pub avg_pnl_pct: Option<Num>,
    /// 1.1.2.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub win_rate_pct: Option<Num>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avg_hold_s: Option<Num>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn units_are_strings_and_exact() {
        let l: Lamports = serde_json::from_str("\"250000000\"").unwrap();
        assert_eq!(l.sol().to_string(), "0.25");
        assert_eq!(serde_json::to_string(&l).unwrap(), "\"250000000\"");
        assert!(
            serde_json::from_str::<Lamports>("250000000").is_err(),
            "JSON numbers rejected"
        );
        assert!(serde_json::from_str::<Lamports>("\"0.5\"").is_err());
        let d: Dec = serde_json::from_str("\"0.000000213400\"").unwrap();
        assert_eq!(d.to_string(), "0.0000002134");
        assert!(Dec::parse("1e-7").is_err(), "exponent rejected");
        assert!(
            serde_json::from_str::<Dec>("0.5").is_err(),
            "float rejected"
        );
        assert_eq!(
            Lamports::from_sol(Dec::parse("0.25").unwrap().0),
            Lamports(250_000_000)
        );
    }

    #[test]
    fn untrusted_is_plain_text() {
        let u = Untrusted {
            symbol: Some("<b>\u{202E}EVIL\u{0007}   COIN</b>xxxxxxxxxxxxxx".into()),
            ..Default::default()
        };
        let s = u.display_symbol(None);
        assert!(!s.contains('\u{202E}') && !s.contains('\u{0007}'));
        assert!(s.chars().count() <= 16);
        // Markup stays literal text; the UI renders it via text nodes only.
        assert!(s.starts_with("<b>"));
    }

    #[test]
    fn seq_accepts_number_and_int64_string() {
        let c: ClockMessage =
            serde_json::from_str(r#"{"server_now":"2026-10-29T08:42:00.000Z","safe_seq":18000}"#)
                .unwrap();
        assert_eq!(c.safe_seq, 18_000);
        let c: ClockMessage = serde_json::from_str(
            r#"{"server_now":"2026-10-29T08:42:00.000Z","safe_seq":"9007199254740993"}"#,
        )
        .unwrap();
        assert_eq!(c.safe_seq, 9_007_199_254_740_993, "beyond 2^53 stays exact");
        assert!(
            serde_json::from_str::<ClockMessage>(r#"{"server_now":"x","safe_seq":"1e3"}"#).is_err()
        );
        assert_eq!(
            serde_json::to_value(&c).unwrap()["safe_seq"],
            "9007199254740993"
        );
        assert_eq!(pct_to_bps(25), Some(2_500));
        assert_eq!(pct_to_bps(100), Some(FRACTION_BPS_MAX));
        assert_eq!(pct_to_bps(0), None);
        assert!(is_sol_quote(None) && is_sol_quote(Some(WSOL_MINT)));
        assert!(!is_sol_quote(Some(
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        )));
    }

    #[test]
    fn iso_roundtrip() {
        let t = IsoTs::from_ms(1_793_263_320_123);
        assert_eq!(t.0, "2026-10-29T08:42:00.123Z");
        assert_eq!(t.ms(), Some(1_793_263_320_123));
    }
}
