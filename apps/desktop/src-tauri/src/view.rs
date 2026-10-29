//! Desktop **view-model** sent to the webview over Tauri IPC, built by the client-side reducer
//! (`state.rs`) from wire v1.1 events (`model.rs`). Same conventions as the wire (v1.1): snake_case
//! keys, lamports / raw amounts as integer strings, prices as decimal strings, percentages /
//! ratios / scores / USD as numbers. Names follow the contracts CHANGELOG (e.g. `score_threshold`,
//! not `passMark`). Desktop-only preferences live here as well.

use crate::model::{Actor, Dec, GuardVerdict, IsoTs, Lamports, Mode, Num, ProposalExpiredReason, ProposalStatus, RawQty};
use serde::{Deserialize, Serialize};

/// Pending/decided buy proposal joined with its pick (`proposal.created` + `pick.created` + marks).
#[derive(Debug, Clone, Serialize)]
pub struct PickView {
    /// `proposal_id` (wire).
    pub id: String,
    pub version: u32,
    pub ck: String,
    pub mint: String,
    pub strategy_id: Option<String>,
    pub strategy: String,
    /// Sanitised plain-text symbol from `untrusted.symbol` (never HTML).
    pub symbol: String,
    pub name: Option<String>,
    pub summary: String,
    pub score: Option<Num>,
    pub score_threshold: Option<Num>,
    pub reasons: Vec<String>,
    pub guard_verdict: Option<GuardVerdict>,
    pub amount_lamports: Option<Lamports>,
    pub first_buy: bool,
    pub price_sol: Option<Dec>,
    pub price_usd: Option<Dec>,
    pub liquidity_usd: Option<Num>,
    pub created_at: IsoTs,
    pub expires_at: IsoTs,
    /// Server-clock epoch ms; UI renders `expires_at_ms - (Date.now() + skew_ms)`.
    pub created_at_ms: i64,
    pub expires_at_ms: i64,
    pub status: ProposalStatus,
    pub expired_reason: Option<ProposalExpiredReason>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PositionView {
    pub key: String,
    pub ck: Option<String>,
    pub mint: String,
    pub strategy_id: Option<String>,
    pub strategy: String,
    pub symbol: String,
    pub qty_raw: RawQty,
    pub cost_lamports: Lamports,
    pub value_lamports: Lamports,
    pub pnl_lamports: Lamports,
    pub realized_lamports: Lamports,
    pub pnl_pct: Num,
    pub entry_price_sol: Dec,
    pub last_price_sol: Dec,
    pub peak_price_sol: Dec,
    /// last / entry and peak / entry (numbers; display only).
    pub ratio: Num,
    pub peak_ratio: Num,
    pub opened_at_ms: i64,
    pub plan_state: serde_json::Value,
    /// Resource revision from `position.updated` (sent as If-Match on sell when known).
    pub rev: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityView {
    pub id: String,
    pub seq: Option<i64>,
    pub ts_ms: i64,
    pub actor: Actor,
    /// Wire event type (`proposal.created`, …) or `local.*` for client-side notes.
    pub kind: String,
    pub tone: Tone,
    pub mint: Option<String>,
    pub symbol: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Tone {
    Neutral,
    Good,
    Bad,
    Guard,
    Info,
}

#[derive(Debug, Clone, Serialize)]
pub struct TickView {
    pub mint: String,
    /// unix seconds (server clock)
    pub time: i64,
    pub price_sol: Dec,
}

#[derive(Debug, Clone, Serialize)]
pub struct CandleView {
    pub time: i64,
    pub open: Dec,
    pub high: Dec,
    pub low: Dec,
    pub close: Dec,
}

#[derive(Debug, Clone, Serialize)]
pub struct SellQuote {
    pub nonce: String,
    pub position_key: String,
    pub mint: String,
    pub symbol: String,
    pub pct: u8,
    pub est_sol_out_lamports: Lamports,
    pub ttl_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Account {
    pub cash_lamports: Option<Lamports>,
    pub equity_lamports: Option<Lamports>,
    pub unrealized_pnl_lamports: Option<Lamports>,
    pub drawdown_pct: Option<Num>,
    pub as_of_seq: Option<i64>,
    /// Practice epoch (bumped by `practice.reset`).
    pub epoch: Option<i64>,
    /// Workspace `rev` (If-Match for practice reset).
    pub workspace_rev: Option<u64>,
    /// Account lifecycle banner (`account.deletion_scheduled` / `account.deleted`), plain text.
    pub notice: Option<String>,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineItem {
    pub seq: i64,
    pub ts: IsoTs,
    pub kind: String,
    pub actor: Actor,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExitReasonStatView {
    pub exit_reason: crate::model::ExitReason,
    pub label: String,
    pub count: i64,
    pub pnl_lamports: Lamports,
    pub avg_pnl_pct: Num,
}

/// Strategy list entry (names + `rev` + status) for pause/resume with If-Match.
#[derive(Debug, Clone, Serialize)]
pub struct StrategyView {
    pub id: String,
    pub name: String,
    pub rev: u64,
    pub status: String,
}

/// Result of a stale write (409) shown as a conflict toast; the UI refreshes from `current`.
#[derive(Debug, Clone, Serialize)]
pub struct ConflictView {
    pub code: String,
    pub resource: String,
    pub resource_id: String,
    pub base_rev: Option<u64>,
    pub current_rev: Option<u64>,
    pub changed_fields: Vec<String>,
    pub changed_via: Option<String>,
    pub changed_at: Option<IsoTs>,
    /// CONFIRMATION_RESTART_REQUIRED: redo the full confirmation (Real SOL, Phase 7).
    pub restart_confirmation: bool,
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct SyncStatus {
    pub workspace_id: String,
    /// Resume cursor (from SSE id / page `next_after_seq`).
    pub watermark: i64,
    pub gaps_seen: u64,
    pub resyncs: u64,
    pub recovered: u64,
    pub duplicates: u64,
    pub ignored: u64,
    pub reconnects: u64,
    /// server_now − local_now (EWMA), ms.
    pub skew_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
pub struct Snapshot {
    pub mode: Mode,
    pub connected: bool,
    pub source: &'static str,
    pub signals: Vec<PickView>,
    pub positions: Vec<PositionView>,
    pub activity: Vec<ActivityView>,
    pub settings: Settings,
    pub account: Account,
    pub strategies: Vec<StrategyView>,
    pub sync: SyncStatus,
    pub contracts_version: &'static str,
}
