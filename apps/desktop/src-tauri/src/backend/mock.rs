//! In-process **mock Sentra server** speaking wire contract v1.1 (+ the optional 1.1.2 fields:
//! decimals/token_program/quote_mint, position rev, practice_epoch, close with `fraction_bps`,
//! flat error objects, `order.failed`). No network, no wallet, no chain.
//!
//! Not-tradeable coins (WF-20) — `SENTRA_MOCK_NOT_TRADEABLE`:
//! - `screener` (default): ~15 % of new coins are quoted in USDC/USDT → screener row only
//!   (`tradeable:false`, `skip_reason: UNSUPPORTED_QUOTE_MINT`), never a proposal.
//! - `race`: additionally ~40 % of proposals and open positions get their pool "migrated" to a
//!   non-SOL quote ~8 s later (re-score with `tradeable:false`) → pending card and position turn
//!   not-tradeable; approve/close then answer 422 + `order.failed` server-side as well.
//! - `off`: every coin is SOL-quoted.
//!
//! It owns "server truth" (paper book in lamports, proposals, positions, strategies with `rev`)
//! and appends v1.0 envelopes to an event log with a **monotonic, non-gapless `seq`** (random holes
//! emulate rolled-back transactions). The live feed behaves like SSE but is deliberately lossy
//! (`DROP_LIVE_PCT`) so the client's gap → catch-up resync path is exercised constantly.
//! Its clock runs `SKEW_MS` ahead of the local clock so countdowns must use `server_now`.

use super::{ApiFailure, ApiResult, Inbound, Transport};
use crate::model::*;
use crate::util::{fake_mint, now_ms, Rng};
use rust_decimal::prelude::{FromPrimitive, ToPrimitive};
use rust_decimal::Decimal;
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

const WORKSPACE_ID: &str = "10000000-0000-0000-0000-00000000000a";
const USER_ID: &str = "50000000-0000-0000-0000-0000000000d1";
const SYMBOLS: &[&str] = &["ORCA", "MOTH", "KITE", "BRRR", "ZAPP", "FERN", "LUMA", "DUSK", "GLOW", "RIFT", "NOVA", "PIKO"];
const BLOCK_REASONS: &[&str] = &["bundled buys", "dev holds too much", "few real holders", "layered launch"];
const CHECKS: &[(&str, &str)] = &[
    ("liquidity_min", "liquidity ok"),
    ("volume_1h", "volume ok"),
    ("top10_share", "top10 < 30%"),
    ("lp_burned", "lp burned"),
    ("buyers_1h", "buyers 1h ok"),
    ("age_window", "age ok"),
];
/// Demo TTL (UI shows the "MOCK TTL" badge). Production TTL comes from server `expires_at`.
pub const PROPOSAL_TTL_MS: i64 = 90_000;
const LOG_CAP: usize = 20_000;
const TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/// Non-SOL quote mints used for not-tradeable mock coins (USDC, USDT).
const NON_SOL_QUOTES: &[&str] = &["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"];
/// Delay before a `race` pool migration.
const FLIP_AFTER_MS: i64 = 8_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotTradeableMode {
    Off,
    Screener,
    Race,
}
/// Server-side parse of a decision body (what the Phase-2 API does before `decide_approval`):
/// an unknown `reject_reason`, or one sent with `decision=approve`, is `422 VALIDATION_FAILED`.
#[allow(dead_code)] // the typed client can't produce bad values; exercised by tests
pub fn parse_decision_body(body: &serde_json::Value) -> Result<ApprovalDecisionRequest, ApiFailure> {
    let fail = |m: &str| ApiFailure::from_body(422, &json!({"error": {"code": "VALIDATION_FAILED", "message": m, "field": "reject_reason", "server_now": IsoTs::from_ms(0)}}));
    if let Some(r) = body.get("reject_reason").filter(|v| !v.is_null()) {
        if serde_json::from_value::<ApprovalRejectReason>(r.clone()).is_err() {
            return Err(fail("unknown reject_reason"));
        }
        if body.get("decision") != Some(&json!("reject")) {
            return Err(fail("reject_reason is only allowed with decision=reject"));
        }
    }
    serde_json::from_value(body.clone()).map_err(|e| fail(&e.to_string()))
}

impl NotTradeableMode {
    pub fn from_env() -> Self {
        match std::env::var("SENTRA_MOCK_NOT_TRADEABLE").as_deref() {
            Ok("off") | Ok("0") => Self::Off,
            Ok("race") => Self::Race,
            _ => Self::Screener,
        }
    }
    fn new_coin_rate(self) -> f64 {
        if self == Self::Off { 0.0 } else { 0.15 }
    }
}
const BUY_LAMPORTS: i128 = 250_000_000;
const START_CASH: i128 = 30_000_000_000; // 30 SOL practice bankroll (contract: practice.reset restores 30 SOL)
const SCORE_THRESHOLD: i64 = 70;
const RESET_COOLDOWN_MS: i64 = 24 * 3_600_000;
/// Mock "other device" edits a strategy this often (exercises `strategy.*` + rev refresh).
const REMOTE_EDIT_EVERY_MS: i64 = 75_000;
const FEE_BPS: i64 = 125;
const NETWORK_FEE: i128 = 25_000;
const SOL_USD: i64 = 150;

/// Shallow-merge `extra`'s keys into the object `p`.
fn merge(p: &mut serde_json::Value, extra: serde_json::Value) {
    if let (Some(o), serde_json::Value::Object(e)) = (p.as_object_mut(), extra) {
        o.extend(e);
    }
}
fn with_mcap(mut p: serde_json::Value, m: serde_json::Value) -> serde_json::Value {
    merge(&mut p, m);
    p
}
const DROP_LIVE_PCT: f64 = 0.04;
const HOLE_PCT: f64 = 0.08;
const CLOCK_EVERY_MS: i64 = 5_000; // contract: 15 s; faster in the mock to show resync

fn dec(x: f64) -> Decimal {
    Decimal::from_f64(x).unwrap_or_default().round_dp(12)
}
fn lam_of_sol(sol: Decimal) -> i128 {
    (sol * Decimal::from(LAMPORTS_PER_SOL as i64)).round().to_i128().unwrap_or(0)
}
fn sol_of_lam(l: i128) -> Decimal {
    Decimal::from_i128_with_scale(l, 9)
}
fn ui_qty(raw: u128, decimals: u8) -> Decimal {
    Decimal::from_i128_with_scale(raw as i128, decimals as u32)
}

struct Strat {
    id: String,
    name: String,
    rev: u64,
    status: String,
    settings: serde_json::Value,
    /// (rev, fields changed in that rev, via, at_ms) — reported as `changed_fields`/`changed_by` on 409.
    history: Vec<(u64, Vec<String>, String, i64)>,
}
impl Strat {
    fn new(id: &str, name: &str, full: bool) -> Self {
        Strat { id: id.into(), name: name.into(), rev: 1, status: "active".into(), settings: default_settings(full), history: vec![] }
    }
    fn summary(&self) -> StrategySummary {
        StrategySummary { id: self.id.clone(), name: self.name.clone(), rev: self.rev, status: Some(self.status.clone()), mode: Some(Mode::Practice), settings: self.settings.clone() }
    }
}
struct Coin {
    price_sol: Decimal,
    liquidity_usd: Decimal,
    untrusted: Untrusted,
    ck: String,
    strategy_id: String,
    decimals: u8,
    token_program: &'static str,
    /// `None`/wSOL = SOL-quoted (tradeable); USDC/USDT = not tradeable in Practice.
    quote_mint: Option<String>,
    /// `race`: migrate the pool to a non-SOL quote at this server time.
    flip_at_ms: Option<i64>,
}
impl Coin {
    fn tradeable(&self) -> bool {
        is_sol_quote(self.quote_mint.as_deref())
    }
}
struct Prop {
    id: String,
    ck: String,
    mint: String,
    strategy_id: String,
    version: u32,
    status: ProposalStatus,
    expires_ms: i64,
    token: Option<String>,
}
struct Pos {
    /// Server position id (1.1.2 close path `/positions/{id}/close`).
    id: String,
    key: String,
    ck: String,
    mint: String,
    strategy_id: String,
    qty_raw: u128,
    cost: i128,
    peak: Decimal,
    opened_ms: i64,
    untrusted: Untrusted,
    realized: i128,
    rev: u64,
    decimals: u8,
}

const NT_WATCH_MAX: usize = 8;

struct Server {
    seq: i64,
    log: VecDeque<EventEnvelope>,
    live: Option<mpsc::Sender<Inbound>>,
    rng: Rng,
    skew_ms: i64,
    cash: i128,
    peak_equity: i128,
    realized: i128,
    strategies: Vec<Strat>,
    coins: HashMap<String, Coin>,
    proposals: HashMap<String, Prop>,
    positions: HashMap<String, Pos>,
    pos_n: HashMap<String, u32>,
    decided: HashMap<String, (Decision, ApprovalDecisionResponse)>,
    /// Idempotency-Key → (request fingerprint, stored response). Same key + same body replays
    /// (`replayed: true`); same key + different body = 422 `IDEMPOTENCY_KEY_REUSED` (1.1.2).
    idem: HashMap<String, (String, serde_json::Value)>,
    /// WF-20: not-tradeable screener coins keep getting marks (chart & metrics stay viewable, read-only). Bounded.
    nt_watch: std::collections::VecDeque<String>,
    /// PRACTICE_CASH_INSUFFICIENT notice already sent (cleared by the next filled entry / reset).
    entries_paused: bool,
    slot: i64,
    next_candidate_ms: i64,
    next_clock_ms: i64,
    drop_live: f64,
    uid: u64,
    ws_rev: u64,
    epoch: i64,
    last_reset_ms: Option<i64>,
    /// Fault injection (`SENTRA_MOCK_FORCE_CONFLICT=1`): another device edits the strategy right
    /// before each desktop write lands, so the 409 path can be exercised by hand.
    force_conflict: bool,
    next_remote_edit_ms: i64,
    not_tradeable: NotTradeableMode,
    /// Int64 job ids (`job_id` is an int64 string on the wire).
    seq_job: i64,
}

