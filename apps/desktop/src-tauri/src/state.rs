//! Single source of truth for the desktop session (paper book, queues, caches).
//! All mutation goes through `Engine` methods that return `Vec<Out>` for the event bus.

use crate::error::{AppError, AppResult};
use crate::events::Out;
use crate::model::*;
use crate::util::{now_ms, Rng};
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

pub const MAX_SIGNALS: usize = 200;
pub const MAX_ACTIVITY: usize = 1_000;
pub const MAX_TICKS_PER_MINT: usize = 3_600; // 1h at 1 tick/s
pub const CANDLE_SEC: u64 = 5;
pub const TRADE_SOL: f64 = 0.25;
pub const FEE_BPS: f64 = 125.0; // simulated swap fee, same order as the blueprint's paper fill
pub const SELL_QUOTE_TTL_MS: u64 = 15_000;

/// Window label of the always-on-top approval popup (UX DESKTOP_COMPACT_AND_POPUP §4).
pub const POPUP_LABEL: &str = "approval-popup";

/// UX rule: in REAL SOL mode the popup can never approve; it can only hand off to the main
/// window, which runs the normal Real confirmation. Enforced here in Rust (not only in the UI),
/// keyed on the *calling window label*, which the webview cannot spoof.
pub fn check_approve_origin(window_label: &str, mode: Mode) -> AppResult<()> {
    if window_label == POPUP_LABEL && mode == Mode::Real {
        return Err(AppError::Invalid("REAL SOL: approve hanya dari window utama (Buka untuk approve)".into()));
    }
    Ok(())
}

pub struct AppState {
    pub engine: Mutex<Engine>,
}

struct PendingSell {
    quote: SellQuote,
    created_ms: u64,
}

pub struct Engine {
    pub mode: Mode,
    pub connected: bool,
    pub paper_cash_sol: f64,
    pub signals: VecDeque<Signal>, // newest first
    pub positions: HashMap<String, Position>,
    pub prices: HashMap<String, f64>,
    pub ticks: HashMap<String, VecDeque<Tick>>,
    pub activity: VecDeque<ActivityEvent>, // newest first
    pub settings: Settings,
    quotes: HashMap<String, PendingSell>,
    seq: u64,
    pub rng: Rng,
}

impl Engine {
    pub fn new() -> Self {
        Self {
            mode: Mode::Practice,
            connected: false,
            paper_cash_sol: 30.0,
            signals: VecDeque::new(),
            positions: HashMap::new(),
            prices: HashMap::new(),
            ticks: HashMap::new(),
            activity: VecDeque::new(),
            settings: Settings::default(),
            quotes: HashMap::new(),
            seq: 0,
            rng: Rng::seeded(),
        }
    }

