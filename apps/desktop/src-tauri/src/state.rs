//! Client-side state: a **reducer** from wire v1.1 events (`model.rs`) to the desktop view-model
//! (`view.rs`). The backend (mock today) is the source of truth; this store only mirrors it,
//! dedupes by event id, tracks the resume watermark and the server clock skew.

use crate::backend::ActiveTransport;
use crate::error::{AppError, AppResult};
use crate::events::Out;
use crate::keys;
use crate::model::*;
use crate::util::{now_ms, Rng};
use crate::view::*;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};

pub const MAX_SIGNALS: usize = 200;
pub const MAX_ACTIVITY: usize = 1_000;
pub const MAX_TICKS_PER_MINT: usize = 3_600;
pub const CANDLE_SEC: i64 = 5;
pub const SELL_QUOTE_TTL_MS: u64 = 15_000;
const DEDUPE_CAP: usize = 10_000;
pub const MAX_SCREENED: usize = 150;

/// Window label of the always-on-top approval popup (UX DESKTOP_COMPACT_AND_POPUP §4).
pub const POPUP_LABEL: &str = "approval-popup";

/// UX rule: in REAL SOL mode the popup can never approve (hand-off to main only). Enforced in
/// Rust keyed on the *calling window label*. Real SOL on desktop = Phase 7 (C15).
pub fn check_approve_origin(window_label: &str, mode: Mode) -> AppResult<()> {
    if window_label == POPUP_LABEL && mode == Mode::Real {
        return Err(AppError::Invalid("REAL SOL: approve hanya dari window utama (Buka untuk approve)".into()));
    }
    Ok(())
}

pub struct AppState {
    pub engine: Mutex<Engine>,
    pub transport: Arc<ActiveTransport>,
}

#[derive(Debug, Clone, Default)]
struct PickInfo {
    summary: String,
    score: Option<Num>,
    threshold: Option<Num>,
    reasons: Vec<String>,
    guard: Option<GuardVerdict>,
}

/// Per-mint facts from `coin.detected` / `screener.scored` / `order.failed` (1.1.2 fields).
#[derive(Debug, Clone, Default)]
struct CoinInfo {
    venue: Option<Venue>,
    decimals: Option<u8>,
    token_program: Option<String>,
    trade: Tradeability,
}

/// `system.notice` kind notice: entries paused (workspace). ≠ `order.failed` `INSUFFICIENT_PRACTICE_BALANCE`.
pub const PRACTICE_CASH_INSUFFICIENT: &str = "PRACTICE_CASH_INSUFFICIENT";

fn not_tradeable(code: &str, quote_mint: Option<String>) -> Tradeability {
    let quote_symbol = quote_mint.as_deref().and_then(keys::quote_symbol);
    Tradeability { tradeable: false, reason_code: Some(keys::error_code(code).to_owned()), quote_mint, quote_symbol }
}
fn tradeable_with(quote_mint: Option<String>) -> Tradeability {
    let quote_symbol = quote_mint.as_deref().and_then(keys::quote_symbol);
    Tradeability { tradeable: true, reason_code: None, quote_mint, quote_symbol }
}

#[derive(Debug, Clone)]
struct Mark {
    price_sol: Dec,
    price_usd: Dec,
    liquidity_usd: Num,
}

struct PendingSell {
    quote: SellQuote,
    created_ms: u64,
}

pub struct Engine {
    pub mode: Mode,
    pub connected: bool,
    pub settings: Settings,
    pub signals: VecDeque<PickView>,
    positions: HashMap<String, PositionView>,
    picks: HashMap<String, PickInfo>,
    coins: HashMap<String, CoinInfo>,
    screened: VecDeque<ScreenedCoin>,
    strategies: HashMap<String, StrategyView>,
    marks: HashMap<String, Mark>,
    ticks: HashMap<String, VecDeque<TickView>>,
    activity: VecDeque<ActivityView>,
    pub account: Account,
    pub sync: SyncStatus,
    seen: HashSet<String>,
    seen_order: VecDeque<String>,
    skew_init: bool,
    quotes: HashMap<String, PendingSell>,
    local_seq: u64,
    pub rng: Rng,
    /// Set by `practice.reset`: the sync loop refetches the portfolio for the new epoch.
    pub refetch_portfolio: bool,
    /// Set by `strategy.*` with a newer rev than we hold: refetch the strategy list.
    pub refetch_strategies: bool,
}

/// Raw → UI token amount. `None` when decimals are unknown: no "6" assumption (1.1.2 sends them).
fn qty_ui(q: RawQty, decimals: Option<u8>) -> Option<Decimal> {
    let d = decimals.filter(|d| *d <= 28)?;
    Some(Decimal::from_i128_with_scale(q.0 as i128, d as u32))
}
fn lamports_of(sol: Decimal) -> Lamports {
    Lamports::from_sol(sol)
}
/// Plain-text SOL (fallback copy; the UI prefers i18n). Negatives use U+2212, never a hyphen.
fn fmt_sol(l: Lamports) -> String {
    let s = l.sol().round_dp(4);
    if s < Decimal::ZERO { format!("\u{2212}{} SOL", s.abs()) } else { format!("{s} SOL") }
}
/// Signed PnL (T-15): exact zero → neutral "0.00 SOL"; a non-zero value never reads as 0
/// (below 0.0001 → "<0.0001"); minus is U+2212.
fn fmt_signed_sol(l: Lamports) -> String {
    if l.0 == 0 {
        return "0.00 SOL".into();
    }
    let a = l.sol().abs().round_dp(4);
    let body = if a.is_zero() { "<0.0001".to_string() } else { a.to_string() };
    if l.0 > 0 { format!("▲ +{body} SOL") } else { format!("▼ \u{2212}{body} SOL") }
}

impl Engine {
    pub fn new(workspace_id: &str) -> Self {
        Self {
            mode: Mode::Practice,
            connected: false,
            settings: Settings::default(),
            signals: VecDeque::new(),
            positions: HashMap::new(),
            picks: HashMap::new(),
            coins: HashMap::new(),
            screened: VecDeque::new(),
            strategies: HashMap::new(),
            marks: HashMap::new(),
            ticks: HashMap::new(),
            activity: VecDeque::new(),
            account: Account::default(),
            sync: SyncStatus { workspace_id: workspace_id.into(), ..Default::default() },
            seen: HashSet::new(),
            seen_order: VecDeque::new(),
            skew_init: false,
            quotes: HashMap::new(),
            local_seq: 0,
            rng: Rng::seeded(),
            refetch_portfolio: false,
            refetch_strategies: false,
        }
    }

    /// Server-clock "now" (local clock + measured skew).
    pub fn server_now_ms(&self) -> i64 {
        now_ms() as i64 + self.sync.skew_ms
    }

    /// `skew = server_now − local_now` (EWMA over samples; first sample taken as-is).
    pub fn observe_server_now(&mut self, server_now: &IsoTs) {
        let Some(s) = server_now.ms() else { return };
        let sample = s - now_ms() as i64;
        self.sync.skew_ms = if self.skew_init { (self.sync.skew_ms * 7 + sample) / 8 } else { sample };
        self.skew_init = true;
    }