impl Server {
    /// Idempotency (1.1.2): `Ok(Some(resp))` = replay of an identical request, `Ok(None)` = new key,
    /// `Err(422 IDEMPOTENCY_KEY_REUSED)` = same key with a different body.
    fn idem_check(&self, key: &str, fingerprint: &str) -> ApiResult<Option<serde_json::Value>> {
        match self.idem.get(key) {
            Some((fp, resp)) if fp == fingerprint => Ok(Some(resp.clone())),
            Some(_) => self.err(422, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key reused with a different request body", json!({"idempotency_key": key})),
            None => Ok(None),
        }
    }
    fn now(&self) -> i64 {
        now_ms() as i64 + self.skew_ms
    }
    fn uuid(&mut self, prefix: char) -> String {
        self.uid += 1;
        let r = self.rng.next_u64();
        format!("{prefix}{:07x}-{:04x}-4{:03x}-8{:03x}-{:012x}", (r >> 36) & 0xfff_ffff, (r >> 20) & 0xffff, self.uid & 0xfff, (r >> 8) & 0xfff, r & 0xffff_ffff_ffff)
    }

    #[allow(clippy::too_many_arguments)]
    fn emit(&mut self, kind: &str, actor: Actor, subject: &str, strategy_id: Option<&str>, ck: Option<&str>, mint: Option<&str>, payload: serde_json::Value, untrusted: Untrusted) -> EventEnvelope {
        // Monotonic but not gapless: occasionally skip numbers (rolled-back tx holes).
        self.seq += if self.rng.f64() < HOLE_PCT { 2 } else { 1 };
        let now = self.now();
        let env = EventEnvelope {
            id: format!("{subject}:{now}:{kind}"),
            seq: self.seq,
            kind: kind.into(),
            version: EVENT_SCHEMA_VERSION,
            workspace_id: WORKSPACE_ID.into(),
            strategy_id: strategy_id.map(str::to_owned),
            ck: ck.map(str::to_owned),
            mint: mint.map(str::to_owned),
            ts: IsoTs::from_ms(now),
            actor,
            mode: Mode::Practice,
            payload,
            untrusted,
            server_now: None,
        };
        self.log.push_back(env.clone());
        while self.log.len() > LOG_CAP {
            self.log.pop_front();
        }
        let drop = self.rng.f64() < self.drop_live;
        if let (Some(tx), false) = (&self.live, drop) {
            let mut live = env.clone();
            live.server_now = Some(IsoTs::from_ms(self.now()));
            let _ = tx.try_send(Inbound::Event(Box::new(live)));
        }
        env
    }

    fn portfolio(&mut self) {
        let snap = self.snapshot();
        self.emit("portfolio.snapshot", Actor::System, WORKSPACE_ID, None, None, None, serde_json::to_value(snap).unwrap(), Untrusted::default());
    }

    fn snapshot(&mut self) -> PortfolioSnapshot {
        let cost: i128 = self.positions.values().map(|p| p.cost).sum();
        let value: i128 = self.positions.values().map(|p| self.value_of(p)).sum();
        let equity = self.cash + value;
        self.peak_equity = self.peak_equity.max(equity);
        let dd_bps = if self.peak_equity > 0 { ((self.peak_equity - equity) * 10_000 / self.peak_equity) as i64 } else { 0 };
        PortfolioSnapshot {
            cash_lamports: Lamports(self.cash),
            positions_cost_lamports: Lamports(cost),
            positions_value_lamports: Lamports(value),
            equity_lamports: Lamports(equity),
            peak_equity_lamports: Lamports(self.peak_equity),
            drawdown_bps: dd_bps,
            drawdown_pct: dd_bps as f64 / 100.0,
            realized_pnl_lamports: Lamports(self.realized),
            unrealized_pnl_lamports: Lamports(value - cost),
            open_positions: self.positions.len() as i64,
            as_of_seq: self.seq,
            practice_epoch: Some(self.epoch),
        }
    }

    /// Another device (mobile) edits a strategy: bumps `rev`, records the change, emits
    /// `strategy.updated {rev, base_rev, changed_fields}`.
    fn remote_edit(&mut self, i: usize, field: &str) {
        let now = self.now();
        let st = &mut self.strategies[i];
        let base = st.rev;
        if field == "status" {
            st.status = if st.status == "active" { "paused".into() } else { "active".into() };
        } else if let Some(m) = st.settings.as_object_mut() {
            let cur = m.get(field).and_then(|v| v.as_f64()).unwrap_or(20.0);
            m.insert(field.into(), json!(if cur >= 25.0 { 18 } else { cur as i64 + 2 }));
        }
        st.rev += 1;
        st.history.push((st.rev, vec![field.to_owned()], "mobile".into(), now));
        let (id, rev, status) = (st.id.clone(), st.rev, st.status.clone());
        let kind = if field == "status" { if status == "paused" { "strategy.paused" } else { "strategy.resumed" } } else { "strategy.updated" };
        self.emit(kind, Actor::User, &id, Some(&id), None, None, json!({"rev": rev, "base_rev": base, "status": status, "changed_fields": [field]}), Untrusted::default());
    }

    /// 409 body per API_ENDPOINTS 2.1 for a stale strategy write.
    fn strategy_conflict<T>(&self, i: usize, base_rev: u64) -> ApiResult<T> {
        let st = &self.strategies[i];
        let later: Vec<_> = st.history.iter().filter(|h| h.0 > base_rev).collect();
        let mut changed: Vec<String> = later.iter().flat_map(|h| h.1.clone()).collect();
        changed.sort();
        changed.dedup();
        let last = later.last();
        self.err(409, "STRATEGY_REV_CONFLICT", &format!("Strategy changed since rev {base_rev}"), json!({
            "current_rev": st.rev, "base_rev": base_rev, "changed_fields": changed,
            "changed_by": {"actor": USER_ID, "via": last.map(|h| h.2.clone()), "device": last.map(|_| "iPhone15,2")},
            "changed_at": last.map(|h| IsoTs::from_ms(h.3)),
            "current": st.summary()}))
    }

    /// Practice reset (SQL `reset_practice()`): archive the epoch, close positions with
    /// `practice_reset`, expire pending buys, restore 30 SOL, emit `practice.reset`.
    fn reset(&mut self) -> PracticeResetResponse {
        let now = self.now();
        self.entries_paused = false;
        let keys: Vec<String> = self.positions.keys().cloned().collect();
        let closed = keys.len() as i64;
        for k in keys {
            self.sell_inner(&k, Decimal::from(100), ExitReason::PracticeReset, -1, "Practice reset", Actor::System);
        }
        let pending: Vec<String> = self.proposals.values().filter(|p| p.status == ProposalStatus::Pending).map(|p| p.id.clone()).collect();
        for id in &pending {
            let p = self.proposals.get_mut(id).unwrap();
            p.status = ProposalStatus::Expired;
            p.version += 1;
            p.token = None;
            let (ck, mint, sid, version) = (p.ck.clone(), p.mint.clone(), p.strategy_id.clone(), p.version);
            let u = self.coins.get(&mint).map(|c| c.untrusted.clone()).unwrap_or_default();
            self.emit("proposal.expired", Actor::System, id, Some(&sid), Some(&ck), Some(&mint), json!({
                "proposal_id": id, "kind": "buy_pick", "rev": version, "reason": "practice_reset", "at": IsoTs::from_ms(now)}), u);
        }
        let previous = self.epoch;
        self.epoch += 1;
        self.ws_rev += 1;
        self.cash = START_CASH;
        self.peak_equity = START_CASH;
        self.realized = 0;
        self.last_reset_ms = Some(now);
        let archived = ResetArchived { positions: closed, closed_open_positions: closed, fills: closed * 2, snapshots: 0, expired_proposals: pending.len() as i64 };
        let next = IsoTs::from_ms(now + RESET_COOLDOWN_MS);
        self.emit("practice.reset", Actor::User, WORKSPACE_ID, None, None, None, json!({
            "epoch": self.epoch, "previous_epoch": previous, "starting_balance_lamports": START_CASH.to_string(),
            "archived": archived, "next_allowed_at": next, "at": IsoTs::from_ms(now)}), Untrusted::default());
        self.portfolio();
        PracticeResetResponse { epoch: self.epoch, starting_balance_lamports: Lamports(START_CASH), archived, next_allowed_at: next }
    }

    fn value_of(&self, p: &Pos) -> i128 {
        let price = self.coins.get(&p.mint).map(|c| c.price_sol).unwrap_or_default();
        lam_of_sol(ui_qty(p.qty_raw, p.decimals) * price)
    }

    /// Screener payload for a coin (1.1.2: `tradeable`, `skip_reason`, `quote_mint`, quote check).
    /// 1.1.4 `MarketCapFields` from the mock price (SOL per whole token) × a 1e9-token supply. ~10 % of
    /// coins have an unknown supply → all three null (the column shows "—").
    fn mcap_json(&self, mint: &str) -> serde_json::Value {
        let Some(c) = self.coins.get(mint) else { return json!({"market_cap_lamports": null, "mcap_usd": null, "mcap_as_of": null}) };
        if mint.as_bytes().last().is_some_and(|b| b % 10 == 0) {
            return json!({"market_cap_lamports": null, "mcap_usd": null, "mcap_as_of": null});
        }
        let sol = c.price_sol * Decimal::from(1_000_000_000i64);
        let lamports = (sol * Decimal::from(LAMPORTS_PER_SOL as i64)).round();
        json!({"market_cap_lamports": lamports.to_string(), "mcap_usd": (sol * Decimal::from(SOL_USD)).round_dp(2).to_string(), "mcap_as_of": IsoTs::from_ms(self.now())})
    }

    fn scored_payload(&mut self, mint: &str, score: i64, quote_mint: Option<&str>) -> serde_json::Value {
        let tradeable = is_sol_quote(quote_mint);
        let mut checks = Vec::new();
        let liq = self.coins.get(mint).map(|c| c.liquidity_usd.round_dp(0).to_f64().unwrap_or(0.0));
        for (id, reason) in CHECKS {
            // The liquidity check reports what it measured (like the real screener); others stay null.
            let measured = if *id == "liquidity_min" { json!(liq) } else { json!(null) };
            checks.push(json!({"id": id, "class": "weighted", "passed": self.rng.f64() < 0.75, "measured": measured, "points": 10, "reason": reason}));
        }
        if let Some(q) = quote_mint {
            checks.push(json!({"id": "quote_mint", "class": "venue", "passed": tradeable, "measured": null, "points": 0,
                "reason": if tradeable { "quote SOL".to_string() } else { format!("{UNSUPPORTED_QUOTE_MINT}: quote {q} (paper mode trades SOL-quoted pools only)") }}));
        }
        let passed = tradeable && score >= SCORE_THRESHOLD;
        let mut result = json!({"passed": passed, "score": score, "score_threshold": SCORE_THRESHOLD, "max_score": 115, "checks": checks, "tradeable": tradeable});
        if !tradeable {
            result["skip_reason"] = json!(UNSUPPORTED_QUOTE_MINT);
        }
        if let Some(q) = quote_mint {
            result["quote_mint"] = json!(q);
        }
        // 1.1.2: tradeable / skip_reason / quote_mint also at the screener.scored top level.
        let rejected_by = if !tradeable { json!("quote_mint") } else if !passed { json!("score_threshold") } else { json!(null) };
        let mut p = json!({"mint": mint, "passed": passed, "summary": format!("Fit {score}/{SCORE_THRESHOLD}"), "rejected_by": rejected_by,
            "failed": if passed { json!([]) } else { json!([rejected_by]) }, "tradeable": tradeable,
            "skip_reason": (!tradeable).then_some(UNSUPPORTED_QUOTE_MINT), "quote_mint": quote_mint, "result": result});
        merge(&mut p, self.mcap_json(mint));
        p
    }

    /// `race`: the coin's pool moved to a non-SOL quote → re-score as not tradeable.
    fn flip_to_non_sol(&mut self, mint: &str) {
        let q = self.rng.pick(NON_SOL_QUOTES).to_string();
        let Some(c) = self.coins.get_mut(mint) else { return };
        c.quote_mint = Some(q.clone());
        c.flip_at_ms = None;
        let (ck, sid, u) = (c.ck.clone(), c.strategy_id.clone(), c.untrusted.clone());
        let score = 70 + (self.rng.next_u64() % 30) as i64;
        let payload = self.scored_payload(mint, score, Some(&q));
        self.emit("screener.scored", Actor::Screener, &ck, Some(&sid), Some(&ck), Some(mint), payload, u);
        self.watch_not_tradeable(mint);
    }

    /// `order.failed` (N-05) for an order that reached a not-tradeable coin anyway.
    fn order_failed(&mut self, mint: &str, side: &str, proposal_id: Option<&str>, amount: Option<i128>, qty: Option<u128>) {
        self.order_failed_with(mint, side, proposal_id, amount, qty, UNSUPPORTED_QUOTE_MINT, json!("Pool is quoted in a mint other than SOL"));
    }

    /// `order.failed` with any of the 8 contracts 1.1.2 reason codes.
    #[allow(clippy::too_many_arguments)]
    fn order_failed_with(&mut self, mint: &str, side: &str, proposal_id: Option<&str>, amount: Option<i128>, qty: Option<u128>, reason: &str, detail: serde_json::Value) {
        let (ck, sid, u, q) = match self.coins.get(mint) {
            Some(c) => (c.ck.clone(), c.strategy_id.clone(), c.untrusted.clone(), c.quote_mint.clone()),
            None => return,
        };
        let oid = self.uuid('8');
        let now = self.now();
        self.emit("order.failed", Actor::Executor, &oid, Some(&sid), Some(&ck), Some(mint), json!({
            "order_id": oid, "proposal_id": proposal_id, "mint": mint, "side": side,
            "amount_lamports": amount.map(|a| a.to_string()), "qty_raw": qty.map(|q| q.to_string()),
            "reason_code": reason, "detail": detail, "quote_mint": q,
            "mode": "practice", "server_now": IsoTs::from_ms(now)}), u);
    }

    fn spawn_candidate(&mut self) {
        let mint = fake_mint(&mut self.rng);
        let sym = self.rng.pick(SYMBOLS).to_string();
        let untrusted = Untrusted { name: Some(format!("{sym} (mock)")), symbol: Some(sym), ..Default::default() };
        let si = (self.rng.next_u64() % self.strategies.len() as u64) as usize;
        let sid = self.strategies[si].id.clone();
        let ck = self.rng.hex(8);
        let price = dec(self.rng.range(0.000_000_2, 0.000_02));
        let liq = dec(self.rng.range(5_000.0, 60_000.0)).round_dp(2);
        let venue = if self.rng.f64() < 0.5 { "curve" } else { "amm" };
        let decimals: u8 = if self.rng.f64() < 0.8 { 6 } else { 9 };
        let program = if self.rng.f64() < 0.85 { TOKEN_PROGRAM } else { TOKEN_2022 };
        let quote = if self.rng.f64() < self.not_tradeable.new_coin_rate() { self.rng.pick(NON_SOL_QUOTES).to_string() } else { WSOL_MINT.to_string() };
        let flip_at_ms = (self.not_tradeable == NotTradeableMode::Race && is_sol_quote(Some(&quote)) && self.rng.f64() < 0.4).then(|| self.now() + FLIP_AFTER_MS);
        self.coins.insert(mint.clone(), Coin { price_sol: price, liquidity_usd: liq, untrusted: untrusted.clone(), ck: ck.clone(), strategy_id: sid.clone(), decimals, token_program: program, quote_mint: Some(quote.clone()), flip_at_ms });
        self.emit("coin.detected", Actor::Ingest, &ck, Some(&sid), Some(&ck), Some(&mint),
            { let mut p = json!({"mint": mint, "venue": venue, "launchpad": "mock", "creator": null, "quote_mint": quote, "decimals": decimals, "token_program": program}); merge(&mut p, self.mcap_json(&mint)); p }, untrusted.clone());

        let score = if self.rng.f64() < 0.15 { 40 + (self.rng.next_u64() % 29) as i64 } else { 70 + (self.rng.next_u64() % 45) as i64 };
        let payload = self.scored_payload(&mint, score, Some(&quote));
        let passed = payload["passed"].as_bool().unwrap_or(false);
        self.emit("screener.scored", Actor::Screener, &ck, Some(&sid), Some(&ck), Some(&mint), payload, untrusted.clone());
        if !passed {
            if !is_sol_quote(Some(&quote)) {
                // Not tradeable: guard not run, never proposed; the row stays visible and keeps a live (read-only) chart.
                self.watch_not_tradeable(&mint);
            } else {
                self.coins.remove(&mint);
            }
            return;
        }

        if self.rng.f64() < 0.3 {
            let why = self.rng.pick(BLOCK_REASONS).to_string();
            self.emit("guard.result", Actor::Guard, &ck, Some(&sid), Some(&ck), Some(&mint),
                json!({"mint": mint, "verdict": "FAIL", "risk_score": 80, "reasons": [why], "checks": []}), untrusted);
            self.coins.remove(&mint);
            return;
        }
        self.emit("guard.result", Actor::Guard, &ck, Some(&sid), Some(&ck), Some(&mint),
            json!({"mint": mint, "verdict": "PASS", "risk_score": 12, "reasons": [], "checks": []}), untrusted.clone());
        let pick_mcap = self.mcap_json(&mint);
        self.emit("pick.created", Actor::Screener, &ck, Some(&sid), Some(&ck), Some(&mint),
            with_mcap(json!({"mint": mint, "summary": format!("Fit {score}/{SCORE_THRESHOLD}"), "score": {"passed": true, "score": score, "score_threshold": SCORE_THRESHOLD, "max_score": 115, "checks": [], "tradeable": true, "quote_mint": quote},
                "guard_verdict": "PASS", "guard_reasons": []}), pick_mcap), untrusted.clone());
        let pick_id = self.uuid('6');
        let expires = self.now() + PROPOSAL_TTL_MS;
        self.emit("entry.armed", Actor::Entry, &ck, Some(&sid), Some(&ck), Some(&mint),
            json!({"pick_id": pick_id, "condition": "momentum_entry", "expires_at": IsoTs::from_ms(expires)}), untrusted.clone());
        let pid = self.uuid('3');
        self.proposals.insert(pid.clone(), Prop { id: pid.clone(), ck: ck.clone(), mint: mint.clone(), strategy_id: sid.clone(), version: 1, status: ProposalStatus::Pending, expires_ms: expires, token: None });
        self.emit("proposal.created", Actor::Entry, &pid, Some(&sid), Some(&ck), Some(&mint), json!({
            "proposal_id": pid, "kind": "buy_pick", "rev": 1, "expires_at": IsoTs::from_ms(expires), "first_buy": true,
            "approval_mode": "ask_every_buy", "amount_lamports": BUY_LAMPORTS.to_string(), "risk_level": "medium",
            "summary": format!("Beli {} SOL (paper)", sol_of_lam(BUY_LAMPORTS).normalize()), "base_rev": null, "weakening": false, "diff": null, "estimate": null,
            // 1.1.2: self-contained card
            "mint": mint, "symbol": untrusted.symbol, "price_sol": Dec(price)}), untrusted);
    }

    fn watch_not_tradeable(&mut self, mint: &str) {
        if self.nt_watch.iter().any(|m| m == mint) {
            return;
        }
        self.nt_watch.push_back(mint.to_string());
        while self.nt_watch.len() > NT_WATCH_MAX {
            if let Some(old) = self.nt_watch.pop_front() {
                let in_use = self.positions.values().any(|p| p.mint == old) || self.proposals.values().any(|p| p.mint == old && p.status == ProposalStatus::Pending);
                if !in_use {
                    self.coins.remove(&old);
                }
            }
        }
    }

    fn tracked_mints(&self) -> Vec<String> {
        let mut v: Vec<String> = self.positions.values().map(|p| p.mint.clone()).collect();
        for m in &self.nt_watch {
            if !v.contains(m) && self.coins.contains_key(m) {
                v.push(m.clone());
            }
        }
        for p in self.proposals.values().filter(|p| p.status == ProposalStatus::Pending) {
            if !v.contains(&p.mint) {
                v.push(p.mint.clone());
            }
        }
        v
    }

    fn step(&mut self) {
        let now = self.now();
        self.slot += 2;
        let flips: Vec<String> = self.coins.iter().filter(|(_, c)| c.flip_at_ms.is_some_and(|t| t <= now)).map(|(m, _)| m.clone()).collect();
        for m in flips {
            self.flip_to_non_sol(&m);
        }
        let mints = self.tracked_mints();
        for m in &mints {
            let shock = if self.rng.f64() < 0.04 { self.rng.range(-0.25, 0.35) } else { 0.0 };
            let f = dec(1.0 + self.rng.range(-0.035, 0.038) + shock);
            let price = {
                let c = self.coins.get_mut(m).unwrap();
                c.price_sol = (c.price_sol * f).max(Decimal::new(1, 12)).round_dp(12);
                c.price_sol
            };
            let position_ids: Vec<String> = self.positions.values().filter(|p| &p.mint == m).map(|p| p.key.clone()).collect();
            for p in self.positions.values_mut().filter(|p| &p.mint == m) {
                p.peak = p.peak.max(price);
            }
            let liq = self.coins[m].liquidity_usd;
            let mark = MarkMessage {
                mint: m.clone(),
                price_usd: Dec((price * Decimal::from(SOL_USD)).round_dp(12)),
                price_sol: Dec(price),
                liquidity_usd: liq.to_f64().unwrap_or(0.0),
                slot: self.slot,
                ts: IsoTs::from_ms(now),
                position_ids,
                server_now: IsoTs::from_ms(now),
            };
            if let Some(tx) = &self.live {
                let _ = tx.try_send(Inbound::Mark(mark));
            }
        }
        self.coins.retain(|m, _| mints.contains(m));

        // Exit plan (mock): TP 2x, trailing 20% after +30%, SL -40%.
        let mut exits = Vec::new();
        for p in self.positions.values() {
            // No SOL pool any more → the exit plan cannot sell either (position stays, PnL frozen).
            if !self.coins.get(&p.mint).is_some_and(Coin::tradeable) {
                continue;
            }
            let price = self.coins.get(&p.mint).map(|c| c.price_sol).unwrap_or_default();
            let entry = sol_of_lam(p.cost) / ui_qty(p.qty_raw, p.decimals).max(Decimal::new(1, 12));
            let (r, peak_r) = (price / entry, p.peak / entry);
            let two = Decimal::from(2);
            if r >= two {
                exits.push((p.key.clone(), ExitReason::ProfitTarget, 0, "Profit target +100%: sell 100%"));
            } else if peak_r >= dec(1.3) && price <= p.peak * dec(0.8) {
                exits.push((p.key.clone(), ExitReason::PeakTrail, 1, "Peak trail 20% below high"));
            } else if r <= dec(0.6) {
                exits.push((p.key.clone(), ExitReason::LossGuard, 2, "Loss guard -40%"));
            }
        }
        for (key, rule, idx, detail) in exits {
            self.sell_inner(&key, Decimal::from(100), rule, idx, detail, Actor::Exit);
        }

        let expired: Vec<String> = self.proposals.values().filter(|p| p.status == ProposalStatus::Pending && p.expires_ms <= now).map(|p| p.id.clone()).collect();
        for id in expired {
            let (ck, mint, sid, version) = {
                let p = self.proposals.get_mut(&id).unwrap();
                p.status = ProposalStatus::Expired;
                p.version += 1;
                (p.ck.clone(), p.mint.clone(), p.strategy_id.clone(), p.version)
            };
            let u = self.coins.get(&mint).map(|c| c.untrusted.clone()).unwrap_or_default();
            self.emit("proposal.expired", Actor::System, &id, Some(&sid), Some(&ck), Some(&mint),
                json!({"proposal_id": id, "kind": "buy_pick", "rev": version, "reason": "timeout", "at": IsoTs::from_ms(now)}), u);
        }
        self.proposals.retain(|_, p| p.status == ProposalStatus::Pending || now - p.expires_ms < 600_000);

        if now >= self.next_remote_edit_ms && !self.strategies.is_empty() {
            self.next_remote_edit_ms = now + REMOTE_EDIT_EVERY_MS;
            let i = (self.rng.next_u64() as usize) % self.strategies.len();
            self.remote_edit(i, crate::keys::settings::PEAK_TRAIL_PCT);
        }
        if now >= self.next_candidate_ms {
            self.spawn_candidate();
            self.next_candidate_ms = now + self.rng.range(4_000.0, 11_000.0) as i64;
        }
        if now >= self.next_clock_ms {
            self.next_clock_ms = now + CLOCK_EVERY_MS;
            if let Some(tx) = &self.live {
                let _ = tx.try_send(Inbound::Clock(ClockMessage { server_now: IsoTs::from_ms(now), safe_seq: self.seq }));
            }
        }
    }

    fn buy(&mut self, prop_id: &str) {
        let (ck, mint, sid) = {
            let p = &self.proposals[prop_id];
            (p.ck.clone(), p.mint.clone(), p.strategy_id.clone())
        };
        let Some(coin) = self.coins.get(&mint) else { return };
        let (mark, untrusted, decimals, token_program) = (coin.price_sol, coin.untrusted.clone(), coin.decimals, coin.token_program);
        if self.cash < BUY_LAMPORTS {
            // Two different things (Backend): this one order fails (kind error) …
            let pid = prop_id.to_string();
            self.order_failed_with(&mint, "buy", Some(&pid), Some(BUY_LAMPORTS), None, "INSUFFICIENT_PRACTICE_BALANCE",
                json!({"cash_lamports": self.cash.to_string(), "needed_lamports": BUY_LAMPORTS.to_string()}));
            // … and strategy entries pause until cash recovers or Practice is reset (kind notice, once).
            if !self.entries_paused {
                self.entries_paused = true;
                self.emit("system.notice", Actor::Executor, &ck, Some(&sid), Some(&ck), Some(&mint),
                    json!({"code": "PRACTICE_CASH_INSUFFICIENT", "message": "Practice cash too low; entries paused"}), untrusted);
            }
            return;
        }
        self.entries_paused = false;
        let slip_bps = dec(self.rng.range(0.5, 3.0)).round_dp(2);
        let exec = (mark * (Decimal::ONE + slip_bps / Decimal::from(10_000))).round_dp(12);
        let swap_fee = BUY_LAMPORTS * FEE_BPS as i128 / 10_000;
        let net = BUY_LAMPORTS - swap_fee - NETWORK_FEE;
        let qty_ui = sol_of_lam(net) / exec;
        let qty_raw = (qty_ui * Decimal::from(10u64.pow(decimals as u32))).floor().to_u128().unwrap_or(0);
        self.cash -= BUY_LAMPORTS;
        let n = self.pos_n.entry(ck.clone()).or_insert(0);
        let key = format!("{ck}.{n}");
        *n += 1;
        let latency = 300 + (self.rng.next_u64() % 400) as i64;
        let fill = json!({"sol_lamports": BUY_LAMPORTS.to_string(), "token_amount_raw": qty_raw.to_string(), "exec_price_sol": Dec(exec),
            "mid_price_sol": Dec(mark), "price_impact_bps": 0, "slippage_bps": slip_bps.to_f64(), "swap_fee_lamports": swap_fee.to_string(),
            "network_fee_lamports": NETWORK_FEE.to_string(), "latency_ms": latency, "practice_epoch": self.epoch});
        let mut fs = fill.clone();
        fs["position_key"] = json!(key);
        fs["side"] = json!("buy");
        fs["simulated"] = json!(true);
        fs["mark_price_sol"] = json!(Dec(mark));
        fs["fee_bps"] = json!(FEE_BPS);
        self.emit("fill.simulated", Actor::Executor, &key, Some(&sid), Some(&ck), Some(&mint), fs, untrusted.clone());
        let opened = self.now();
        let pos_id = self.uuid('5');
        let mut fill = fill;
        fill["id"] = json!(self.uuid('6'));
        fill["created_at"] = json!(IsoTs::from_ms(opened));
        self.positions.insert(key.clone(), Pos { id: pos_id.clone(), key: key.clone(), ck: ck.clone(), mint: mint.clone(), strategy_id: sid.clone(), qty_raw, cost: BUY_LAMPORTS, peak: mark, opened_ms: opened, untrusted: untrusted.clone(), realized: 0, rev: 1, decimals });
        self.emit("position.opened", Actor::Executor, &key, Some(&sid), Some(&ck), Some(&mint),
            json!({"position_key": key, "position_id": pos_id, "mint": mint, "fill": fill, "first_buy": true, "rev": 1, "practice_epoch": self.epoch,
                "decimals": decimals, "token_program": token_program}), untrusted);
        if self.not_tradeable == NotTradeableMode::Race && self.rng.f64() < 0.4 {
            let at = self.now() + FLIP_AFTER_MS;
            if let Some(c) = self.coins.get_mut(&mint) {
                c.flip_at_ms.get_or_insert(at);
            }
        }
        self.portfolio();
    }

    fn sell_inner(&mut self, key: &str, pct: Decimal, rule: ExitReason, rule_index: i64, detail: &str, actor: Actor) {
        let Some(p) = self.positions.get(key) else { return };
        let (ck, mint, sid, u, pos_id) = (p.ck.clone(), p.mint.clone(), p.strategy_id.clone(), p.untrusted.clone(), p.id.clone());
        let mark = self.coins.get(&mint).map(|c| c.price_sol).unwrap_or_default();
        self.emit("exit.triggered", Actor::Exit, key, Some(&sid), Some(&ck), Some(&mint),
            json!({"position_key": key, "rule": rule, "rule_index": rule_index, "sell_portion_pct": pct.to_f64(), "trigger_price_sol": Dec(mark), "detail": detail}), u.clone());
        let p = self.positions.get(key).unwrap();
        let full = pct >= Decimal::from(100);
        let p_dec = p.decimals;
        let sell_raw = if full { p.qty_raw } else { (Decimal::from_u128(p.qty_raw).unwrap() * pct / Decimal::from(100)).floor().to_u128().unwrap_or(0) };
        let cost_part = if full { p.cost } else { (Decimal::from_i128(p.cost).unwrap() * pct / Decimal::from(100)).round().to_i128().unwrap_or(0) };
        let slip_bps = dec(self.rng.range(0.5, 3.0)).round_dp(2);
        let exec = (mark * (Decimal::ONE - slip_bps / Decimal::from(10_000))).round_dp(12);
        let gross = lam_of_sol(ui_qty(sell_raw, p_dec) * exec);
        let swap_fee = gross * FEE_BPS as i128 / 10_000;
        let out = (gross - swap_fee - NETWORK_FEE).max(0);
        self.cash += out;
        let pnl = out - cost_part;
        self.realized += pnl;
        self.emit("fill.simulated", Actor::Executor, key, Some(&sid), Some(&ck), Some(&mint), json!({
            "position_key": key, "side": "sell", "simulated": true, "mark_price_sol": Dec(mark), "exec_price_sol": Dec(exec),
            "token_amount_raw": sell_raw.to_string(), "sol_lamports": out.to_string(), "fee_bps": FEE_BPS, "swap_fee_lamports": swap_fee.to_string(),
            "network_fee_lamports": NETWORK_FEE.to_string(), "slippage_bps": slip_bps.to_f64(), "latency_ms": 350, "practice_epoch": self.epoch,
            "position_id": pos_id, "mid_price_sol": Dec(mark), "price_impact_bps": 0}), u.clone());
        let now = self.now();
        if full {
            let p = self.positions.remove(key).unwrap();
            let pnl_total = p.realized + pnl;
            let pnl_pct = if p.cost > 0 { (Decimal::from_i128(pnl_total).unwrap() * Decimal::from(100) / Decimal::from_i128(p.cost).unwrap()).round_dp(2) } else { Decimal::ZERO };
            let epoch = self.epoch;
            self.emit("position.closed", actor, key, Some(&sid), Some(&ck), Some(&mint), json!({
                "position_key": key, "position_id": pos_id, "rev": p.rev + 1, "practice_epoch": epoch, "exit_reason": rule, "exit_price_sol": Dec(exec), "sol_out_lamports": out.to_string(),
                "pnl_lamports": pnl_total.to_string(), "pnl_pct": pnl_pct.to_f64(), "hold_seconds": (now - p.opened_ms) / 1000}), u);
        } else {
            let p = self.positions.get_mut(key).unwrap();
            p.qty_raw -= sell_raw;
            p.cost -= cost_part;
            p.realized += pnl;
            p.rev += 1;
            let (qty, peak, realized, rev, cost, dec_) = (p.qty_raw, p.peak, p.realized, p.rev, p.cost, p.decimals);
            let q = ui_qty(qty, dec_);
            let avg = if q.is_zero() { Decimal::ZERO } else { (sol_of_lam(cost) / q).round_dp(12) };
            let ps = plan_state(avg, peak);
            let unreal = lam_of_sol(q * mark) - cost;
            let epoch = self.epoch;
            self.emit("position.updated", actor, key, Some(&sid), Some(&ck), Some(&mint), json!({
                "position_key": key, "position_id": pos_id, "qty_raw": qty.to_string(), "peak_price_sol": Dec(peak), "realized_lamports": realized.to_string(),
                "plan_state": ps,
                "rev": rev, "cost_basis_lamports": cost.to_string(), "avg_entry_price_sol": Dec(avg), "unrealized_pnl_lamports": unreal.to_string(),
                "practice_epoch": epoch}), u);
        }
        self.portfolio();
    }

    fn page(&self, after_seq: i64, limit: u32) -> EventPage {
        let limit = limit.clamp(1, 500) as usize;
        let mut items: Vec<EventEnvelope> = self.log.iter().filter(|e| e.seq > after_seq).take(limit + 1).cloned().collect();
        let has_more = items.len() > limit;
        items.truncate(limit);
        EventPage {
            next_after_seq: Some(items.last().map(|e| e.seq).unwrap_or(after_seq)),
            next_before_seq: None,
            has_more,
            safe_seq: self.seq,
            server_now: IsoTs::from_ms(self.now()),
            items,
        }
    }

    /// 1.1.2 error body: `error` is always an object `{code, message, ...details, server_now}`
    /// (details and 409 merge data spread inside it), plus `server_now` next to it.
    fn err<T>(&self, http: u16, code: &str, message: &str, details: serde_json::Value) -> ApiResult<T> {
        let now = IsoTs::from_ms(self.now());
        let mut e = json!({"code": code, "message": message, "request_id": format!("req_mock{}", self.seq), "server_now": now});
        if let (Some(b), Some(d)) = (e.as_object_mut(), details.as_object()) {
            for (k, v) in d {
                b.entry(k.clone()).or_insert(v.clone());
            }
        }
        Err(ApiFailure::from_body(http, &json!({"error": e, "server_now": now})))
    }

    fn precondition<T>(&self) -> ApiResult<T> {
        self.err(428, "PRECONDITION_REQUIRED", "Write needs If-Match: <rev> or expected_rev", json!({}))
    }
}

/// Strategy settings using the key names from `keys.rs` (single rename point for v1.1).
fn default_settings(full: bool) -> serde_json::Value {
    use crate::keys::{preset, settings as k};
    let mut m = serde_json::Map::new();
    m.insert(k::BANKROLL_LAMPORTS.into(), json!(START_CASH.to_string()));
    m.insert(k::TICKET_LAMPORTS.into(), json!(BUY_LAMPORTS.to_string()));
    m.insert(k::APPROVAL_MODE.into(), json!("ask_every_buy"));
    m.insert(k::SCORE_THRESHOLD.into(), json!(SCORE_THRESHOLD));
    m.insert(k::VENUES.into(), json!(["curve", "amm"]));
    if full {
        m.insert(k::EXIT_PRESET.into(), json!(preset::MOMENTUM_TRAIL));
        // 1.1.2: trail from PEAK and hard stop from ENTRY are separate keys (0 = off).
        m.insert(k::PEAK_TRAIL_PCT.into(), json!(20));
        m.insert(k::STOP_LOSS_PCT.into(), json!(0));
        m.insert(k::EXIT_RULES.into(), json!({
            k::PROFIT_TARGETS: [{ k::AT_GAIN_PCT: 100, k::SELL_PORTION_PCT: 100 }],
            k::LOSS_GUARDS: [{ k::AT_LOSS_PCT: 40, k::SELL_PORTION_PCT: 100 }],
        }));
    }
    serde_json::Value::Object(m)
}

/// Mock `plan_state` (1.1.2 `PlanState`, discriminated `PlanStep`) for the mock exit plan:
/// profit target +100 % (2×), loss guard −40 % from entry, peak trail 20 % armed after +30 %.
fn plan_state(entry: Decimal, peak: Decimal) -> serde_json::Value {
    let px = |m: &str| Dec((entry * Decimal::from_str(m).unwrap()).round_dp(12));
    let armed = peak >= entry * Decimal::from_str("1.3").unwrap();
    let stop = Dec((peak * Decimal::from_str("0.8").unwrap()).round_dp(12));
    json!({
        "preset": crate::keys::preset::MOMENTUM_TRAIL, "current_step": 0, "triggered_steps": [],
        "trail_peak_price_sol": armed.then_some(Dec(peak)),
        "steps": [
            {"kind": "profit_target", "index": 0, "triggered": false, "triggered_at": null, "at_gain_pct": 100, "sell_portion_pct": 100, "trigger_price_sol": px("2")},
            {"kind": "peak_trail", "index": 1, "triggered": false, "triggered_at": null, "trail_pct": 20, "armed": armed,
             "peak_price_sol": Dec(peak), "stop_price_sol": armed.then_some(stop)},
            {"kind": "loss_guard", "index": 2, "triggered": false, "triggered_at": null, "at_loss_pct": 40, "sell_portion_pct": 100, "trigger_price_sol": px("0.6")},
        ]
    })
}

/// Simulated backend behind the [`Transport`] trait.
pub struct MockTransport {
    inner: Arc<Mutex<Server>>,
}

impl MockTransport {
    pub fn new(skew_ms: i64) -> Self {
        let now = now_ms() as i64 + skew_ms;
        let strategies = vec![
            Strat::new("20000000-0000-0000-0000-00000000000a", "Mock · Curve", true),
            Strat::new("20000000-0000-0000-0000-00000000000b", "Mock · AMM", false),
            Strat::new("20000000-0000-0000-0000-00000000000c", "Mock · Pullback", false),
        ];
        let server = Server {
            seq: 18_000,
            log: VecDeque::new(),
            live: None,
            rng: Rng::seeded(),
            skew_ms,
            cash: START_CASH,
            peak_equity: START_CASH,
            realized: 0,
            strategies,
            coins: HashMap::new(),
            proposals: HashMap::new(),
            positions: HashMap::new(),
            pos_n: HashMap::new(),
            decided: HashMap::new(),
            idem: HashMap::new(),
            nt_watch: Default::default(),
            entries_paused: false,
            seq_job: 9_000_000_000,
            slot: 301_223_344,
            next_candidate_ms: now + 1_500,
            next_clock_ms: now + CLOCK_EVERY_MS,
            drop_live: DROP_LIVE_PCT,
            uid: 0,
            ws_rev: 1,
            epoch: 1,
            last_reset_ms: None,
            force_conflict: !cfg!(test) && std::env::var("SENTRA_MOCK_FORCE_CONFLICT").is_ok_and(|v| v == "1"),
            next_remote_edit_ms: now + REMOTE_EDIT_EVERY_MS,
            not_tradeable: if cfg!(test) { NotTradeableMode::Off } else { NotTradeableMode::from_env() },
        };
        Self { inner: Arc::new(Mutex::new(server)) }
    }

