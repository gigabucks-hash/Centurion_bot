//! Desktop **view-model** sent to the webview over Tauri IPC, built by the client-side reducer
//! (`state.rs`) from wire v1.1 events (`model.rs`). Same conventions as the wire (v1.1): snake_case
//! keys, lamports / raw amounts as integer strings, prices as decimal strings, percentages /
//! ratios / scores / USD as numbers. Names follow the contracts CHANGELOG (e.g. `score_threshold`,
//! not `passMark`). Desktop-only preferences live here as well.

use crate::model::{
    Actor, Dec, GuardVerdict, IsoTs, Lamports, Mode, Num, ProposalExpiredReason, ProposalStatus,
    RawQty, Venue,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Tradeability of a coin for Practice (WF-20). `tradeable == false` → neutral "not tradeable"
/// state: no Approve, no Sell (UI disabled **and** blocked in the Rust commands).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Tradeability {
    pub tradeable: bool,
    /// Error-registry code, e.g. `UNSUPPORTED_QUOTE_MINT` (shown as "Reason code" for support).
    pub reason_code: Option<String>,
    pub quote_mint: Option<String>,
    /// Static label for well-known quote mints (`USDC`), never token metadata.
    pub quote_symbol: Option<&'static str>,
}
impl Default for Tradeability {
    fn default() -> Self {
        Self {
            tradeable: true,
            reason_code: None,
            quote_mint: None,
            quote_symbol: None,
        }
    }
}

/// Localisable activity text: the webview renders `key` from `@centurion/i18n` with `args`
/// (numbers formatted in the UI locale). `ActivityView.message` stays as the plain-text fallback.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct I18nMsg {
    pub key: String,
    pub args: BTreeMap<String, I18nArg>,
}
/// Argument for an ICU message. Lamports are formatted client-side (`formatLamports` / `pnlSol`).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "t", content = "v", rename_all = "snake_case")]
pub enum I18nArg {
    Text(String),
    Lamports(Lamports),
    PnlLamports(Lamports),
    Num(Num),
    /// Another catalog key (e.g. `order.fail_reason.unsupported_quote_mint`) rendered first.
    Key(String),
    /// Basis points of a whole (10 000 = 100 %), rendered with format.mjs `formatFractionBps`.
    Bps(Num),
    /// A price (decimal string), rendered with the UI locale.
    Price(crate::model::Dec),
}
impl I18nMsg {
    pub fn new(key: &str) -> Self {
        Self {
            key: key.into(),
            args: BTreeMap::new(),
        }
    }
    pub fn arg(mut self, k: &str, v: I18nArg) -> Self {
        self.args.insert(k.into(), v);
        self
    }
    pub fn text(self, k: &str, v: impl Into<String>) -> Self {
        self.arg(k, I18nArg::Text(v.into()))
    }
}

/// Screener row (WF-20 "Coins · screener"): every scored coin, including rejected and
/// not-tradeable ones (transparency), newest first, bounded.
#[derive(Debug, Clone, Serialize)]
pub struct ScreenedCoin {
    /// 1.1.6 (pending): validated logo hash of `mint` (`v` of our image proxy); None → identicon.
    pub logo_hash: Option<String>,
    pub ck: String,
    pub mint: String,
    pub symbol: String,
    pub name: Option<String>,
    pub venue: Option<Venue>,
    pub strategy: String,
    pub score: Num,
    pub score_threshold: Num,
    pub max_score: Num,
    pub passed: bool,
    pub guard_verdict: Option<GuardVerdict>,
    /// `pick` | `rejected_score` | `rejected_guard` | `not_tradeable`.
    pub status: String,
    /// 1.1.4 market cap (flattened: `market_cap_lamports`, `mcap_usd`, `mcap_as_of`).
    #[serde(flatten)]
    pub mcap: crate::model::MarketCap,
    pub liquidity_usd: Option<Num>,
    pub decimals: Option<u8>,
    pub token_program: Option<String>,
    pub ts_ms: i64,
    #[serde(flatten)]
    pub trade: Tradeability,
}