    pub fn next_id(&mut self, prefix: &str) -> String {
        self.seq += 1;
        format!("{prefix}-{}", self.seq)
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
            paper_cash_sol: self.paper_cash_sol,
        }
    }

    pub fn positions_vec(&self) -> Vec<Position> {
        let mut v: Vec<_> = self.positions.values().cloned().collect();
        v.sort_by_key(|p| std::cmp::Reverse(p.opened_at));
        v
    }

    pub fn log(&mut self, actor: Actor, kind: ActivityKind, mint: Option<&str>, symbol: Option<&str>, msg: impl Into<String>) -> Out {
        let ts = now_ms();
        self.seq += 1;
        let ev = ActivityEvent {
            id: format!("{}:{ts}:{}:{}", mint.unwrap_or("sys"), kind.as_str(), self.seq),
            ts,
            actor,
            kind,
            mint: mint.map(str::to_owned),
            symbol: symbol.map(str::to_owned),
            message: msg.into(),
        };
        self.activity.push_front(ev.clone());
        self.activity.truncate(MAX_ACTIVITY);
        Out::Activity(ev)
    }

    pub fn push_signal(&mut self, s: Signal) -> Out {
        self.signals.push_front(s.clone());
        // Drop the oldest non-pending first so pending approvals never silently vanish.
        while self.signals.len() > MAX_SIGNALS {
            if let Some(i) = self.signals.iter().rposition(|x| x.stage != Stage::Pending) {
                self.signals.remove(i);
            } else {
                self.signals.pop_back();
            }
        }
        Out::SignalNew(s)
    }

    /// Pending ids, soonest-expiring first (UX default sort). Used by tests + Week-2 "approve next".
    #[allow(dead_code)]
    pub fn pending_ids(&self) -> Vec<String> {
        let mut v: Vec<_> = self.signals.iter().filter(|s| s.stage == Stage::Pending).collect();
        v.sort_by_key(|s| s.expires_at);
        v.into_iter().map(|s| s.id.clone()).collect()
    }

    /// Batch approve (UX: batch allowed only for Practice picks).
    pub fn approve_many(&mut self, ids: &[String]) -> AppResult<Vec<Out>> {
        if self.mode != Mode::Practice {
            return Err(AppError::Invalid("batch approve is Practice-only".into()));
        }
        let mut outs = Vec::new();
        for id in ids {
            if let Ok(mut o) = self.approve(id) {
                outs.append(&mut o);
            }
        }
        Ok(outs)
    }

    fn pending_mut(&mut self, id: &str) -> AppResult<&mut Signal> {
        let now = now_ms();
        self.signals
            .iter_mut()
            .find(|s| s.id == id && s.stage == Stage::Pending && s.expires_at > now)
            .ok_or(AppError::SignalNotPending)
    }

    /// Approve = paper buy of TRADE_SOL at the current mock price minus simulated fee.
    pub fn approve(&mut self, id: &str) -> AppResult<Vec<Out>> {
        let sig = self.pending_mut(id)?;
        sig.stage = Stage::Approved;
        let sig = sig.clone();
        let mut outs = vec![Out::SignalUpdate(sig.clone())];
        outs.push(self.log(Actor::You, ActivityKind::Approved, Some(&sig.mint), Some(&sig.symbol), "Approved"));
        if self.paper_cash_sol < TRADE_SOL {
            outs.push(self.log(Actor::Executor, ActivityKind::Blocked, Some(&sig.mint), Some(&sig.symbol), "Paper cash tidak cukup"));
            return Ok(outs);
        }
        let price = *self.prices.get(&sig.mint).unwrap_or(&sig.price_usd);
        let net_sol = TRADE_SOL * (1.0 - FEE_BPS / 10_000.0);
        // Mock: treat 1 SOL = 150 USD for qty math.
        let qty = net_sol * 150.0 / price;
        self.paper_cash_sol -= TRADE_SOL;
        let entry = self.positions.entry(sig.mint.clone()).or_insert(Position {
            mint: sig.mint.clone(),
            symbol: sig.symbol.clone(),
            strategy: sig.strategy.clone(),
            qty: 0.0,
            entry_price_usd: price,
            last_price_usd: price,
            peak_price_usd: price,
            sol_in: 0.0,
            pnl_pct: 0.0,
            opened_at: now_ms(),
        });
        let total_qty = entry.qty + qty;
        entry.entry_price_usd = (entry.entry_price_usd * entry.qty + price * qty) / total_qty;
        entry.qty = total_qty;
        entry.sol_in += TRADE_SOL;
        outs.push(self.log(
            Actor::Executor,
            ActivityKind::Bought,
            Some(&sig.mint),
            Some(&sig.symbol),
            format!("Paper buy {TRADE_SOL} SOL @ {price:.3e} (fee {FEE_BPS} bps)"),
        ));
        outs.push(Out::Positions(self.positions_vec()));
        Ok(outs)
    }

    pub fn skip(&mut self, id: &str) -> AppResult<Vec<Out>> {
        let sig = self.pending_mut(id)?;
        sig.stage = Stage::Skipped;
        let sig = sig.clone();
        let log = self.log(Actor::You, ActivityKind::Skipped, Some(&sig.mint), Some(&sig.symbol), "Skipped");
        Ok(vec![Out::SignalUpdate(sig), log])
    }

    fn est_sol_out(&self, p: &Position, pct: u8) -> f64 {
        let value_sol = p.qty * p.last_price_usd / 150.0;
        value_sol * (pct as f64 / 100.0) * (1.0 - FEE_BPS / 10_000.0)
    }

    /// Step 1 of 2 for any sell: returns a short-lived one-shot nonce.
    pub fn request_sell(&mut self, mint: &str, pct: u8) -> AppResult<SellQuote> {
        if !(1..=100).contains(&pct) {
            return Err(AppError::Invalid("pct must be 1..=100".into()));
        }
        let p = self.positions.get(mint).ok_or(AppError::NoPosition)?.clone();
        let quote = SellQuote {
            nonce: self.rng.hex(32),
            mint: mint.to_owned(),
            symbol: p.symbol.clone(),
            pct,
            est_sol_out: self.est_sol_out(&p, pct),
            ttl_ms: SELL_QUOTE_TTL_MS,
        };
        let now = now_ms();
        self.quotes.retain(|_, q| now - q.created_ms < SELL_QUOTE_TTL_MS);
        self.quotes.insert(quote.nonce.clone(), PendingSell { quote: quote.clone(), created_ms: now });
        Ok(quote)
    }

    /// Step 2 of 2: consumes the nonce (replay-safe) and executes the paper sell.
    pub fn confirm_sell(&mut self, nonce: &str) -> AppResult<Vec<Out>> {
        let pending = self.quotes.remove(nonce).ok_or(AppError::QuoteInvalid)?;
        if now_ms() - pending.created_ms >= SELL_QUOTE_TTL_MS {
            return Err(AppError::QuoteInvalid);
        }
        let q = pending.quote;
        Ok(self.execute_sell(&q.mint, q.pct, Actor::You, "Manual sell"))
    }

    pub fn execute_sell(&mut self, mint: &str, pct: u8, actor: Actor, reason: &str) -> Vec<Out> {
        let Some(p) = self.positions.get(mint).cloned() else { return vec![] };
        let out_sol = self.est_sol_out(&p, pct);
        self.paper_cash_sol += out_sol;
        let sol_basis = p.sol_in * pct as f64 / 100.0;
        if pct >= 100 {
            self.positions.remove(mint);
        } else if let Some(pm) = self.positions.get_mut(mint) {
            pm.qty *= 1.0 - pct as f64 / 100.0;
            pm.sol_in -= sol_basis;
        }
        let pnl = out_sol - sol_basis;
        let log = self.log(
            actor,
            ActivityKind::Sold,
            Some(mint),
            Some(&p.symbol),
            format!("{reason}: {pct}% → {out_sol:.4} SOL (PnL {pnl:+.4} SOL, paper)"),
        );
        vec![log, Out::Positions(self.positions_vec())]
    }

    pub fn candles(&self, mint: &str) -> Vec<Candle> {
        let mut out: Vec<Candle> = Vec::new();
        if let Some(ticks) = self.ticks.get(mint) {
            for t in ticks {
                let b = t.time - t.time % CANDLE_SEC;
                match out.last_mut() {
                    Some(c) if c.time == b => {
                        c.high = c.high.max(t.price);
                        c.low = c.low.min(t.price);
                        c.close = t.price;
                    }
                    _ => out.push(Candle { time: b, open: t.price, high: t.price, low: t.price, close: t.price }),
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sig(e: &mut Engine) -> String {
        let id = e.next_id("sig");
        let now = now_ms();
        let mint = crate::util::fake_mint(&mut e.rng);
        e.prices.insert(mint.clone(), 0.001);
        e.push_signal(Signal {
            id: id.clone(),
            mint,
            symbol: "TEST".into(),
            name: "Test".into(),
            strategy: "t".into(),
            score: 80,
            pass_mark: 70,
            price_usd: 0.001,
            market_cap_usd: 1e6,
            liquidity_usd: 1e4,
            age_minutes: 1,
            reasons: vec![],
            created_at: now,
            expires_at: now + 60_000,
            stage: Stage::Pending,
            expired_reason: None,
        });
        id
    }

    #[test]
    fn approve_then_sell_requires_valid_nonce_once() {
        let mut e = Engine::new();
        let id = sig(&mut e);
        e.approve(&id).unwrap();
        assert!(e.approve(&id).is_err(), "double approve must fail");
        let mint = e.positions.keys().next().unwrap().clone();
        assert!(e.confirm_sell("bogus").is_err());
        let q = e.request_sell(&mint, 100).unwrap();
        e.confirm_sell(&q.nonce).unwrap();
        assert!(e.confirm_sell(&q.nonce).is_err(), "nonce is one-shot");
        assert!(e.positions.is_empty());
        assert!(e.paper_cash_sol < 30.0, "fees make round trip at same price a loss");
    }

    #[test]
    fn popup_cannot_approve_in_real() {
        assert!(check_approve_origin(POPUP_LABEL, Mode::Real).is_err());
        assert!(check_approve_origin(POPUP_LABEL, Mode::Practice).is_ok());
        assert!(check_approve_origin("main", Mode::Real).is_ok());
    }

    #[test]
    fn skip_marks_signal() {
        let mut e = Engine::new();
        let id = sig(&mut e);
        e.skip(&id).unwrap();
        assert!(e.pending_ids().is_empty());
    }

    #[test]
    fn batch_approve_is_practice_only() {
        let mut e = Engine::new();
        let a = sig(&mut e);
        let b = sig(&mut e);
        e.approve_many(&[a, b]).unwrap();
        assert_eq!(e.positions.len(), 2);
        e.mode = Mode::Real;
        let c = sig(&mut e);
        assert!(e.approve_many(&[c]).is_err());
    }
}