    /// Drive the simulated server (1 s ticks) on the async runtime.
    pub fn start(&self) {
        let inner = self.inner.clone();
        tauri::async_runtime::spawn(async move {
            {
                let mut s = inner.lock().unwrap();
                // system.notice codes must come from errors.json v4 (kind notice) — no mock-only code.
                s.portfolio();
            }
            let mut tick = tokio::time::interval(Duration::from_millis(1_000));
            loop {
                tick.tick().await;
                inner.lock().unwrap().step();
            }
        });
    }

    /// Test helper: generate `n` candidates through a very lossy live feed (30 % drops).
    #[cfg(test)]
    pub fn test_generate(&self, n: usize) {
        self.with(|s| {
            s.drop_live = 0.3;
            (0..n).for_each(|_| s.spawn_candidate());
        })
    }

    #[cfg(test)]
    fn with<T>(&self, f: impl FnOnce(&mut Server) -> T) -> T {
        f(&mut self.inner.lock().unwrap())
    }
}

impl Transport for MockTransport {
    fn workspace_id(&self) -> &str {
        WORKSPACE_ID
    }

    async fn subscribe(&self, after_seq: i64) -> ApiResult<mpsc::Receiver<Inbound>> {
        let (tx, rx) = mpsc::channel(4096);
        let mut s = self.inner.lock().unwrap();
        // SSE semantics: replay everything after the cursor, then live.
        let now = IsoTs::from_ms(s.now());
        for e in s.log.iter().filter(|e| e.seq > after_seq) {
            let mut e = e.clone();
            e.server_now = Some(now.clone());
            let _ = tx.try_send(Inbound::Event(Box::new(e)));
        }
        s.live = Some(tx);
        Ok(rx)
    }

