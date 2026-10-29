//! Mock market + strategy feed. Generates fake token signals, price ticks and
//! bot activity so the terminal can be exercised with NO network, wallet or chain.
//! Replaced in Week 2 by `source::backend` (same `Out` events, real data).

use crate::events::{dispatch, Out};
use crate::model::*;
use crate::state::{AppState, Engine, MAX_TICKS_PER_MINT};
use crate::util::{fake_mint, now_ms};
use std::collections::VecDeque;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};

const SYMBOLS: &[&str] = &["ORCA", "MOTH", "KITE", "BRRR", "ZAPP", "FERN", "LUMA", "DUSK", "GLOW", "RIFT", "NOVA", "PIKO"];
const STRATS: &[&str] = &["Mock · New Pairs", "Mock · Graduated", "Mock · Pullback"];
const BLOCK_REASONS: &[&str] = &["bundled buys", "dev holds too much", "few real holders", "layered launch"];
const PASS_REASONS: &[&str] = &["liquidity ok", "volume ok", "top10 < 30%", "lp burned", "buyers 1h ok", "age ok"];
/// UX default pick TTL is 10 min; the mock uses 90 s so expiry is visible in a demo.
const SIGNAL_TTL_MS: u64 = 90_000;
const MAX_TRACKED: usize = 40;

pub fn spawn<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        {
            let st = app.state::<AppState>();
            let mut e = st.engine.lock().unwrap();
            e.connected = true;
            let msg = match e.mode {
                Mode::Practice => "Mock engine started — PRACTICE, no network/wallet",
                Mode::Real => "Mock engine started — REAL SOL preview (still mock: no network/wallet, no real orders)",
            };
            let o = e.log(Actor::System, ActivityKind::Info, None, None, msg);
            drop(e);
            dispatch(&app, vec![Out::Connection(true), o]);
        }
        let mut tick = tokio::time::interval(Duration::from_millis(1_000));
        let mut next_signal_ms = now_ms() + 1_500;
        loop {
            tick.tick().await;
            let outs = {
                let st = app.state::<AppState>();
                let mut e = st.engine.lock().unwrap();
                let mut outs = step_prices(&mut e);
                outs.extend(step_exits(&mut e));
                outs.extend(step_expiry(&mut e));
                if now_ms() >= next_signal_ms {
                    outs.extend(spawn_candidate(&mut e));
                    next_signal_ms = now_ms() + e.rng.range(4_000.0, 11_000.0) as u64;
                }
                outs
            };
            dispatch(&app, outs);
        }
    });
}

fn spawn_candidate(e: &mut Engine) -> Vec<Out> {
    let mint = fake_mint(&mut e.rng);
    let symbol = e.rng.pick(SYMBOLS).to_string();
    let price = e.rng.range(0.000_005, 0.002);
    let mut outs = vec![e.log(Actor::Screener, ActivityKind::Found, Some(&mint), Some(&symbol), "New coin from mock stream")];
    if e.rng.f64() < 0.3 {
        let why = e.rng.pick(BLOCK_REASONS).to_string();
        outs.push(e.log(Actor::Guard, ActivityKind::Blocked, Some(&mint), Some(&symbol), format!("Blocked: {why}")));
        return outs;
    }
    let score = 70 + (e.rng.next_u64() % 45) as u32;
    let mut reasons: Vec<String> = Vec::new();
    for _ in 0..3 {
        let r = e.rng.pick(PASS_REASONS).to_string();
        if !reasons.contains(&r) {
            reasons.push(r);
        }
    }
    // Seed 2 minutes of history so the chart has context immediately.
    let mut hist = VecDeque::with_capacity(MAX_TICKS_PER_MINT);
    let now_s = now_ms() / 1000;
    let mut p = price * e.rng.range(0.7, 1.0);
    for i in (1..=120).rev() {
        p *= 1.0 + e.rng.range(-0.03, 0.033);
        hist.push_back(Tick { mint: mint.clone(), time: now_s - i, price: p, volume: e.rng.range(0.0, 5.0) });
    }
    e.prices.insert(mint.clone(), p);
    e.ticks.insert(mint.clone(), hist);
    let now = now_ms();
    let id = e.next_id("sig");
    let strategy = e.rng.pick(STRATS).to_string();
    let sig = Signal {
        id,
        mint: mint.clone(),
        symbol: symbol.clone(),
        name: format!("{symbol} (mock)"),
        strategy,
        score,
        pass_mark: 70,
        price_usd: p,
        market_cap_usd: p * 1e9,
        liquidity_usd: e.rng.range(5_000.0, 60_000.0),
        age_minutes: (e.rng.next_u64() % 120) as u32,
        reasons,
        created_at: now,
        expires_at: now + SIGNAL_TTL_MS,
        stage: Stage::Pending,
        expired_reason: None,
    };
    outs.push(e.log(Actor::Screener, ActivityKind::Passed, Some(&mint), Some(&symbol), format!("Fit {score}/70")));
    outs.push(e.log(Actor::Entry, ActivityKind::Armed, Some(&mint), Some(&symbol), "Entry condition hit"));
    outs.push(e.log(Actor::Entry, ActivityKind::Proposal, Some(&mint), Some(&symbol), "Pick waiting for your approval"));
    outs.push(e.push_signal(sig));
    outs
}

