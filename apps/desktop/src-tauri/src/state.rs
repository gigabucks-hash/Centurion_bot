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
/// Token decimals are not on the v1 wire (schema question Q1); pump.fun-style 6 assumed.
pub const ASSUMED_TOKEN_DECIMALS: u32 = 6;

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

fn qty_ui(q: RawQty) -> Decimal {
    Decimal::from_i128_with_scale(q.0 as i128, ASSUMED_TOKEN_DECIMALS)
}
fn lamports_of(sol: Decimal) -> Lamports {
    Lamports::from_sol(sol)
}
fn fmt_sol(l: Lamports) -> String {
    let s = l.sol().round_dp(4);
    format!("{s} SOL")
}
fn fmt_signed_sol(l: Lamports) -> String {
    let s = l.sol().round_dp(4);
    if s > Decimal::ZERO {
        format!("▲ +{s} SOL")
    } else if s < Decimal::ZERO {
        format!("▼ −{} SOL", s.abs())
    } else {
        "±0 SOL".into()
    }
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
        Out::Account(self.account.clone())
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            mode: self.mode,
            connected: self.connected,
            source: "mock",
            signals: self.signals.iter().cloned().collect(),
            positions: self.positions_vec(),
            activity: self.activity.iter().take(300).cloned().collect(),
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
        self.push_activity(ActivityView { id: format!("local:{ts}:{}", self.local_seq), seq: None, ts_ms: ts, actor, kind: "local.note".into(), tone, mint: None, symbol: None, message: msg.into() })
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
        };
        let ck = env.ck.clone().unwrap_or_default();
        let a = match known {
            KnownEvent::CoinDetected(c) => act(Tone::Neutral, format!("Koin baru ({})", if c.venue == Venue::Curve { "curve" } else { "amm" })),
            KnownEvent::ScreenerScored(s) => {
                let info = self.picks.entry(ck.clone()).or_default();
                info.score = Some(s.result.score);
                info.threshold = Some(s.result.score_threshold);
                info.reasons = s.result.checks.iter().filter(|c| c.passed).map(|c| crate::model::plain_text(&c.reason, 40)).collect();
                act(if s.passed { Tone::Good } else { Tone::Bad }, format!("Screener: fit {}/{}", s.result.score, s.result.score_threshold))
            }
            KnownEvent::GuardResult(g) => {
                self.picks.entry(ck.clone()).or_default().guard = Some(g.verdict);
                match g.verdict {
                    GuardVerdict::Fail => act(Tone::Guard, format!("Blocked: {}", g.reasons.join(", "))),
                    v => act(Tone::Good, format!("Guard {v:?}")),
                }
            }
            KnownEvent::PickCreated(p) => {
                let info = self.picks.entry(ck.clone()).or_default();
                info.summary = crate::model::plain_text(&p.summary, 80);
                info.score = Some(p.score.score);
                info.threshold = Some(p.score.score_threshold);
                info.guard = Some(p.guard_verdict);
                act(Tone::Info, "Pick dibuat".into())
            }
            KnownEvent::EntryArmed(e) => act(Tone::Neutral, format!("Entry armed ({})", crate::model::plain_text(&e.condition, 32))),
            KnownEvent::EntryExpired(e) => act(Tone::Neutral, format!("Entry expired: {}", crate::model::plain_text(&e.reason, 32))),
            KnownEvent::ProposalCreated(p) => {
                let info = self.picks.get(&ck).cloned().unwrap_or_default();
                let mark = env.mint.as_ref().and_then(|m| self.marks.get(m)).cloned();
                let view = PickView {
                    id: p.proposal_id.clone(),
                    version: p.version,
                    ck: ck.clone(),
                    mint: env.mint.clone().unwrap_or_default(),
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
                    price_sol: mark.as_ref().map(|m| m.price_sol),
                    price_usd: mark.as_ref().map(|m| m.price_usd),
                    liquidity_usd: mark.as_ref().map(|m| m.liquidity_usd),
                    created_at: env.ts.clone(),
                    expires_at: p.expires_at.clone(),
                    created_at_ms: ts_ms,
                    expires_at_ms: p.expires_at.ms().unwrap_or(ts_ms),
                    status: ProposalStatus::Pending,
                    expired_reason: None,
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
                outs.push(Out::SignalNew(view));
                act(Tone::Info, "Pick menunggu approval".into())
            }
            KnownEvent::ProposalApproved(d) | KnownEvent::ProposalRejected(d) => {
                let approved = env.kind == "proposal.approved";
                if let Some(s) = self.signals.iter_mut().find(|s| s.id == d.proposal_id) {
                    s.status = if approved { ProposalStatus::Approved } else { ProposalStatus::Rejected };
                    s.version = d.version;
                    outs.push(Out::SignalUpdate(s.clone()));
                }
                let via = serde_json::to_value(d.decided_via).ok().and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default();
                act(if approved { Tone::Good } else { Tone::Neutral }, format!("{} (via {via})", if approved { "Approved" } else { "Skipped" }))
            }
            KnownEvent::ProposalExpired(x) => {
                if let Some(s) = self.signals.iter_mut().find(|s| s.id == x.proposal_id) {
                    s.status = ProposalStatus::Expired;
                    s.expired_reason = Some(x.reason);
                    s.version = x.version;
                    outs.push(Out::SignalUpdate(s.clone()));
                }
                let why = serde_json::to_value(x.reason).ok().and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default();
                act(Tone::Neutral, format!("Expired: {why}"))
            }
            KnownEvent::FillSimulated(f) => {
                let side = if f.side == FillSide::Buy { "Paper buy" } else { "Paper sell" };
                act(Tone::Info, format!("{side} {} @ {} SOL (fee {} bps, slip {} bps)", fmt_sol(f.sol_lamports), f.exec_price_sol, f.fee_bps, f.slippage_bps))
            }
            KnownEvent::PositionOpened(p) => {
                let price = p.fill.exec_price_sol;
                let view = PositionView {
                    key: p.position_key.clone(),
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
                    plan_state: serde_json::Value::Null,
                    rev: None,
                };
                let key = view.key.clone();
                self.positions.insert(key.clone(), view);
                if let Some(m) = self.marks.get(&p.mint).cloned() {
                    self.revalue(&key, m.price_sol);
                }
                outs.push(Out::Positions(self.positions_vec()));
                act(Tone::Good, format!("Posisi dibuka {}", fmt_sol(p.fill.sol_lamports)))
            }
            KnownEvent::PositionUpdated(u) => {
                if let Some(p) = self.positions.get_mut(&u.position_key) {
                    // Cost basis is not on the wire (Q3): scale by remaining quantity.
                    if p.qty_raw.0 > 0 && u.qty_raw.0 < p.qty_raw.0 {
                        let f = Decimal::from(u.qty_raw.0 as u64) / Decimal::from(p.qty_raw.0 as u64);
                        p.cost_lamports = Lamports((Decimal::from_i128_with_scale(p.cost_lamports.0, 0) * f).round().to_i128().unwrap_or(0));
                    }
                    p.qty_raw = u.qty_raw;
                    p.peak_price_sol = p.peak_price_sol.max(u.peak_price_sol);
                    p.realized_lamports = u.realized_lamports;
                    let mut ps = u.plan_state.clone();
                    keys::normalize(&mut ps);
                    p.plan_state = ps;
                    p.rev = u.rev;
                    let last = p.last_price_sol;
                    self.revalue(&u.position_key, last);
                    outs.push(Out::Positions(self.positions_vec()));
                }
                act(Tone::Info, format!("Posisi diperbarui (realized {})", fmt_signed_sol(u.realized_lamports)))
            }
            KnownEvent::PositionClosed(c) => {
                self.positions.remove(&c.position_key);
                outs.push(Out::Positions(self.positions_vec()));
                act(
                    if c.pnl_lamports.0 >= 0 { Tone::Good } else { Tone::Bad },
                    format!("{}: keluar {} (PnL {}, {}%, hold {}s)", keys::exit_label(c.exit_reason), fmt_sol(c.sol_out_lamports), fmt_signed_sol(c.pnl_lamports), c.pnl_pct, c.hold_seconds),
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
            KnownEvent::SystemNotice(n) => act(Tone::Info, crate::model::plain_text(&n.message, 120)),
        };
        outs.push(self.push_activity(a));
        outs
    }

    fn revalue(&mut self, key: &str, price: Dec) {
        let Some(p) = self.positions.get_mut(key) else { return };
        p.last_price_sol = price;
        p.peak_price_sol = p.peak_price_sol.max(price);
        let value = lamports_of(qty_ui(p.qty_raw) * price.0);
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
        let keys: Vec<String> = self.positions.values().filter(|p| p.mint == mint).map(|p| p.key.clone()).collect();
        for k in &keys {
            self.revalue(k, m.price_sol);
        }
        // Drop history for mints nobody tracks any more.
        let tracked: HashSet<String> = self.positions.values().map(|p| p.mint.clone()).chain(self.signals.iter().filter(|s| s.status == ProposalStatus::Pending).map(|s| s.mint.clone())).collect();
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
        let quote = SellQuote { nonce: self.rng.hex(32), position_key: p.key.clone(), mint: p.mint.clone(), symbol: p.symbol.clone(), pct, est_sol_out_lamports: Self::est_sol_out(&p, pct), ttl_ms: SELL_QUOTE_TTL_MS };
        let now = now_ms();
        self.quotes.retain(|_, q| now - q.created_ms < SELL_QUOTE_TTL_MS);
        self.quotes.insert(quote.nonce.clone(), PendingSell { quote: quote.clone(), created_ms: now });
        Ok(quote)
    }

    /// Step 2 of 2: consume the nonce (replay-safe) → (position_key, pct, position rev) for the server call.
    pub fn take_quote(&mut self, nonce: &str) -> AppResult<(String, u8, Option<u64>)> {
        let p = self.quotes.remove(nonce).ok_or(AppError::QuoteInvalid)?;
        if now_ms() - p.created_ms >= SELL_QUOTE_TTL_MS {
            return Err(AppError::QuoteInvalid);
        }
        let rev = self.positions.get(&p.quote.position_key).ok_or(AppError::NoPosition)?.rev;
        Ok((p.quote.position_key, p.quote.pct, rev))
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
        e.apply_event(&env(seq, "proposal.created", json!({"proposal_id": "p1", "kind": "buy_pick", "version": 1, "expires_at": exp,
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
        e.apply_event(&env(13, "proposal.expired", json!({"proposal_id": "p1", "kind": "buy_pick", "version": 2, "reason": "strategy_deleted", "at": IsoTs::from_ms(0)})));
        assert!(e.check_pending("p1").is_err());
        assert_eq!(e.signals[0].expired_reason, Some(ProposalExpiredReason::StrategyDeleted));
    }

    #[test]
    fn positions_value_from_marks_and_sell_nonce_is_one_shot() {
        let mut e = Engine::new(WS);
        e.apply_event(&env(20, "position.opened", json!({"position_key": "ck1.0", "mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "first_buy": true,
            "fill": {"sol_lamports": "250000000", "token_amount_raw": "1000000000", "exec_price_sol": "0.00025", "slippage_bps": 2.04,
                     "swap_fee_lamports": "3125000", "network_fee_lamports": "25000", "latency_ms": 450}})));
        let now = IsoTs::from_ms(now_ms() as i64);
        e.apply_mark(&MarkMessage { mint: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr".into(), price_usd: Dec::parse("0.075").unwrap(), price_sol: Dec::parse("0.0005").unwrap(),
            liquidity_usd: 1000.0, slot: 1, ts: now.clone(), position_ids: vec![], server_now: now });
        let p = e.positions.get("ck1.0").unwrap();
        // 1000 tokens × 0.0005 SOL = 0.5 SOL; cost 0.25 → +0.25 SOL, +100 %
        assert_eq!(p.value_lamports, Lamports(500_000_000));
        assert_eq!(p.pnl_lamports, Lamports(250_000_000));
        assert_eq!(p.pnl_pct, 100.0);
        assert_eq!(p.ratio, 2.0);
        assert!(e.take_quote("bogus").is_err());
        let q = e.request_sell("ck1.0", 50).unwrap();
        assert_eq!(e.take_quote(&q.nonce).unwrap(), ("ck1.0".to_string(), 50, None));
        assert!(e.take_quote(&q.nonce).is_err(), "nonce is one-shot");
    }

    #[test]
    fn practice_reset_drops_positions_and_account_events_are_graceful() {
        let mut e = Engine::new(WS);
        e.apply_event(&env(20, "position.opened", json!({"position_key": "ck1.0", "mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", "first_buy": true,
            "fill": {"sol_lamports": "250000000", "token_amount_raw": "1000000000", "exec_price_sol": "0.00025", "slippage_bps": 2.04,
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
}