    async fn list_events(&self, after_seq: i64, limit: u32) -> ApiResult<EventPage> {
        Ok(self.inner.lock().unwrap().page(after_seq, limit))
    }

    async fn get_workspace(&self) -> ApiResult<ApiItem<WorkspaceSummary>> {
        let s = self.inner.lock().unwrap();
        let data = WorkspaceSummary { id: WORKSPACE_ID.into(), name: "Mock workspace".into(), rev: s.ws_rev, practice_start_lamports: Some(Lamports(START_CASH)), modes_enabled: vec![Mode::Practice], practice_epoch: Some(s.epoch) };
        Ok(ApiItem { data, server_now: IsoTs::from_ms(s.now()) })
    }

    async fn get_portfolio(&self) -> ApiResult<ApiItem<PortfolioSnapshot>> {
        let mut s = self.inner.lock().unwrap();
        let data = s.snapshot();
        Ok(ApiItem { data, server_now: IsoTs::from_ms(s.now()) })
    }

    async fn list_strategies(&self) -> ApiResult<ApiItem<Vec<StrategySummary>>> {
        let s = self.inner.lock().unwrap();
        let data = s.strategies.iter().map(Strat::summary).collect();
        Ok(ApiItem { data, server_now: IsoTs::from_ms(s.now()) })
    }