    /// Replace/merge strategies from `GET /strategies` or a 409 `current` body (higher rev wins).
    pub fn set_strategies(&mut self, list: &[StrategySummary]) -> Out {
        for s in list {
            let v = StrategyView { id: s.id.clone(), name: crate::model::plain_text(&s.name, 40), rev: s.rev, status: s.status.clone().unwrap_or_else(|| "active".into()) };
            match self.strategies.get(&s.id) {
                Some(old) if old.rev > s.rev => {}
                _ => {
                    self.strategies.insert(s.id.clone(), v);
                }
            }
        }
        Out::Strategies(self.strategies_vec())
    }

    pub fn strategies_vec(&self) -> Vec<StrategyView> {
        let mut v: Vec<_> = self.strategies.values().cloned().collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }

    #[cfg(test)]
    pub fn strategy_rev(&self, id: &str) -> Option<u64> {
        self.strategies.get(id).map(|s| s.rev)
    }

    pub fn set_portfolio(&mut self, p: &PortfolioSnapshot) -> Out {
        self.account.cash_lamports = Some(p.cash_lamports);
        self.account.equity_lamports = Some(p.equity_lamports);
        self.account.unrealized_pnl_lamports = Some(p.unrealized_pnl_lamports);
        self.account.drawdown_pct = Some(p.drawdown_pct);
        self.account.as_of_seq = Some(p.as_of_seq);
        if p.practice_epoch.is_some() {
            self.account.epoch = p.practice_epoch;
        }
        Out::Account(self.account.clone())
    }

    /// Tradeability of a mint as currently known (unknown coin → tradeable, like Backend).
    pub fn trade_of(&self, mint: &str) -> Tradeability {
        self.coins.get(mint).map(|c| c.trade.clone()).unwrap_or_default()
    }

    /// WF-20 gate shared by approve and sell commands.
    pub fn check_tradeable(&self, mint: &str) -> AppResult<()> {
        let t = self.trade_of(mint);
        if t.tradeable {
            Ok(())
        } else {
            Err(AppError::NotTradeable(t.reason_code.unwrap_or_else(|| UNSUPPORTED_QUOTE_MINT.into())))
        }
    }

    /// Set a mint's tradeability and push it into every pending card / open position of that mint.
    fn set_trade(&mut self, mint: &str, trade: Tradeability, outs: &mut Vec<Out>) {
        let info = self.coins.entry(mint.to_owned()).or_default();
        if info.trade == trade {
            return;
        }
        info.trade = trade.clone();
        for s in self.signals.iter_mut().filter(|s| s.mint == mint && s.status == ProposalStatus::Pending) {
            s.trade = trade.clone();
            outs.push(Out::SignalUpdate(s.clone()));
        }
        let mut touched = false;
        for p in self.positions.values_mut().filter(|p| p.mint == mint) {
            p.trade = trade.clone();
            touched = true;
        }
        if touched {
            outs.push(Out::Positions(self.positions_vec()));
        }
        if let Some(c) = self.screened.iter_mut().find(|c| c.mint == mint) {
            c.trade = trade.clone();
            if !trade.tradeable {
                c.status = "not_tradeable".into();
            }
            outs.push(Out::Screened(c.clone()));
        }
    }