/// Pending/decided buy proposal joined with its pick (`proposal.created` + `pick.created` + marks).
#[derive(Debug, Clone, Serialize)]
pub struct PickView {
    /// 1.1.6 (pending): validated logo hash of `mint` (`v` of our image proxy); None → identicon.
    pub logo_hash: Option<String>,
    /// `proposal_id` (wire).
    pub id: String,
    /// Approval rev (wire `rev`, 1.1.2).
    #[serde(rename = "rev")]
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
    #[serde(flatten)]
    pub trade: Tradeability,
    /// 1.1.4 quote (fee, total max, slippage, expiry), merged from proposal.created / proposal.updated.
    #[serde(flatten)]
    pub quote: crate::model::ProposalQuote,
    /// Last approve was refused with `409 QUOTE_MISSING_OR_STALE` → the card shows "refresh quote".
    pub quote_stale: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PositionView {
    /// 1.1.6 (pending): validated logo hash of `mint` (`v` of our image proxy); None → identicon.
    pub logo_hash: Option<String>,
    pub key: String,
    /// 1.1.2 server position id (`order.*` events reference it).
    pub position_id: Option<String>,
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
    pub plan_state: Option<crate::model::PlanState>,
    /// Position `rev` (1.1.2: on `position.opened` / `.updated` / close response) → `If-Match` on close.
    pub rev: Option<u64>,
    /// Token decimals from `coin.detected` / `position.opened` (None = unknown → value not derived).
    pub decimals: Option<u8>,
    #[serde(flatten)]
    pub trade: Tradeability,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityView {
    pub id: String,
    /// int64 string (1.1.2) — compare with BigInt in TS.
    #[serde(with = "crate::model::seq::opt")]
    pub seq: Option<i64>,
    pub ts_ms: i64,
    pub actor: Actor,
    /// Wire event type (`proposal.created`, …) or `local.*` for client-side notes.
    pub kind: String,
    pub tone: Tone,
    pub mint: Option<String>,
    pub symbol: Option<String>,
    /// Plain-text fallback (Indonesian); the UI prefers `i18n` when present.
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub i18n: Option<I18nMsg>,
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
    /// int64 string (1.1.2) — compare with BigInt in TS.
    #[serde(with = "crate::model::seq::opt")]
    pub as_of_seq: Option<i64>,
    /// Practice epoch (bumped by `practice.reset`).
    pub epoch: Option<i64>,
    /// Workspace `rev` (If-Match for practice reset).
    pub workspace_rev: Option<u64>,
    /// Account lifecycle banner (`account.deletion_scheduled` / `account.deleted`), plain text.
    pub notice: Option<String>,
    pub deleted: bool,
    /// `PRACTICE_CASH_INSUFFICIENT` (kind **notice**, `system.notice`): strategy entries are paused until
    /// practice cash recovers or Practice is reset. Workspace-level state, shown as a neutral strip.
    /// Not the same as `order.failed INSUFFICIENT_PRACTICE_BALANCE` (kind error, one order only).
    pub entries_paused: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimelineItem {
    #[serde(with = "crate::model::seq")]
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
    pub avg_pnl_pct: Option<Num>,
    pub win_rate_pct: Option<Num>,
    pub avg_hold_s: Option<Num>,
}

/// Strategy list entry (names + `rev` + status) for pause/resume with If-Match.
#[derive(Debug, Clone, Serialize)]
pub struct StrategyView {
    pub id: String,
    pub name: String,
    pub rev: u64,
    pub status: String,
    /// 1.1.4 exit timers from settings (`time_stop_s`, `stall_exit`).
    #[serde(flatten)]
    pub exits: crate::model::ExitTimers,
    /// Wire mode (`practice` = UI "Paper").
    pub mode: crate::model::Mode,
    /// 1.1.6 Real gate. `true` unless the server explicitly said `false` (missing → locked).
    pub real_locked: bool,
    /// `needs_owner_approval` | `gate_not_met` | `policy` | `other`; `other` when locked without a reason.
    pub real_locked_reason: Option<crate::model::RealLockedReason>,
    pub paper_progress: crate::model::PaperProgress,
}
impl StrategyView {
    pub fn from_summary(s: &crate::model::StrategySummary) -> Self {
        let real_locked = s.real_locked != Some(false);
        Self {
            id: s.id.clone(),
            name: crate::model::plain_text(&s.name, 40),
            rev: s.rev,
            status: s.status.clone().unwrap_or_else(|| "active".into()),
            exits: crate::model::ExitTimers::from_settings(&s.settings),
            mode: s.mode.unwrap_or(crate::model::Mode::Practice),
            real_locked,
            real_locked_reason: if real_locked {
                Some(
                    s.real_locked_reason
                        .unwrap_or(crate::model::RealLockedReason::Other),
                )
            } else {
                None
            },
            paper_progress: s.paper_progress.unwrap_or_default(),
        }
    }
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
    #[serde(with = "crate::model::seq")]
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
        Self {
            focus_terminal: "CommandOrControl+Shift+H".into(),
            open_approvals: Some("CommandOrControl+Shift+A".into()),
        }
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
    /// UI language for `@centurion/i18n` (`id` default for Boss; `en` = source catalog).
    #[serde(default)]
    pub locale: Locale,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Locale {
    #[default]
    Id,
    En,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::Dark,
            density: Density::Compact,
            approval_popup: false,
            shortcuts: ShortcutConfig::default(),
            locale: Locale::Id,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    /// Image-proxy origin the webview may load logos from (CSP img-src); None → identicons only.
    pub logo_origin: Option<String>,
    pub mode: Mode,
    pub connected: bool,
    pub source: &'static str,
    pub signals: Vec<PickView>,
    pub positions: Vec<PositionView>,
    pub activity: Vec<ActivityView>,
    pub screened: Vec<ScreenedCoin>,
    pub settings: Settings,
    pub account: Account,
    pub strategies: Vec<StrategyView>,
    pub sync: SyncStatus,
    pub contracts_version: &'static str,
}