    async fn get_approval(&self, proposal_id: &str) -> ApiResult<ApiItem<ApprovalDetail>> {
        let mut s = self.inner.lock().unwrap();
        let token = format!("apt_{}", s.rng.hex(22));
        let now = s.now();
        let Some(p) = s.proposals.get_mut(proposal_id) else { return s.err(404, "NOT_FOUND", "Resource not found or not visible", json!({})) };
        let pending = p.status == ProposalStatus::Pending && p.expires_ms > now;
        if pending {
            p.token = Some(token.clone());
        }
        let d = ApprovalDetail {
            proposal_id: p.id.clone(),
            version: p.version,
            status: p.status,
            expires_at: IsoTs::from_ms(p.expires_ms),
            decision_token: pending.then_some(token),
            decision_token_expires_at: pending.then(|| IsoTs::from_ms(p.expires_ms.min(now + 15 * 60_000))),
        };
        Ok(ApiItem { data: d, server_now: IsoTs::from_ms(now) })
    }

    async fn decide(&self, proposal_id: &str, idem_key: &str, req: ApprovalDecisionRequest) -> ApiResult<ApiItem<ApprovalDecisionResponse>> {
        let mut s = self.inner.lock().unwrap();
        let now = s.now();
        let fp = format!("decide:{proposal_id}:{:?}:{}:{}:{:?}", req.decision, req.expected_rev, req.token, req.reject_reason);
        if let Some(stored) = s.idem_check(idem_key, &fp)? {
            let mut r: ApprovalDecisionResponse = serde_json::from_value(stored).expect("stored decision");
            r.replayed = true;
            return Ok(ApiItem { data: r, server_now: IsoTs::from_ms(now) });
        }
        if let Some((d, resp)) = s.decided.get(&req.token).cloned() {
            if d == req.decision {
                let mut r = resp;
                r.replayed = true;
                return Ok(ApiItem { data: r, server_now: IsoTs::from_ms(now) });
            }
            return s.err(409, "APPROVAL_ALREADY_DECIDED", "Already decided", json!({}));
        }
        // 1.1.3: reject_reason only with reject (unknown values are refused when the body is parsed:
        // `parse_decision_body`).
        if req.decision == Decision::Approve && req.reject_reason.is_some() {
            return s.err(422, "VALIDATION_FAILED", "reject_reason is only allowed with decision=reject", json!({"field": "reject_reason"}));
        }
        let reject_reason = (req.decision == Decision::Reject).then(|| req.reject_reason.unwrap_or(ApprovalRejectReason::UserDeclined));
        let Some(p) = s.proposals.get(proposal_id) else { return s.err(404, "NOT_FOUND", "Resource not found or not visible", json!({})) };
        if p.status != ProposalStatus::Pending {
            let code = if p.status == ProposalStatus::Expired { "APPROVAL_EXPIRED" } else { "APPROVAL_ALREADY_DECIDED" };
            return s.err(409, code, "Not pending", json!({"status": p.status}));
        }
        if p.expires_ms <= now {
            return s.err(409, "APPROVAL_EXPIRED", "Approval expired", json!({"reason": "timeout"}));
        }
        if p.token.as_deref() != Some(req.token.as_str()) {
            return s.err(403, "APPROVAL_TOKEN_INVALID", "Decision token invalid", json!({}));
        }
        if p.version != req.expected_rev {
            let v = p.version;
            return s.err(409, "VERSION_CONFLICT", &format!("Approval rev is {v}"), json!({"current_rev": v, "base_rev": req.expected_rev, "current": {"proposal_id": proposal_id, "rev": v}}));
        }
        let (ck, mint, sid) = (p.ck.clone(), p.mint.clone(), p.strategy_id.clone());
        if req.decision == Decision::Approve && !s.coins.get(&mint).is_some_and(Coin::tradeable) {
            // Server-side WF-20 guard (desktop already blocks): N-05 order.failed + 422.
            s.order_failed(&mint, "buy", Some(proposal_id), Some(BUY_LAMPORTS), None);
            return s.err(422, UNSUPPORTED_QUOTE_MINT, "Pool is quoted in a mint other than SOL", json!({"mint": mint}));
        }
        let p = s.proposals.get_mut(proposal_id).unwrap();
        p.token = None;
        p.version += 1;
        p.status = if req.decision == Decision::Approve { ProposalStatus::Approved } else { ProposalStatus::Rejected };
        let (status, version) = (p.status, p.version);
        let u = s.coins.get(&mint).map(|c| c.untrusted.clone()).unwrap_or_default();
        let kind = if status == ProposalStatus::Approved { "proposal.approved" } else { "proposal.rejected" };
        s.emit(kind, Actor::User, proposal_id, Some(&sid), Some(&ck), Some(&mint), json!({
            "proposal_id": proposal_id, "kind": "buy_pick", "rev": version, "decided_by": USER_ID, "decided_via": "desktop", "reason": req.reason, "reject_reason": reject_reason}), u);
        if status == ProposalStatus::Approved {
            s.buy(proposal_id);
        }
        let resp = ApprovalDecisionResponse { proposal_id: proposal_id.into(), status, version, reject_reason, replayed: false };
        s.decided.insert(req.token, (req.decision, resp.clone()));
        s.idem.insert(idem_key.into(), (fp, serde_json::to_value(&resp).unwrap()));
        Ok(ApiItem { data: resp, server_now: IsoTs::from_ms(now) })
    }

