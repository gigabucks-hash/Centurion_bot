//! Desktop view-model types. Rust mirror of `packages/contracts/src/index.ts`
//! (camelCase on the wire). DRAFT until the Backend API Specialist publishes the real
//! spec; the future `source::backend` module maps wire DTOs into these types.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Practice,
    #[allow(dead_code)]
    Real,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Pending,
    Approved,
    Skipped,
    Expired,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Signal {
    pub id: String,
    pub mint: String,
    pub symbol: String,
    pub name: String,
    pub strategy: String,
    pub score: u32,
    pub pass_mark: u32,
    pub price_usd: f64,
    pub market_cap_usd: f64,
    pub liquidity_usd: f64,
    pub age_minutes: u32,
    pub reasons: Vec<String>,
    pub created_at: u64,
    pub expires_at: u64,
    pub stage: Stage,
    /// UX spec reasons: timed_out | strategy_deleted | strategy_archived | guard_failed_while_waiting | price_ran_past_limit
    pub expired_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tick {
    pub mint: String,
    pub time: u64,
    pub price: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Candle {
    pub time: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Actor {
    Screener,
    Guard,
    Entry,
    Executor,
    Exit,
    You,
    System,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ActivityKind {
    Found,
    Passed,
    Blocked,
    Armed,
    Approved,
    Skipped,
    Expired,
    Bought,
    Sold,
    Proposal,
    Info,
}

impl ActivityKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Found => "found",
            Self::Passed => "passed",
            Self::Blocked => "blocked",
            Self::Armed => "armed",
            Self::Approved => "approved",
            Self::Skipped => "skipped",
            Self::Expired => "expired",
            Self::Bought => "bought",
            Self::Sold => "sold",
            Self::Proposal => "proposal",
            Self::Info => "info",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    pub id: String,
    pub ts: u64,
    pub actor: Actor,
    pub kind: ActivityKind,
    pub mint: Option<String>,
    pub symbol: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub mint: String,
    pub symbol: String,
    pub strategy: String,
    pub qty: f64,
    pub entry_price_usd: f64,
    pub last_price_usd: f64,
    pub peak_price_usd: f64,
    pub sol_in: f64,
    pub pnl_pct: f64,
    pub opened_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SellQuote {
    pub nonce: String,
    pub mint: String,
    pub symbol: String,
    pub pct: u8,
    pub est_sol_out: f64,
    pub ttl_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutConfig {
    /// Bring the main terminal to front.
    pub focus_terminal: String,
    /// Open the approval queue (popup if enabled, else main terminal). Per UX: global
    /// shortcuts only OPEN approval UI, never approve/skip/sell directly.
    pub open_approvals: Option<String>,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        Self { focus_terminal: "CommandOrControl+Shift+H".into(), open_approvals: Some("CommandOrControl+Shift+A".into()) }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    /// "Signal Terminal" density — desktop default (UX SPEC §0, Apex decision).
    Compact,
    Comfortable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    /// Follow the OS (window.theme() / tauri://theme-changed).
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: Theme,
    pub density: Density,
    /// Small always-on-top approval window. Opt-in, OFF by default (Apex decision).
    pub approval_popup: bool,
    pub shortcuts: ShortcutConfig,
}

impl Default for Settings {
    fn default() -> Self {
        Self { theme: Theme::Dark, density: Density::Compact, approval_popup: false, shortcuts: ShortcutConfig::default() }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub mode: Mode,
    pub connected: bool,
    pub source: &'static str,
    pub signals: Vec<Signal>,
    pub positions: Vec<Position>,
    pub activity: Vec<ActivityEvent>,
    pub settings: Settings,
    pub paper_cash_sol: f64,
}