fn tracked(e: &Engine) -> Vec<String> {
    let mut v: Vec<String> = e.positions.keys().cloned().collect();
    for s in e.signals.iter() {
        if v.len() >= MAX_TRACKED {
            break;
        }
        if !v.contains(&s.mint) {
            v.push(s.mint.clone());
        }
    }
    v
}

fn step_prices(e: &mut Engine) -> Vec<Out> {
    let now_s = now_ms() / 1000;
    let mut batch = Vec::new();
    for mint in tracked(e) {
        let Some(&p) = e.prices.get(&mint) else { continue };
        // Random walk with occasional pumps/dumps (memecoin-ish volatility).
        let shock = if e.rng.f64() < 0.04 { e.rng.range(-0.25, 0.35) } else { 0.0 };
        let np = (p * (1.0 + e.rng.range(-0.035, 0.038) + shock)).max(1e-10);
        e.prices.insert(mint.clone(), np);
        let t = Tick { mint: mint.clone(), time: now_s, price: np, volume: e.rng.range(0.0, 8.0) };
        let h = e.ticks.entry(mint.clone()).or_default();
        h.push_back(t.clone());
        while h.len() > MAX_TICKS_PER_MINT {
            h.pop_front();
        }
        batch.push(t);
        if let Some(pos) = e.positions.get_mut(&mint) {
            pos.last_price_usd = np;
            pos.peak_price_usd = pos.peak_price_usd.max(np);
            pos.pnl_pct = (np / pos.entry_price_usd - 1.0) * 100.0;
        }
    }
    // Drop price history for mints nobody tracks any more (bounded memory).
    let keep = tracked(e);
    e.ticks.retain(|m, _| keep.contains(m));
    e.prices.retain(|m, _| keep.contains(m));
    let mut outs = vec![Out::Ticks(batch)];
    if !e.positions.is_empty() {
        outs.push(Out::Positions(e.positions_vec()));
    }
    outs
}

/// Mock exit plan: take profit at 2x, trailing stop 20% below peak once +30%, hard stop −40%.
fn step_exits(e: &mut Engine) -> Vec<Out> {
    let mut todo = Vec::new();
    for p in e.positions.values() {
        let gain = p.last_price_usd / p.entry_price_usd;
        let from_peak = p.last_price_usd / p.peak_price_usd;
        if gain >= 2.0 {
            todo.push((p.mint.clone(), "Take profit at 2x"));
        } else if p.peak_price_usd / p.entry_price_usd >= 1.3 && from_peak <= 0.8 {
            todo.push((p.mint.clone(), "Trailing stop 20% below high"));
        } else if gain <= 0.6 {
            todo.push((p.mint.clone(), "Stop loss −40%"));
        }
    }
    todo.into_iter().flat_map(|(m, r)| e.execute_sell(&m, 100, Actor::Exit, r)).collect()
}

fn step_expiry(e: &mut Engine) -> Vec<Out> {
    let now = now_ms();
    let mut expired = Vec::new();
    for s in e.signals.iter_mut() {
        if s.stage == Stage::Pending && s.expires_at <= now {
            s.stage = Stage::Expired;
            s.expired_reason = Some("timed_out".into());
            expired.push(s.clone());
        }
    }
    let mut outs = Vec::new();
    for s in expired {
        outs.push(e.log(Actor::Entry, ActivityKind::Expired, Some(&s.mint), Some(&s.symbol), "Expired: timed_out"));
        outs.push(Out::SignalUpdate(s));
    }
    outs
}