    async fn close(&self, position_id: &str, idem_key: &str, if_match: Option<u64>, fraction_bps: u16) -> ApiResult<CloseResponse> {
        let mut s = self.inner.lock().unwrap();
        let fp = format!("close:{position_id}:{fraction_bps}:{if_match:?}");
        if let Some(stored) = s.idem_check(idem_key, &fp)? {
            let mut r: CloseResponse = serde_json::from_value(stored).expect("stored close");
            r.replayed = true;
            return Ok(r);
        }
        let Some(p) = s.positions.values().find(|p| p.id == position_id) else {
            return s.err(409, "POSITION_ALREADY_CLOSED", "Position is closed or unknown", json!({"position_id": position_id}));
        };
        // 1.1.2: positions carry rev; close needs If-Match (428 without, 409 when stale).
        let Some(base) = if_match else { return s.precondition() };
        let key = p.key.clone();
        if base != p.rev {
            let cur = p.rev;
            let current = json!({"id": position_id, "position_key": key, "rev": cur, "qty_raw": p.qty_raw.to_string(), "status": "open"});
            return s.err(409, "VERSION_CONFLICT", &format!("Position rev is {cur}, not {base}"), json!({"current_rev": cur, "base_rev": base, "changed_fields": ["qty_raw"], "current": current}));
        }
        if !(1..=FRACTION_BPS_MAX).contains(&fraction_bps) {
            return s.err(422, "INVALID_FRACTION", "fraction_bps must be an integer 1-10000", json!({"field": "fraction_bps"}));
        }
        let (mint, qty, dec_) = (p.mint.clone(), p.qty_raw, p.decimals);
        let (sid, ck, u) = (p.strategy_id.clone(), p.ck.clone(), p.untrusted.clone());
        if !s.coins.get(&mint).is_some_and(Coin::tradeable) {
            s.order_failed(&mint, "sell", None, None, Some(qty));
            return s.err(422, UNSUPPORTED_QUOTE_MINT, "Pool is quoted in a mint other than SOL", json!({"mint": mint, "position_id": position_id}));
        }
        // order.submitted → (simulated fill) → order.filled → fill.simulated + position.updated|closed
        let now = s.now();
        let order_id = s.uuid('7');
        s.seq_job += 1;
        let job_id = s.seq_job;
        let epoch = s.epoch;
        let mut order = json!({"id": order_id, "position_id": position_id, "mint": mint, "mode": "practice", "side": "sell", "kind": "manual_close",
            "fraction_bps": fraction_bps, "status": "queued", "reason_code": null, "job_id": job_id.to_string(), "fill_id": null,
            "practice_epoch": epoch, "created_at": IsoTs::from_ms(now), "updated_at": IsoTs::from_ms(now)});
        s.emit("order.submitted", Actor::User, &order_id, Some(&sid), Some(&ck), Some(&mint),
            json!({"order": order, "position_id": position_id, "position_rev": base, "practice_epoch": epoch}), u.clone());
        let pct = Decimal::from(fraction_bps) / Decimal::from(100);
        s.sell_inner(&key, pct, ExitReason::Manual, -1, "Manual sell (desktop)", Actor::User);
        let (rev, qty_raw, status) = match s.positions.get(&key) {
            Some(p) => (p.rev, p.qty_raw, "open"),
            None => (base + 1, 0, "closed"),
        };
        let fill = s.log.iter().rev().find(|e| e.kind == "fill.simulated" && e.payload["position_key"] == key.as_str()).map(|e| {
            let mut f = e.payload.clone();
            f["id"] = json!(e.id);
            f["created_at"] = json!(e.ts);
            f
        });
        order["status"] = json!("filled");
        order["fill_id"] = fill.as_ref().map(|f| f["id"].clone()).unwrap_or(json!(null));
        order["updated_at"] = json!(IsoTs::from_ms(s.now()));
        s.emit("order.filled", Actor::Executor, &order_id, Some(&sid), Some(&ck), Some(&mint),
            json!({"order": order, "fill": fill, "position_id": position_id, "position_rev": rev, "practice_epoch": epoch}), u);
        let resp = CloseResponse {
            // API_ENDPOINTS 4.4: `position` = the position at request time (rev `base`); the new rev
            // arrives with position.updated / position.closed / order.filled.position_rev.
            position: PositionWire { id: position_id.into(), position_key: key, rev: base, qty_raw: RawQty(qty_raw), status: status.into(), practice_epoch: Some(epoch),
                decimals: Some(dec_), token_program: None, cost_basis_lamports: None, avg_entry_price_sol: None, exit_reason: (status == "closed").then_some(ExitReason::Manual) },
            order: serde_json::from_value(order).expect("OrderWire"),
            order_id,
            fill: fill.and_then(|f| serde_json::from_value::<FillWire>(f).ok()),
            job_id: Some(job_id),
            status: "filled".into(),
            replayed: false,
            server_now: IsoTs::from_ms(s.now()),
        };
        s.idem.insert(idem_key.into(), (fp, serde_json::to_value(&resp).unwrap()));
        Ok(resp)
    }