    pub fn screened_vec(&self) -> Vec<ScreenedCoin> {
        self.screened.iter().cloned().collect()
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            mode: self.mode,
            connected: self.connected,
            source: "mock",
            signals: self.signals.iter().cloned().collect(),
            positions: self.positions_vec(),
            activity: self.activity.iter().take(300).cloned().collect(),
            screened: self.screened_vec(),
            settings: self.settings.clone(),
            account: self.account.clone(),
            strategies: self.strategies_vec(),
            sync: self.sync.clone(),
            contracts_version: CONTRACTS_VERSION,
        }
    }

    pub fn positions_vec(&self) -> Vec<PositionView> {
        let mut v: Vec<_> = self.positions.values().cloned().collect();
        v.sort_by_key(|p| std::cmp::Reverse(p.opened_at_ms));
        v
    }

    #[allow(dead_code)]
    pub fn pending_ids(&self) -> Vec<String> {
        let mut v: Vec<_> = self.signals.iter().filter(|s| s.status == ProposalStatus::Pending).collect();
        v.sort_by_key(|s| s.expires_at_ms);
        v.into_iter().map(|s| s.id.clone()).collect()
    }

    fn strategy_name(&self, id: Option<&str>) -> String {
        id.and_then(|i| self.strategies.get(i).map(|s| s.name.clone())).unwrap_or_else(|| "—".into())
    }

    fn push_activity(&mut self, a: ActivityView) -> Out {
        self.activity.push_front(a.clone());
        self.activity.truncate(MAX_ACTIVITY);
        Out::Activity(a)
    }

    /// Client-side note (errors, connection changes). Not a wire event.
    pub fn note(&mut self, actor: Actor, tone: Tone, msg: impl Into<String>) -> Out {
        self.local_seq += 1;
        let ts = now_ms() as i64;
        self.push_activity(ActivityView { id: format!("local:{ts}:{}", self.local_seq), seq: None, ts_ms: ts, actor, kind: "local.note".into(), tone, mint: None, symbol: None, message: msg.into(), i18n: None })
    }

    /// True if this envelope id was already applied (dedupe; ids are deterministic).
    fn seen_before(&mut self, id: &str) -> bool {
        if self.seen.contains(id) {
            return true;
        }
        self.seen.insert(id.to_owned());
        self.seen_order.push_back(id.to_owned());
        while self.seen_order.len() > DEDUPE_CAP {
            if let Some(old) = self.seen_order.pop_front() {
                self.seen.remove(&old);
            }
        }
        false
    }

    /// Apply one wire envelope. Returns UI events. Idempotent per `id`.
    pub fn apply_event(&mut self, env: &EventEnvelope) -> Vec<Out> {
        if let Some(sn) = &env.server_now {
            self.observe_server_now(sn);
        }
        if env.workspace_id != self.sync.workspace_id || env.mode != Mode::Practice {
            self.sync.ignored += 1; // wrong scope (defence in depth; server filters already)
            return vec![];
        }
        if self.seen_before(&env.id) {
            self.sync.duplicates += 1;
            return vec![];
        }
        // v1.0 → v1.1 renames (keys.rs) so a lagging producer still decodes; no-op on v1.1 input.
        let mut norm = env.clone();
        keys::normalize(&mut norm.payload);
        let known = match KnownEvent::decode(&norm) {
            Some(Ok(k)) => k,
            Some(Err(e)) => {
                self.sync.ignored += 1;
                log::warn!("bad payload for {} (seq {}): {e}", env.kind, env.seq);
                return vec![];
            }
            None => {
                self.sync.ignored += 1; // unknown type / newer version → ignore (contract rule)
                return vec![];
            }
        };
        let sym = env.untrusted.display_symbol(env.mint.as_deref());
        let ts_ms = env.ts.ms().unwrap_or(0);
        let mut outs = Vec::new();
        let act = |tone: Tone, msg: String| ActivityView {
            id: env.id.clone(),
            seq: Some(env.seq),
            ts_ms,
            actor: env.actor,
            kind: env.kind.clone(),
            tone,
            mint: env.mint.clone(),
            symbol: env.mint.as_ref().map(|_| sym.clone()),
            message: msg,
            i18n: None,
        };
        let ck = env.ck.clone().unwrap_or_default();
        let mut i18n: Option<I18nMsg> = None;
        let a = match known {
            KnownEvent::CoinDetected(c) => {
                let trade = if is_sol_quote(c.quote_mint.as_deref()) { tradeable_with(c.quote_mint.clone()) } else { not_tradeable(UNSUPPORTED_QUOTE_MINT, c.quote_mint.clone()) };
                let info = self.coins.entry(c.mint.clone()).or_default();
                info.venue = Some(c.venue);
                info.decimals = c.decimals.or(info.decimals);
                info.token_program = c.token_program.clone().map(|t| crate::model::plain_text(&t, 48)).or(info.token_program.take());
                let flipped = !trade.tradeable;
                self.set_trade(&c.mint, trade, &mut outs);
                if flipped {
                    i18n = Some(I18nMsg::new("screener.not_tradeable.badge"));
                    act(Tone::Neutral, format!("Koin baru ({}) · tidak bisa ditradingkan (quote bukan SOL)", if c.venue == Venue::Curve { "curve" } else { "amm" }))
                } else {
                    act(Tone::Neutral, format!("Koin baru ({})", if c.venue == Venue::Curve { "curve" } else { "amm" }))
                }
            }
            KnownEvent::ScreenerScored(s) => {
                let info = self.picks.entry(ck.clone()).or_default();
                info.score = Some(s.result.score);
                info.threshold = Some(s.result.score_threshold);
                info.reasons = s.result.checks.iter().filter(|c| c.passed).map(|c| crate::model::plain_text(&c.reason, 40)).collect();
                let quote = s.quote_mint.clone().or_else(|| s.result.quote_mint.clone()).or_else(|| self.coins.get(&s.mint).and_then(|c| c.trade.quote_mint.clone()));
                let tradeable = s.tradeable.unwrap_or(s.result.tradeable) && is_sol_quote(quote.as_deref());
                let skip = s.skip_reason.clone().or_else(|| s.result.skip_reason.clone());
                let trade = if tradeable { tradeable_with(quote) } else { not_tradeable(skip.as_deref().unwrap_or(UNSUPPORTED_QUOTE_MINT), quote) };
                let coin = self.coins.get(&s.mint).cloned().unwrap_or_default();
                let row = ScreenedCoin {
                    ck: ck.clone(),
                    mint: s.mint.clone(),
                    symbol: sym.clone(),
                    name: env.untrusted.display_name(),
                    venue: coin.venue,
                    strategy: self.strategy_name(env.strategy_id.as_deref()),
                    score: s.result.score,
                    score_threshold: s.result.score_threshold,
                    max_score: s.result.max_score,
                    passed: s.passed && tradeable,
                    guard_verdict: None,
                    status: if !tradeable { "not_tradeable" } else if s.passed { "pending_guard" } else { "rejected_score" }.into(),
                    liquidity_usd: self.marks.get(&s.mint).map(|m| m.liquidity_usd),
                    decimals: coin.decimals,
                    token_program: coin.token_program.clone(),
                    ts_ms,
                    trade: trade.clone(),
                };
                self.screened.retain(|c| c.ck != row.ck);
                self.screened.push_front(row.clone());
                self.screened.truncate(MAX_SCREENED);
                outs.push(Out::Screened(row));
                self.set_trade(&s.mint, trade, &mut outs);
                if !tradeable {
                    // WF-20: neutral, not an error; score is informational only.
                    i18n = Some(I18nMsg::new("screener.not_tradeable.badge"));
                    act(Tone::Neutral, format!("Screener: tidak bisa ditradingkan ({}) · skor {}/{} (info)", keys::error_code(skip.as_deref().unwrap_or(UNSUPPORTED_QUOTE_MINT)), s.result.score, s.result.max_score))
                } else {
                    i18n = s.passed.then(|| I18nMsg::new("feed.event.passed").text("symbol", sym.clone()).arg("score", I18nArg::Num(s.result.score)).arg("pass", I18nArg::Num(s.result.score_threshold)));
                    act(if s.passed { Tone::Good } else { Tone::Bad }, format!("Screener: fit {}/{}", s.result.score, s.result.score_threshold))
                }
            }
            KnownEvent::GuardResult(g) => {
                self.picks.entry(ck.clone()).or_default().guard = Some(g.verdict);
                if let Some(c) = self.screened.iter_mut().find(|c| c.ck == ck) {
                    c.guard_verdict = Some(g.verdict);
                    if g.verdict == GuardVerdict::Fail {
                        c.status = "rejected_guard".into();
                        c.passed = false;
                    }
                    outs.push(Out::Screened(c.clone()));
                }
                match g.verdict {
                    GuardVerdict::Fail => {
                        i18n = Some(I18nMsg::new("feed.event.blocked").text("symbol", sym.clone()));
                        act(Tone::Guard, format!("Blocked: {}", g.reasons.join(", ")))
                    }
                    v => act(Tone::Good, format!("Guard {v:?}")),
                }
            }
            KnownEvent::PickCreated(p) => {
                let info = self.picks.entry(ck.clone()).or_default();
                info.summary = crate::model::plain_text(&p.summary, 80);
                info.score = Some(p.score.score);
                info.threshold = Some(p.score.score_threshold);
                info.guard = Some(p.guard_verdict);
                if let Some(c) = self.screened.iter_mut().find(|c| c.ck == ck) {
                    if c.trade.tradeable {
                        c.status = "pick".into();
                    }
                    c.guard_verdict = Some(p.guard_verdict);
                    outs.push(Out::Screened(c.clone()));
                }
                act(Tone::Info, "Pick dibuat".into())
            }
            KnownEvent::EntryArmed(e) => act(Tone::Neutral, format!("Entry armed ({})", crate::model::plain_text(&e.condition, 32))),
            KnownEvent::EntryExpired(e) => act(Tone::Neutral, format!("Entry expired: {}", crate::model::plain_text(&e.reason, 32))),
            KnownEvent::ProposalCreated(p) => {
                let info = self.picks.get(&ck).cloned().unwrap_or_default();
                // 1.1.2: proposal carries mint/symbol/price itself; fall back to the envelope/marks.
                let mint = p.mint.clone().or_else(|| env.mint.clone()).unwrap_or_default();
                let mark = self.marks.get(&mint).cloned();
                let sym = match (&p.symbol, env.untrusted.symbol.is_none()) {
                    (Some(s), true) => crate::model::Untrusted { symbol: Some(s.clone()), ..Default::default() }.display_symbol(Some(&mint)),
                    _ => sym.clone(),
                };
                let view = PickView {
                    id: p.proposal_id.clone(),
                    version: p.version,
                    ck: ck.clone(),
                    mint: mint.clone(),
                    strategy_id: env.strategy_id.clone(),
                    strategy: self.strategy_name(env.strategy_id.as_deref()),
                    symbol: sym.clone(),
                    name: env.untrusted.display_name(),
                    summary: if info.summary.is_empty() { crate::model::plain_text(&p.summary, 80) } else { info.summary.clone() },
                    score: info.score,
                    score_threshold: info.threshold,
                    reasons: info.reasons.clone(),
                    guard_verdict: info.guard,
                    amount_lamports: p.amount_lamports,
                    first_buy: p.first_buy,
                    price_sol: mark.as_ref().map(|m| m.price_sol).or(p.price_sol),
                    price_usd: mark.as_ref().map(|m| m.price_usd),
                    liquidity_usd: mark.as_ref().map(|m| m.liquidity_usd),
                    created_at: env.ts.clone(),
                    expires_at: p.expires_at.clone(),
                    created_at_ms: ts_ms,
                    expires_at_ms: p.expires_at.ms().unwrap_or(ts_ms),
                    status: ProposalStatus::Pending,
                    expired_reason: None,
                    trade: self.trade_of(&mint),
                };
                self.signals.retain(|s| s.id != view.id);
                self.signals.push_front(view.clone());
                while self.signals.len() > MAX_SIGNALS {
                    if let Some(i) = self.signals.iter().rposition(|x| x.status != ProposalStatus::Pending) {
                        self.signals.remove(i);
                    } else {
                        self.signals.pop_back();
                    }
                }
                let blocked = !view.trade.tradeable;
                outs.push(Out::SignalNew(view));
                if blocked {
                    i18n = Some(I18nMsg::new("queue.pick.cannot_approve"));
                    act(Tone::Neutral, "Pick tidak bisa di-approve (tanpa pair SOL)".into())
                } else {
                    act(Tone::Info, "Pick menunggu approval".into())
                }
            }
            KnownEvent::ProposalApproved(d) | KnownEvent::ProposalRejected(d) => {
                let approved = env.kind == "proposal.approved";
                if let Some(s) = self.signals.iter_mut().find(|s| s.id == d.proposal_id) {
                    s.status = if approved { ProposalStatus::Approved } else { ProposalStatus::Rejected };
                    s.version = d.version;
                    outs.push(Out::SignalUpdate(s.clone()));
                }
                let via = serde_json::to_value(d.decided_via).ok().and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default();
                if !approved {
                    i18n = Some(I18nMsg::new("feed.event.skipped").text("symbol", sym.clone()));
                }
                // 1.1.3 reject_reason (closed enum) shown as its wire code for support.
                let why = d.reject_reason.and_then(|r| serde_json::to_value(r).ok()).and_then(|v| v.as_str().map(|s| format!(" · {s}"))).unwrap_or_default();
                act(if approved { Tone::Good } else { Tone::Neutral }, format!("{}{why} (via {via})", if approved { "Approved" } else { "Skipped" }))
            }
            KnownEvent::ProposalExpired(x) => {
                if let Some(s) = self.signals.iter_mut().find(|s| s.id == x.proposal_id) {
                    s.status = ProposalStatus::Expired;
                    s.expired_reason = Some(x.reason);
                    s.version = x.version;
                    outs.push(Out::SignalUpdate(s.clone()));
                }
                let why = serde_json::to_value(x.reason).ok().and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default();
                i18n = Some(I18nMsg::new("feed.event.expired").text("symbol", sym.clone()).arg("reason", I18nArg::Key(format!("expire_reason.{why}.badge"))));
                act(Tone::Neutral, format!("Expired: {why}"))
            }
            KnownEvent::FillSimulated(f) => {
                let side = if f.side == FillSide::Buy { "Paper buy" } else { "Paper sell" };
                act(Tone::Info, format!("{side} {} @ {} SOL (fee {} bps, slip {} bps)", fmt_sol(f.sol_lamports), f.exec_price_sol, f.fee_bps, f.slippage_bps))
            }
            KnownEvent::PositionOpened(p) => {
                let price = p.fill.exec_price_sol;
                let decimals = p.decimals.or_else(|| self.coins.get(&p.mint).and_then(|c| c.decimals));
                let view = PositionView {
                    key: p.position_key.clone(),
                    position_id: p.position_id.clone(),
                    ck: env.ck.clone(),
                    mint: p.mint.clone(),
                    strategy_id: env.strategy_id.clone(),
                    strategy: self.strategy_name(env.strategy_id.as_deref()),
                    symbol: sym.clone(),
                    qty_raw: p.fill.token_amount_raw,
                    cost_lamports: p.fill.sol_lamports,
                    value_lamports: p.fill.sol_lamports,
                    pnl_lamports: Lamports(0),
                    realized_lamports: Lamports(0),
                    pnl_pct: 0.0,
                    entry_price_sol: price,
                    last_price_sol: price,
                    peak_price_sol: price,
                    ratio: 1.0,
                    peak_ratio: 1.0,
                    opened_at_ms: ts_ms,
                    plan_state: None,
                    rev: p.rev,
                    decimals,
                    trade: self.trade_of(&p.mint),
                };
                let key = view.key.clone();
                self.positions.insert(key.clone(), view);
                if let Some(m) = self.marks.get(&p.mint).cloned() {
                    self.revalue(&key, m.price_sol);
                }
                outs.push(Out::Positions(self.positions_vec()));
                if self.account.entries_paused.take().is_some() {
                    outs.push(Out::Account(self.account.clone())); // an entry filled → cash recovered
                }
                i18n = Some(I18nMsg::new("feed.event.bought").text("symbol", sym.clone()).arg("amount_lamports", I18nArg::Lamports(p.fill.sol_lamports)));
                act(Tone::Good, format!("Posisi dibuka {}", fmt_sol(p.fill.sol_lamports)))
            }
            KnownEvent::PositionUpdated(u) => {
                if let Some(p) = self.positions.get_mut(&u.position_key) {
                    if let Some(cb) = u.cost_basis_lamports {
                        p.cost_lamports = cb; // 1.1.2: server cost basis
                    } else if p.qty_raw.0 > 0 && u.qty_raw.0 < p.qty_raw.0 {
                        // v1.1 fallback (Q3): scale by remaining quantity.
                        let f = Decimal::from(u.qty_raw.0 as u64) / Decimal::from(p.qty_raw.0 as u64);
                        p.cost_lamports = Lamports((Decimal::from_i128_with_scale(p.cost_lamports.0, 0) * f).round().to_i128().unwrap_or(0));
                    }
                    p.qty_raw = u.qty_raw;
                    p.peak_price_sol = p.peak_price_sol.max(u.peak_price_sol);
                    p.realized_lamports = u.realized_lamports;
                    if u.plan_state.is_some() {
                        p.plan_state = u.plan_state.clone();
                    }
                    if let Some(avg) = u.avg_entry_price_sol {
                        p.entry_price_sol = avg;
                    }
                    if u.rev.is_some() {
                        p.rev = u.rev;
                    }
                    let last = p.last_price_sol;
                    self.revalue(&u.position_key, last);
                    if let (Some(un), Some(p)) = (u.unrealized_pnl_lamports, self.positions.get_mut(&u.position_key)) {
                        if p.decimals.is_none() {
                            p.pnl_lamports = un; // decimals unknown → trust the server's number
                        }
                    }
                    outs.push(Out::Positions(self.positions_vec()));
                }
                act(Tone::Info, format!("Posisi diperbarui (realized {})", fmt_signed_sol(u.realized_lamports)))
            }
            KnownEvent::PositionClosed(c) => {
                self.positions.remove(&c.position_key);
                outs.push(Out::Positions(self.positions_vec()));
                i18n = Some(I18nMsg::new("feed.event.sold").text("symbol", sym.clone()).arg("pnl", I18nArg::PnlLamports(c.pnl_lamports)).arg("reason", I18nArg::Key(format!("exit_reason.{}", keys::exit_id(c.exit_reason)))));
                act(
                    if c.pnl_lamports.0 >= 0 { Tone::Good } else { Tone::Bad },
                    format!("{}: keluar {} (PnL {}, {}%, hold {}s)", keys::exit_label(c.exit_reason), fmt_sol(c.sol_out_lamports), fmt_signed_sol(c.pnl_lamports), c.pnl_pct.map(|x| x.to_string()).unwrap_or_else(|| "—".into()), c.hold_seconds),
                )
            }
            KnownEvent::ExitTriggered(x) => act(Tone::Info, format!("{} {}% @ {} SOL", keys::exit_label(x.rule), x.sell_portion_pct, x.trigger_price_sol)),
            KnownEvent::PortfolioSnapshot(p) => {
                outs.push(self.set_portfolio(&p));
                return outs; // not shown in the feed (high frequency)
            }
            KnownEvent::Strategy(kind, s) => {
                let id = env.strategy_id.clone().unwrap_or_default();
                let name = self.strategy_name(Some(&id));
                match self.strategies.get_mut(&id) {
                    Some(v) if s.rev > v.rev => {
                        if s.base_rev.is_some_and(|b| b != v.rev) {
                            self.refetch_strategies = true; // we missed an intermediate rev
                        }
                        v.rev = s.rev;
                        if let Some(st) = &s.status {
                            v.status = crate::model::plain_text(st, 16);
                        }
                        outs.push(Out::Strategies(self.strategies_vec()));
                    }
                    Some(_) => {}
                    None => self.refetch_strategies = true,
                }
                let fields = s.changed_fields.map(|f| f.join(", ")).unwrap_or_default();
                let verb = kind.trim_start_matches("strategy.");
                act(Tone::Neutral, format!("Strategi {name}: {verb} → rev {}{}", s.rev, if fields.is_empty() { String::new() } else { format!(" ({fields})") }))
            }
            KnownEvent::PracticeReset(r) => {
                // Contract: drop cached positions + equity, refetch for the new epoch.
                self.positions.clear();
                self.quotes.clear();
                self.account = Account {
                    cash_lamports: Some(r.starting_balance_lamports),
                    equity_lamports: Some(r.starting_balance_lamports),
                    unrealized_pnl_lamports: Some(Lamports(0)),
                    drawdown_pct: Some(0.0),
                    as_of_seq: None,
                    epoch: Some(r.epoch),
                    workspace_rev: None, // refetched with the portfolio
                    notice: self.account.notice.clone(),
                    deleted: self.account.deleted,
                    entries_paused: None, // reset restores cash → entries resume
                };
                self.refetch_portfolio = true;
                outs.push(Out::Positions(vec![]));
                outs.push(Out::Account(self.account.clone()));
                act(Tone::Info, format!("Practice direset → epoch {} · saldo {} · {} posisi diarsipkan", r.epoch, fmt_sol(r.starting_balance_lamports), r.archived.closed_open_positions))
            }
            KnownEvent::AccountDeletionScheduled(d) => {
                let when = d.scheduled_for.0.get(..10).unwrap_or("?").to_owned();
                self.account.notice = Some(format!("Akun dijadwalkan dihapus pada {when} (masa tenggang {} hari). Batalkan dari aplikasi Web/Mobile.", d.grace_days));
                outs.push(Out::Account(self.account.clone()));
                act(Tone::Bad, "Penghapusan akun dijadwalkan".into())
            }
            KnownEvent::AccountDeletionCancelled(_) => {
                self.account.notice = None;
                outs.push(Out::Account(self.account.clone()));
                act(Tone::Info, "Penghapusan akun dibatalkan".into())
            }
            KnownEvent::AccountDeleted(_) => {
                self.account.notice = Some("Akun telah dihapus. Sesi desktop berakhir.".into());
                self.account.deleted = true;
                self.connected = false;
                outs.push(Out::Account(self.account.clone()));
                outs.push(Out::Connection(false));
                act(Tone::Bad, "Akun dihapus — stream dihentikan".into())
            }
            KnownEvent::SystemNotice(n) => {
                let code = keys::error_code(&n.code).to_owned();
                if code == PRACTICE_CASH_INSUFFICIENT && self.account.entries_paused.is_none() {
                    self.account.entries_paused = Some(code.clone());
                    outs.push(Out::Account(self.account.clone()));
                }
                i18n = Some(I18nMsg::new(crate::errmap::i18n_key(&code)).text("code", code.clone()));
                act(Tone::Info, crate::model::plain_text(&n.message, 120))
            }
            KnownEvent::OrderFailed(f) => {
                let code = keys::error_code(&f.reason_code).to_owned();
                if code == UNSUPPORTED_QUOTE_MINT {
                    // Race (WF-20 note 4): the coin reached an order anyway → mark it not tradeable.
                    self.set_trade(&f.mint, not_tradeable(&code, f.quote_mint.clone()), &mut outs);
                }
                let kind = keys::code_kind(&code);
                i18n = Some(I18nMsg::new(&crate::errmap::order_fail_key(&code)).text("code", code.clone()));
                act(if kind == keys::CodeKind::Error { Tone::Bad } else { Tone::Neutral }, format!("Order {} gagal: {code}", if f.side == FillSide::Buy { "buy" } else { "sell" }))
            }
            KnownEvent::OrderSubmitted(o) | KnownEvent::OrderFilled(o) => {
                // 1.1.2: the close order moved the position rev → next close If-Match uses it.
                if let Some(p) = self.positions.values_mut().find(|p| p.position_id.as_deref() == Some(o.position_id.as_str())) {
                    if p.rev.map_or(true, |r| o.position_rev > r) {
                        p.rev = Some(o.position_rev);
                    }
                    outs.push(Out::Positions(self.positions_vec()));
                }
                let status = crate::model::plain_text(&o.order.status, 12);
                act(Tone::Info, format!("Order {} ({status}) · position rev {}", env.kind.trim_start_matches("order."), o.position_rev))
            }
        };
        let mut a = a;
        a.i18n = i18n;
        outs.push(self.push_activity(a));
        outs
    }

    fn revalue(&mut self, key: &str, price: Dec) {
        let Some(p) = self.positions.get_mut(key) else { return };
        p.last_price_sol = price;
        p.peak_price_sol = p.peak_price_sol.max(price);
        // Decimals unknown → keep server-provided value/PnL (no guessed scale).
        let Some(q) = qty_ui(p.qty_raw, p.decimals) else { return };
        let value = lamports_of(q * price.0);
        p.value_lamports = value;
        p.pnl_lamports = Lamports(value.0 - p.cost_lamports.0);
        if p.cost_lamports.0 > 0 {
            // Exact lamport math in Decimal; only the resulting percentage becomes a number.
            p.pnl_pct = (Decimal::from_i128_with_scale(p.pnl_lamports.0, 0) * Decimal::from(100) / Decimal::from_i128_with_scale(p.cost_lamports.0, 0)).round_dp(2).to_f64().unwrap_or(0.0);
        }
        if !p.entry_price_sol.0.is_zero() {
            p.ratio = (price.0 / p.entry_price_sol.0).round_dp(6).to_f64().unwrap_or(1.0);
            p.peak_ratio = (p.peak_price_sol.0 / p.entry_price_sol.0).round_dp(6).to_f64().unwrap_or(1.0);
        }
    }

    /// Apply a Broadcast `mark` (never persisted): chart ticks + live position values.
    pub fn apply_mark(&mut self, m: &MarkMessage) -> Vec<Out> {
        self.observe_server_now(&m.server_now);
        let mint = m.mint.clone();
        self.marks.insert(mint.clone(), Mark { price_sol: m.price_sol, price_usd: m.price_usd, liquidity_usd: m.liquidity_usd });
        let t = TickView { mint: mint.clone(), time: m.ts.ms().unwrap_or(0) / 1000, price_sol: m.price_sol };
        let h = self.ticks.entry(mint.clone()).or_default();
        h.push_back(t.clone());
        while h.len() > MAX_TICKS_PER_MINT {
            h.pop_front();
        }
        let mut updated = Vec::new();
        for s in self.signals.iter_mut().filter(|s| s.mint == mint && s.status == ProposalStatus::Pending) {
            s.price_sol = Some(m.price_sol);
            s.price_usd = Some(m.price_usd);
            s.liquidity_usd = Some(m.liquidity_usd);
            updated.push(Out::SignalUpdate(s.clone()));
        }
        if let Some(c) = self.screened.iter_mut().find(|c| c.mint == mint && c.liquidity_usd.is_none()) {
            c.liquidity_usd = Some(m.liquidity_usd);
            updated.push(Out::Screened(c.clone()));
        }
        let keys: Vec<String> = self.positions.values().filter(|p| p.mint == mint).map(|p| p.key.clone()).collect();
        for k in &keys {
            self.revalue(k, m.price_sol);
        }
        // Drop history for mints nobody tracks any more.
        // Screener rows count too (WF-20: a not-tradeable coin's chart stays viewable); `screened` is itself bounded.
        let tracked: HashSet<String> = self.positions.values().map(|p| p.mint.clone())
            .chain(self.signals.iter().filter(|s| s.status == ProposalStatus::Pending).map(|s| s.mint.clone()))
            .chain(self.screened.iter().map(|c| c.mint.clone()))
            .collect();
        if self.ticks.len() > tracked.len() + 8 {
            self.ticks.retain(|k, _| tracked.contains(k));
            self.marks.retain(|k, _| tracked.contains(k));
        }
        let mut outs = vec![Out::Ticks(vec![t])];
        outs.extend(updated);
        if !keys.is_empty() {
            outs.push(Out::Positions(self.positions_vec()));
        }
        outs
    }

    /// Validate locally before asking the server (pending + not expired by *server* clock).
    pub fn check_pending(&self, id: &str) -> AppResult<&PickView> {
        let now = self.server_now_ms();
        self.signals.iter().find(|s| s.id == id && s.status == ProposalStatus::Pending && s.expires_at_ms > now).ok_or(AppError::SignalNotPending)
    }

    fn est_sol_out(p: &PositionView, pct: u8) -> Lamports {
        let gross = Decimal::from_i128_with_scale(p.value_lamports.0, 0) * Decimal::from(pct) / Decimal::from(100);
        let net = gross * (Decimal::ONE - Decimal::new(125, 4));
        Lamports(net.round().to_i128().unwrap_or(0))
    }

    /// Step 1 of 2 for any sell (local confirmation gate): short-lived one-shot nonce.
    pub fn request_sell(&mut self, key: &str, pct: u8) -> AppResult<SellQuote> {
        if !(1..=100).contains(&pct) {
            return Err(AppError::Invalid("pct must be 1..=100".into()));
        }
        let p = self.positions.get(key).ok_or(AppError::NoPosition)?.clone();
        self.check_tradeable(&p.mint)?;
        let quote = SellQuote { nonce: self.rng.hex(32), position_key: p.key.clone(), mint: p.mint.clone(), symbol: p.symbol.clone(), pct, est_sol_out_lamports: Self::est_sol_out(&p, pct), ttl_ms: SELL_QUOTE_TTL_MS };
        let now = now_ms();
        self.quotes.retain(|_, q| now - q.created_ms < SELL_QUOTE_TTL_MS);
        self.quotes.insert(quote.nonce.clone(), PendingSell { quote: quote.clone(), created_ms: now });
        Ok(quote)
    }

    /// Step 2 of 2: consume the nonce (replay-safe) → (position_key, position_id, pct, position rev).
    pub fn take_quote(&mut self, nonce: &str) -> AppResult<(String, String, u8, Option<u64>)> {
        let p = self.quotes.remove(nonce).ok_or(AppError::QuoteInvalid)?;
        if now_ms() - p.created_ms >= SELL_QUOTE_TTL_MS {
            return Err(AppError::QuoteInvalid);
        }
        let pos = self.positions.get(&p.quote.position_key).ok_or(AppError::NoPosition)?;
        self.check_tradeable(&pos.mint)?; // may have flipped between quote and confirm
        let id = pos.position_id.clone().ok_or_else(|| AppError::Invalid("position has no server id yet".into()))?;
        Ok((p.quote.position_key, id, p.quote.pct, pos.rev))
    }

    /// Close response (1.1.2): adopt the position's new `rev` immediately (next close If-Match).
    pub fn apply_close(&mut self, r: &CloseResponse) -> Option<Out> {
        let p = self.positions.get_mut(&r.position.position_key)?;
        if p.rev.map_or(true, |old| r.position.rev > old) {
            p.rev = Some(r.position.rev);
        }
        Some(Out::Positions(self.positions_vec()))
    }

    pub fn candles(&self, mint: &str) -> Vec<CandleView> {
        let mut out: Vec<CandleView> = Vec::new();
        if let Some(ticks) = self.ticks.get(mint) {
            for t in ticks {
                let b = t.time - t.time.rem_euclid(CANDLE_SEC);
                match out.last_mut() {
                    Some(c) if c.time == b => {
                        c.high = c.high.max(t.price_sol);
                        c.low = c.low.min(t.price_sol);
                        c.close = t.price_sol;
                    }
                    _ => out.push(CandleView { time: b, open: t.price_sol, high: t.price_sol, low: t.price_sol, close: t.price_sol }),
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const WS: &str = "10000000-0000-0000-0000-00000000000a";

    fn env(seq: i64, kind: &str, payload: serde_json::Value) -> EventEnvelope {
        EventEnvelope {
            id: format!("ck1:{seq}:{kind}"),
            seq,
            kind: kind.into(),
            version: 1,
            workspace_id: WS.into(),
            strategy_id: Some("s1".into()),
            ck: Some("ck1".into()),
            mint: Some("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr".into()),
            ts: IsoTs::from_ms(now_ms() as i64),
            actor: Actor::Entry,
            mode: Mode::Practice,
            payload,
            untrusted: Untrusted { symbol: Some("EXM".into()), ..Default::default() },
            server_now: Some(IsoTs::from_ms(now_ms() as i64 + 2_000)),
        }
    }

    fn proposal(e: &mut Engine, seq: i64) {
        let exp = IsoTs::from_ms(now_ms() as i64 + 60_000);
        e.apply_event(&env(seq, "proposal.created", json!({"proposal_id": "p1", "kind": "buy_pick", "rev": 1, "expires_at": exp,
            "first_buy": true, "approval_mode": "ask_every_buy", "amount_lamports": "250000000", "risk_level": "low", "summary": "x",
            "base_rev": null, "weakening": false, "diff": null, "estimate": null})));
    }

    #[test]
    fn reducer_dedupes_ignores_unknown_and_tracks_skew() {
        let mut e = Engine::new(WS);
        proposal(&mut e, 10);
        proposal(&mut e, 10); // same id → duplicate
        assert_eq!(e.signals.len(), 1);
        assert_eq!(e.sync.duplicates, 1);
        assert!((1_900..=2_100).contains(&e.sync.skew_ms), "skew from server_now: {}", e.sync.skew_ms);
        e.apply_event(&env(11, "brand.new_type", json!({})));
        assert_eq!(e.sync.ignored, 1, "unknown types ignored");
        let mut wrong = env(12, "system.notice", json!({"code": "X", "message": "y"}));
        wrong.mode = Mode::Real;
        e.apply_event(&wrong);
        assert_eq!(e.sync.ignored, 2, "real-mode rows never applied");
        assert!(e.check_pending("p1").is_ok());
        e.apply_event(&env(13, "proposal.expired", json!({"proposal_id": "p1", "kind": "buy_pick", "rev": 2, "reason": "strategy_deleted", "at": IsoTs::from_ms(0)})));
        assert!(e.check_pending("p1").is_err());
        assert_eq!(e.signals[0].expired_reason, Some(ProposalExpiredReason::StrategyDeleted));
    }

    #[test]
    fn positions_value_from_marks_and_sell_nonce_is_one_shot() {
        let mut e = Engine::new(WS);
        e.apply_event(&env(20, "position.opened", json!({"position_key": "ck1.0", "mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "first_buy": true, "decimals": 9, "token_program": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "position_id": "pos_1", "rev": 1,
            "fill": {"sol_lamports": "250000000", "token_amount_raw": "1000000000000", "exec_price_sol": "0.00025", "slippage_bps": 2.04,
                     "swap_fee_lamports": "3125000", "network_fee_lamports": "25000", "latency_ms": 450}})));
        let now = IsoTs::from_ms(now_ms() as i64);
        e.apply_mark(&MarkMessage { mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr".into(), price_usd: Dec::parse("0.075").unwrap(), price_sol: Dec::parse("0.0005").unwrap(),
            liquidity_usd: 1000.0, slot: 1, ts: now.clone(), position_ids: vec![], server_now: now });
        let p = e.positions.get("ck1.0").unwrap();
        // 7GCih…W2hr = SPL Token, decimals 9 (mainnet): 1000 tokens × 0.0005 SOL = 0.5 SOL; cost 0.25 → +0.25 SOL, +100 %
        assert_eq!(p.value_lamports, Lamports(500_000_000));
        assert_eq!(p.pnl_lamports, Lamports(250_000_000));
        assert_eq!(p.pnl_pct, 100.0);
        assert_eq!(p.ratio, 2.0);
        assert!(e.take_quote("bogus").is_err());
        let q = e.request_sell("ck1.0", 50).unwrap();
        assert_eq!(e.take_quote(&q.nonce).unwrap(), ("ck1.0".to_string(), "pos_1".to_string(), 50, Some(1)), "close by position id with If-Match = position rev");
        assert!(e.take_quote(&q.nonce).is_err(), "nonce is one-shot");
    }

    #[test]
    fn practice_reset_drops_positions_and_account_events_are_graceful() {
        let mut e = Engine::new(WS);
        e.apply_event(&env(20, "position.opened", json!({"position_key": "ck1.0", "mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "first_buy": true, "decimals": 9, "token_program": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "position_id": "pos_1", "rev": 1,
            "fill": {"sol_lamports": "250000000", "token_amount_raw": "1000000000000", "exec_price_sol": "0.00025", "slippage_bps": 2.04,
                     "swap_fee_lamports": "3125000", "network_fee_lamports": "25000", "latency_ms": 450}})));
        assert_eq!(e.positions.len(), 1);
        let mut r = env(21, "practice.reset", json!({"epoch": 2, "previous_epoch": 1, "starting_balance_lamports": "30000000000",
            "archived": {"positions": 1, "closed_open_positions": 1, "fills": 2, "snapshots": 3, "expired_proposals": 0},
            "next_allowed_at": "2026-10-30T08:42:00.000Z", "at": "2026-10-29T08:42:00.000Z"}));
        r.strategy_id = None;
        e.apply_event(&r);
        assert!(e.positions.is_empty());
        assert_eq!(e.account.cash_lamports, Some(Lamports(30_000_000_000)));
        assert_eq!(e.account.epoch, Some(2));
        assert!(e.refetch_portfolio);
        e.apply_event(&env(22, "account.deletion_scheduled", json!({"scheduled_for": "2026-11-05T08:42:00.000Z", "grace_days": 7, "at": "2026-10-29T08:42:00.000Z"})));
        assert!(e.account.notice.as_deref().unwrap().contains("2026-11-05"));
        e.apply_event(&env(23, "account.deletion_cancelled", json!({"at": "2026-10-29T08:43:00.000Z"})));
        assert!(e.account.notice.is_none());
        e.apply_event(&env(24, "account.deleted", json!({"at": "2026-11-05T08:42:00.000Z"})));
        assert!(e.account.deleted && !e.connected);
    }

    #[test]
    fn strategy_events_track_rev_and_legacy_names_are_normalised() {
        let mut e = Engine::new(WS);
        e.set_strategies(&[StrategySummary { id: "s1".into(), name: "Yumi · AMM".into(), rev: 7, status: Some("active".into()), mode: Some(Mode::Practice), settings: json!({}) }]);
        e.apply_event(&env(30, "strategy.paused", json!({"rev": 8, "base_rev": 7, "status": "paused", "changed_fields": ["status"]})));
        assert_eq!(e.strategy_rev("s1"), Some(8));
        assert_eq!(e.strategies_vec()[0].status, "paused");
        assert!(!e.refetch_strategies);
        e.apply_event(&env(31, "strategy.updated", json!({"rev": 10, "base_rev": 9})));
        assert!(e.refetch_strategies, "missed rev 9 → refetch");
        // v1.0-named payload (sell_pct, trailing_stop) still decodes via keys.rs
        let before = e.sync.ignored;
        e.apply_event(&env(32, "exit.triggered", json!({"position_key": "ck1.0", "rule": "trailing_stop", "rule_index": 1, "sell_pct": 100, "trigger_price_sol": "0.0002", "detail": "x"})));
        assert_eq!(e.sync.ignored, before);
        assert!(e.activity[0].message.starts_with("Trail dari puncak"));
    }

    #[test]
    fn popup_cannot_approve_in_real() {
        assert!(check_approve_origin(POPUP_LABEL, Mode::Real).is_err());
        assert!(check_approve_origin(POPUP_LABEL, Mode::Practice).is_ok());
        assert!(check_approve_origin("main", Mode::Real).is_ok());
    }

    #[test]
    fn not_tradeable_blocks_approve_and_sell_locally_wf20() {
        const M: &str = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";
        let mut e = Engine::new(WS);
        proposal(&mut e, 10);
        e.apply_event(&env(11, "position.opened", json!({"position_key": "ck1.0", "position_id": "pos_1", "rev": 1, "practice_epoch": 1, "mint": M,
            "first_buy": true, "decimals": 9, "token_program": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            "fill": {"sol_lamports": "250000000", "token_amount_raw": "1000000000000", "exec_price_sol": "0.00025", "slippage_bps": 2.04,
                     "swap_fee_lamports": "3125000", "network_fee_lamports": "25000", "latency_ms": 450}})));
        assert!(e.check_tradeable(M).is_ok());
        let q = e.request_sell("ck1.0", 100).unwrap();
        // pool migrates to USDC: 1.1.2 screener.scored top-level tradeable:false
        e.apply_event(&env(12, "screener.scored", json!({"mint": M, "passed": false, "summary": "x", "rejected_by": "quote_mint", "failed": ["quote_mint"],
            "tradeable": false, "skip_reason": "UNSUPPORTED_QUOTE_MINT", "quote_mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "result": {"passed": false, "score": 71, "score_threshold": 70, "max_score": 100, "checks": []}})));
        let err = e.check_tradeable(M).unwrap_err().to_string();
        assert!(err.starts_with("UNSUPPORTED_QUOTE_MINT:"), "{err}");
        assert!(e.request_sell("ck1.0", 50).is_err(), "new sell quote refused");
        assert!(e.take_quote(&q.nonce).is_err(), "quote taken before the flip is refused at confirm");
        let row = e.screened.iter().find(|c| c.mint == M).expect("screener row stays visible");
        assert_eq!((row.status.as_str(), row.trade.tradeable, row.trade.quote_symbol), ("not_tradeable", false, Some("USDC")));
        assert!(e.positions["ck1.0"].trade.reason_code.as_deref() == Some("UNSUPPORTED_QUOTE_MINT"));
        assert!(e.signals.iter().all(|p| !p.trade.tradeable), "pending pick is marked too");
    }

    #[test]
    fn practice_cash_notice_pauses_entries_and_differs_from_order_balance_failure() {
        let mut e = Engine::new(WS);
        // order.failed INSUFFICIENT_PRACTICE_BALANCE: kind error, one order → red line, no workspace state
        e.apply_event(&env(30, "order.failed", json!({"order_id": "o1", "proposal_id": null, "mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "side": "buy",
            "amount_lamports": "250000000", "reason_code": "INSUFFICIENT_PRACTICE_BALANCE", "detail": {}, "mode": "practice", "server_now": "2026-10-29T10:00:00Z"})));
        let a = e.activity.front().unwrap().clone();
        assert_eq!(a.tone, Tone::Bad);
        assert_eq!(a.i18n.as_ref().unwrap().key, "order.fail_reason.insufficient_practice_balance");
        assert!(e.account.entries_paused.is_none(), "one failed order does not pause entries");
        // system.notice PRACTICE_CASH_INSUFFICIENT: kind notice → neutral line + entries paused (workspace)
        e.apply_event(&env(31, "system.notice", json!({"code": "PRACTICE_CASH_INSUFFICIENT", "message": "cash low"})));
        let n = e.activity.front().unwrap().clone();
        assert_ne!(n.tone, Tone::Bad);
        assert_eq!(n.i18n.as_ref().unwrap().key, "error.code.practice_cash_insufficient");
        assert_eq!(e.account.entries_paused.as_deref(), Some("PRACTICE_CASH_INSUFFICIENT"));
        assert_eq!(keys::code_kind("PRACTICE_CASH_INSUFFICIENT"), keys::CodeKind::Notice);
        assert_eq!(keys::code_kind("INSUFFICIENT_PRACTICE_BALANCE"), keys::CodeKind::Error);
        // an entry filling again (cash recovered) clears it; so does practice.reset
        e.apply_event(&env(32, "position.opened", json!({"position_key": "ck1.0", "mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "first_buy": true, "decimals": 9,
            "token_program": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "position_id": "pos_1", "rev": 1,
            "fill": {"sol_lamports": "250000000", "token_amount_raw": "1000000000000", "exec_price_sol": "0.00025", "slippage_bps": 2.04,
                     "swap_fee_lamports": "3125000", "network_fee_lamports": "25000", "latency_ms": 450}})));
        assert!(e.account.entries_paused.is_none());
        e.apply_event(&env(33, "system.notice", json!({"code": "PRACTICE_CASH_INSUFFICIENT", "message": "cash low"})));
        assert!(e.account.entries_paused.is_some());
        let mut r = env(34, "practice.reset", json!({"epoch": 2, "previous_epoch": 1, "starting_balance_lamports": "30000000000",
            "archived": {"positions": 1, "closed_open_positions": 1, "fills": 2, "snapshots": 3, "expired_proposals": 0},
            "next_allowed_at": "2026-10-30T08:42:00.000Z", "at": "2026-10-29T08:42:00.000Z"}));
        r.strategy_id = None;
        e.apply_event(&r);
        assert!(e.account.entries_paused.is_none());
    }

    #[test]
    fn plain_pnl_text_never_reads_zero_for_nonzero_and_uses_true_minus() {
        assert_eq!(fmt_signed_sol(Lamports(0)), "0.00 SOL");
        assert_eq!(fmt_signed_sol(Lamports(-3)), "▼ \u{2212}<0.0001 SOL");
        assert_eq!(fmt_signed_sol(Lamports(2_500_000)), "▲ +0.0025 SOL");
        assert_eq!(fmt_signed_sol(Lamports(-2_500_000)), "▼ \u{2212}0.0025 SOL");
        assert!(!fmt_sol(Lamports(-1_000_000)).contains('-'));
    }
}