    async fn set_strategy_paused(&self, id: &str, _idem_key: &str, if_match: Option<u64>, paused: bool) -> ApiResult<ApiItem<StrategySummary>> {
        let mut s = self.inner.lock().unwrap();
        let Some(i) = s.strategies.iter().position(|x| x.id == id) else { return s.err(404, "NOT_FOUND", "Resource not found or not visible", json!({})) };
        let Some(base) = if_match else { return s.precondition() };
        if s.force_conflict {
            s.remote_edit(i, crate::keys::settings::PEAK_TRAIL_PCT);
        }
        if s.strategies[i].rev != base {
            return s.strategy_conflict(i, base);
        }
        let now = s.now();
        let st = &mut s.strategies[i];
        st.status = if paused { "paused".into() } else { "active".into() };
        st.rev += 1;
        st.history.push((st.rev, vec!["status".into()], "desktop".into(), now));
        let out = st.summary();
        let kind = if paused { "strategy.paused" } else { "strategy.resumed" };
        s.emit(kind, Actor::User, id, Some(id), None, None, json!({"rev": out.rev, "base_rev": base, "status": out.status, "changed_fields": ["status"]}), Untrusted::default());
        Ok(ApiItem { data: out, server_now: IsoTs::from_ms(now) })
    }

    async fn patch_strategy(&self, id: &str, _idem_key: &str, if_match: Option<u64>, settings_patch: serde_json::Value) -> ApiResult<ApiItem<StrategySummary>> {
        let mut s = self.inner.lock().unwrap();
        let now = s.now();
        let Some(i) = s.strategies.iter().position(|x| x.id == id) else { return s.err(404, "NOT_FOUND", "Resource not found or not visible", json!({})) };
        let Some(base) = if_match else { return s.precondition() };
        if s.strategies[i].rev != base {
            return s.strategy_conflict(i, base);
        }
        let mut patch = settings_patch;
        crate::keys::normalize(&mut patch);
        let keys: Vec<String> = patch.as_object().map(|m| m.keys().cloned().collect()).unwrap_or_default();
        let st = &mut s.strategies[i];
        if let (Some(dst), Some(src)) = (st.settings.as_object_mut(), patch.as_object()) {
            for (k, v) in src {
                if v.is_null() {
                    dst.remove(k); // JSON merge: null removes a key
                } else {
                    dst.insert(k.clone(), v.clone());
                }
            }
        }
        st.rev += 1;
        st.history.push((st.rev, keys.clone(), "desktop".into(), now));
        let out = st.summary();
        s.emit("strategy.updated", Actor::User, id, Some(id), None, None, json!({"rev": out.rev, "base_rev": base, "changed_fields": keys}), Untrusted::default());
        Ok(ApiItem { data: out, server_now: IsoTs::from_ms(now) })
    }

    async fn reset_practice(&self, _idem_key: &str, if_match: Option<u64>) -> ApiResult<ApiItem<PracticeResetResponse>> {
        let mut s = self.inner.lock().unwrap();
        let now = s.now();
        // contracts: body `{}` + Idempotency-Key; no rev required (the server ignores If-Match). A
        // stale If-Match, when the desktop sends one, is still refused here as a guard.
        if let Some(base) = if_match.filter(|b| *b != s.ws_rev) {
            let cur = s.ws_rev;
            return s.err(409, "VERSION_CONFLICT", &format!("Workspace rev is {cur}"), json!({
                "current_rev": cur, "base_rev": base, "changed_fields": ["practice_epoch"], "current": {"id": WORKSPACE_ID, "rev": cur}}));
        }
        if let Some(next) = s.last_reset_ms.map(|t| t + RESET_COOLDOWN_MS).filter(|n| *n > now) {
            // HTTP also sends `Retry-After: <s>`; the in-process mock carries it as `retry_after_s`.
            let retry_after_s = ((next - now) + 999) / 1000;
            return s.err(429, "RESET_COOLDOWN", "Practice can be reset once per 24 h", json!({"next_allowed_at": IsoTs::from_ms(next), "retry_after_s": retry_after_s}));
        }
        let data = s.reset();
        Ok(ApiItem { data, server_now: IsoTs::from_ms(now) })
    }

    async fn coin_timeline(&self, mint: &str) -> ApiResult<CoinTimeline> {
        let s = self.inner.lock().unwrap();
        let items = s.log.iter().filter(|e| e.mint.as_deref() == Some(mint)).cloned().collect();
        Ok(CoinTimeline { items, server_now: IsoTs::from_ms(s.now()) })
    }

    async fn exit_reason_stats(&self, _window: &str) -> ApiResult<ApiItem<Vec<ExitReasonStat>>> {
        let s = self.inner.lock().unwrap();
        // (reason, count, pnl, sum pnl_pct, wins, sum hold_s)
        let mut agg: Vec<(ExitReason, i64, i128, f64, i64, i64)> = Vec::new();
        for e in s.log.iter().filter(|e| e.kind == "position.closed") {
            let Ok(c) = serde_json::from_value::<PositionClosed>(e.payload.clone()) else { continue };
            let win = i64::from(c.pnl_lamports.0 > 0);
            match agg.iter_mut().find(|a| a.0 == c.exit_reason) {
                Some(a) => {
                    a.1 += 1;
                    a.2 += c.pnl_lamports.0;
                    a.3 += c.pnl_pct.unwrap_or(0.0);
                    a.4 += win;
                    a.5 += c.hold_seconds;
                }
                None => agg.push((c.exit_reason, 1, c.pnl_lamports.0, c.pnl_pct.unwrap_or(0.0), win, c.hold_seconds)),
            }
        }
        let r2 = |x: f64| (x * 100.0).round() / 100.0;
        let data = agg
            .into_iter()
            .map(|(r, n, l, p, w, h)| ExitReasonStat {
                exit_reason: r,
                count: n,
                pnl_lamports: Lamports(l),
                avg_pnl_pct: Some(r2(p / n as f64)),
                win_rate_pct: Some(r2(w as f64 * 100.0 / n as f64)),
                avg_hold_s: Some(r2(h as f64 / n as f64)),
            })
            .collect();
        Ok(ApiItem { data, server_now: IsoTs::from_ms(s.now()) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending_id(t: &MockTransport) -> String {
        t.with(|s| {
            s.spawn_candidate();
            while s.proposals.is_empty() {
                s.spawn_candidate();
            }
            s.proposals.keys().next().unwrap().clone()
        })
    }

    #[tokio::test]
    async fn seq_is_monotonic_and_pages_resume() {
        let t = MockTransport::new(0);
        t.with(|s| (0..20).for_each(|_| s.spawn_candidate()));
        let mut after = 0;
        let mut last = 0;
        let mut n = 0;
        loop {
            let page = t.list_events(after, 7).await.unwrap();
            for e in &page.items {
                assert!(e.seq > last, "strictly increasing");
                last = e.seq;
                n += 1;
                assert!(KnownEvent::decode(e).unwrap().is_ok(), "mock emits valid v1 payloads: {}", e.kind);
            }
            after = page.next_after_seq.unwrap();
            if !page.has_more {
                break;
            }
        }
        assert_eq!(n, t.with(|s| s.log.len()));
    }

    #[tokio::test]
    async fn decision_needs_token_and_version_and_is_replay_safe() {
        let t = MockTransport::new(0);
        let pid = pending_id(&t);
        let bad = ApprovalDecisionRequest { decision: Decision::Approve, token: "apt_nope".into(), expected_rev: 1, reason: None, reject_reason: None };
        assert_eq!(t.decide(&pid, "k1", bad).await.unwrap_err().code(), "APPROVAL_TOKEN_INVALID");
        let a = t.get_approval(&pid).await.unwrap().data;
        let stale = ApprovalDecisionRequest { decision: Decision::Approve, token: a.decision_token.clone().unwrap(), expected_rev: 9, reason: None, reject_reason: None };
        assert_eq!(t.decide(&pid, "k2", stale).await.unwrap_err().conflict().unwrap().current_rev, Some(1));
        let ok = ApprovalDecisionRequest { decision: Decision::Approve, token: a.decision_token.unwrap(), expected_rev: a.version, reason: None, reject_reason: None };
        let r1 = t.decide(&pid, "k3", ok.clone()).await.unwrap().data;
        assert!(!r1.replayed && r1.status == ProposalStatus::Approved);
        assert!(t.decide(&pid, "k3", ok).await.unwrap().data.replayed, "same token + decision → replayed");
        assert_eq!(t.with(|s| s.positions.len()), 1);
        assert!(t.with(|s| s.cash) < START_CASH);
    }

    #[tokio::test]
    async fn strategy_writes_need_if_match_and_409_carries_merge_data() {
        let t = MockTransport::new(0);
        let id = "20000000-0000-0000-0000-00000000000a";
        assert_eq!(t.set_strategy_paused(id, "k0", None, true).await.unwrap_err(), ApiFailure::PreconditionRequired);
        let s1 = t.patch_strategy(id, "k", Some(1), json!({"peak_trail_pct": 25})).await.unwrap().data;
        assert_eq!(s1.rev, 2);
        t.with(|s| s.remote_edit(0, "status")); // mobile pauses it → rev 3
        let err = t.set_strategy_paused(id, "k2", Some(2), false).await.unwrap_err();
        let c = err.conflict().expect("409");
        assert_eq!(c.code, "STRATEGY_REV_CONFLICT");
        assert_eq!((c.current_rev, c.base_rev), (Some(3), Some(2)));
        assert_eq!(c.changed_fields, vec!["status"]);
        assert_eq!(c.changed_by.as_ref().unwrap().via.as_deref(), Some("mobile"));
        assert_eq!(c.current.as_ref().unwrap()["status"], "paused");
        // Retry on the fresh rev succeeds.
        assert_eq!(t.set_strategy_paused(id, "k3", c.current_rev, false).await.unwrap().data.status.as_deref(), Some("active"));
    }

    #[tokio::test]
    async fn not_tradeable_coin_is_refused_server_side_and_close_needs_position_rev() {
        let t = MockTransport::new(0);
        let pid = pending_id(&t);
        let mint = t.with(|s| s.proposals[&pid].mint.clone());
        // Open a position on a second pick first (tradeable), then migrate the first coin's pool.
        let a = t.get_approval(&pid).await.unwrap().data;
        t.with(|s| s.flip_to_non_sol(&mint));
        let ev = t.list_events(0, 500).await.unwrap();
        let rescored = ev.items.iter().rev().find(|e| e.kind == "screener.scored" && e.mint.as_deref() == Some(&mint)).unwrap();
        assert_eq!(rescored.payload["result"]["tradeable"], false);
        assert_eq!(rescored.payload["result"]["skip_reason"], UNSUPPORTED_QUOTE_MINT);
        let req = ApprovalDecisionRequest { decision: Decision::Approve, token: a.decision_token.unwrap(), expected_rev: a.version, reason: None, reject_reason: None };
        assert_eq!(t.decide(&pid, "k", req).await.unwrap_err().code(), UNSUPPORTED_QUOTE_MINT);
        assert!(t.list_events(0, 500).await.unwrap().items.iter().any(|e| e.kind == "order.failed" && e.payload["reason_code"] == UNSUPPORTED_QUOTE_MINT));
        assert!(t.with(|s| s.positions.is_empty()));

        // Tradeable pick → position (rev 1); close needs If-Match + fraction_bps 1..=10000.
        let pid2 = t.with(|s| {
            s.proposals.clear();
            while s.proposals.is_empty() {
                s.spawn_candidate();
            }
            s.proposals.keys().next().unwrap().clone()
        });
        let a2 = t.get_approval(&pid2).await.unwrap().data;
        t.decide(&pid2, "k2", ApprovalDecisionRequest { decision: Decision::Approve, token: a2.decision_token.unwrap(), expected_rev: a2.version, reason: None, reject_reason: None }).await.unwrap();
        let id = t.with(|s| s.positions.values().next().unwrap().id.clone());
        assert_eq!(t.close(&id, "c0", None, 5_000).await.unwrap_err(), ApiFailure::PreconditionRequired);
        let c = t.close(&id, "c1", Some(9), 5_000).await.unwrap_err();
        assert_eq!(c.conflict().unwrap().current_rev, Some(1));
        assert_eq!(c.conflict().unwrap().current.as_ref().unwrap()["rev"], 1, "error.current inside the error object");
        assert_eq!(t.close(&id, "c2", Some(1), 0).await.unwrap_err().code(), "INVALID_FRACTION");
        let r = t.close(&id, "c3", Some(1), 5_000).await.unwrap();
        assert_eq!((r.position.rev, r.status.as_str(), r.replayed), (1, "filled", false), "position at request time");
        assert!(r.fill.is_some() && r.job_id.is_some() && r.order.fraction_bps == 5_000);
        // idempotency: identical retry replays, same key + different body = 422
        assert!(t.close(&id, "c3", Some(1), 5_000).await.unwrap().replayed);
        assert_eq!(t.close(&id, "c3", Some(2), 2_500).await.unwrap_err().code(), "IDEMPOTENCY_KEY_REUSED");
        let ev = t.list_events(0, 500).await.unwrap().items;
        assert!(ev.iter().any(|e| e.kind == "order.submitted") && ev.iter().any(|e| e.kind == "order.filled" && e.payload["position_rev"] == 2));
        for e in ev.iter().filter(|e| e.kind.starts_with("order.") || e.kind.starts_with("position.")) {
            assert!(matches!(KnownEvent::decode(e), Some(Ok(_))), "{} decodes: {:?}", e.kind, KnownEvent::decode(e).map(|r| r.err()));
        }
        let upd = t.list_events(0, 500).await.unwrap().items.into_iter().rev().find(|e| e.kind == "position.updated").unwrap();
        assert!(upd.payload["cost_basis_lamports"].is_string() && upd.payload["unrealized_pnl_lamports"].is_string());
        let r = t.close(&id, "c4", Some(2), 10_000).await.unwrap();
        assert_eq!(r.position.status, "closed");
        assert_eq!(t.close(&id, "c5", Some(3), 10_000).await.unwrap_err().code(), "POSITION_ALREADY_CLOSED");
    }

    #[tokio::test]
    async fn practice_reset_restores_30_sol_and_has_cooldown() {
        let t = MockTransport::new(0);
        let pid = pending_id(&t);
        let a = t.get_approval(&pid).await.unwrap().data;
        t.decide(&pid, "k", ApprovalDecisionRequest { decision: Decision::Approve, token: a.decision_token.unwrap(), expected_rev: a.version, reason: None, reject_reason: None }).await.unwrap();
        assert_eq!(t.with(|s| s.positions.len()), 1);
        assert_eq!(t.reset_practice("r0", Some(999)).await.unwrap_err().code(), "VERSION_CONFLICT");
        let rev = t.get_workspace().await.unwrap().data.rev;
        let r = t.reset_practice("r1", Some(rev)).await.unwrap().data;
        assert_eq!(r.starting_balance_lamports, Lamports(30_000_000_000));
        assert_eq!(r.archived.closed_open_positions, 1);
        assert!(t.with(|s| s.positions.is_empty() && s.cash == START_CASH));
        let ev = t.list_events(0, 500).await.unwrap();
        assert!(ev.items.iter().any(|e| e.kind == "practice.reset"));
        assert!(ev.items.iter().any(|e| e.kind == "position.closed" && e.payload["exit_reason"] == "practice_reset"));
        let rev = t.get_workspace().await.unwrap().data.rev;
        let cd = t.reset_practice("r2", Some(rev)).await.unwrap_err();
        assert_eq!(cd.code(), "RESET_COOLDOWN");
        assert!(matches!(&cd, ApiFailure::Api { http: 429, details: Some(d), .. } if d["next_allowed_at"].is_string() && d["retry_after_s"].as_i64().is_some_and(|s| s > 0)));
        let msg = cd.to_string();
        assert!(msg.starts_with("RESET_COOLDOWN:") && msg.contains("[next_allowed_at=") && msg.contains("[retry_after_s="), "{msg}");
        let stats = t.exit_reason_stats("24h").await.unwrap().data;
        assert_eq!(stats[0].exit_reason, ExitReason::PracticeReset);
        let mint = t.with(|s| s.log.iter().find_map(|e| e.mint.clone())).unwrap();
        assert!(!t.coin_timeline(&mint).await.unwrap().items.is_empty());
    }

    #[tokio::test]
    async fn reject_reason_1_1_3_validated_sent_and_echoed() {
        let t = MockTransport::new(0);
        let pid = pending_id(&t);
        let a = t.get_approval(&pid).await.unwrap().data;
        let tok = a.decision_token.clone().unwrap();
        // approve + reject_reason → 422 VALIDATION_FAILED (mapped through errors.map.json)
        let bad = ApprovalDecisionRequest { decision: Decision::Approve, token: tok.clone(), expected_rev: a.version, reason: None, reject_reason: Some(ApprovalRejectReason::Other) };
        let e = t.decide(&pid, "rr0", bad).await.unwrap_err();
        assert_eq!(e.code(), "VALIDATION_FAILED");
        assert_eq!(crate::errmap::i18n_key(e.code()), "error.code.validation_failed");
        // unknown value / approve-with-reason are refused at body parse
        assert_eq!(parse_decision_body(&json!({"decision": "reject", "token": "t", "expected_rev": 1, "reject_reason": "bored"})).unwrap_err().code(), "VALIDATION_FAILED");
        assert_eq!(parse_decision_body(&json!({"decision": "approve", "token": "t", "expected_rev": 1, "reject_reason": "other"})).unwrap_err().code(), "VALIDATION_FAILED");
        assert!(parse_decision_body(&json!({"decision": "reject", "token": "t", "expected_rev": 1, "reject_reason": "not_tradeable"})).is_ok());
        // a skip of a not-tradeable card sends not_tradeable; it is echoed on the response + proposal.rejected
        let ok = ApprovalDecisionRequest { decision: Decision::Reject, token: tok, expected_rev: a.version, reason: None, reject_reason: Some(crate::commands::skip_reason(false)) };
        assert_eq!(serde_json::to_value(&ok).unwrap()["reject_reason"], "not_tradeable");
        let r = t.decide(&pid, "rr1", ok).await.unwrap().data;
        assert_eq!(r.reject_reason, Some(ApprovalRejectReason::NotTradeable));
        let ev = t.list_events(0, 500).await.unwrap().items.into_iter().find(|e| e.kind == "proposal.rejected").unwrap();
        assert_eq!(ev.payload["reject_reason"], "not_tradeable");
        assert!(matches!(KnownEvent::decode(&ev), Some(Ok(_))));
        // normal skip → user_declined; approve sends none
        assert_eq!(crate::commands::skip_reason(true), ApprovalRejectReason::UserDeclined);
        let ap = ApprovalDecisionRequest { decision: Decision::Approve, token: "x".into(), expected_rev: 1, reason: None, reject_reason: None };
        assert!(serde_json::to_value(&ap).unwrap().get("reject_reason").is_none());
    }
}
