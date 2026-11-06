//! ingest → enrich → screener → guard → (optional paper demo buy) → events.
//!
//! Phase 2 replaces the "demo buy" with the entry state machine + job queue; the
//! shape of `process` stays the same.
use std::sync::Arc;

use common::{Actor, CoinKey, CoinSnapshot, Event, EventKind, Mint, PositionKey};
use db::{FillRecord, PickRecord, PickStage, Repo};
use guard::{assess, GuardConfig, GuardDataSource, GuardInput, Verdict};
use papersim::{Executor, Order, Side};
use screener::{evaluate, RuleSet};
use serde_json::json;
use tokio::sync::watch;

use crate::marks::{MarkBuilder, MarkPublisher};
use crate::source::{IngestEvent, NewCoin, TradeTick};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Stats {
    pub seen: u64,
    pub rejected: u64,
    pub blocked: u64,
    pub passed: u64,
    pub bought: u64,
    pub trades: u64,
    pub order_failed: u64,
    pub marks_published: u64,
    pub marks_failed: u64,
}

pub struct Pipeline {
    pub workspace_id: String,
    pub strategy_id: String,
    pub rules: RuleSet,
    pub guard_cfg: GuardConfig,
    pub guard_src: Arc<dyn GuardDataSource>,
    pub repo: Arc<dyn Repo>,
    pub executor: Arc<dyn Executor>,
    pub demo_buy_sol: f64,
    /// Workspace practice epoch stamped on position/fill payloads (the DB stamps rows itself).
    pub practice_epoch: i32,
    pub stats: Stats,
    /// Display-only mark prices to the API's SSE (`include=marks`) via Postgres NOTIFY. `None` = off.
    pub marks: Option<MarkSink>,
    /// SOL/USD reference for the indicative `mcap_usd` (same `MARKS_SOL_USD` the marks use). `None` = no USD.
    pub sol_usd: Option<f64>,
    /// Workspace "Stop buys" switch (`agent_settings.buys_paused`, docs/BUYS_PAUSED_OPTIONS.md A/A/A).
    /// `Some(true)` suppresses the paper buy and emits `order.failed` + `BUYS_PAUSED`; the pick stays
    /// `Passed`. `None` = no switch configured (paper fail-open; a real executor needs fail-closed).
    pub buys_paused: Option<watch::Receiver<bool>>,
}

/// `market_cap_lamports` (integer string), `mcap_usd` (decimal string, display-only, = the screener's
/// `mcap_usd` metric) and `mcap_as_of`, merged into coin.detected / screener.scored / pick.created.
/// 1.1.5 `mcap_source`: `curve` | `pool` (where the price came from), `unavailable` when market_cap_lamports is null.
pub fn mcap_fields(
    mc: Option<&common::MarketCap>,
    mcap_usd: Option<f64>,
    observed_at: common::TsMs,
    venue: common::Venue,
) -> serde_json::Value {
    let source = match (mc, venue) {
        (None, _) => "unavailable",
        (Some(_), common::Venue::Curve) => "curve",
        (Some(_), common::Venue::Amm) => "pool",
    };
    let usd = mcap_usd.filter(|v| v.is_finite() && *v >= 0.0);
    let as_of = mc.map(|m| m.as_of).or(usd.map(|_| observed_at));
    json!({
        "market_cap_lamports": mc.map(|m| m.lamports.to_string()),
        "mcap_usd": usd.map(|v| crate::marks::decimal(v, 2)),
        "mcap_as_of": as_of.map(crate::marks::rfc3339_ms),
        "mcap_source": source,
    })
}

fn merge(mut a: serde_json::Value, b: &serde_json::Value) -> serde_json::Value {
    if let (Some(a), Some(b)) = (a.as_object_mut(), b.as_object()) {
        for (k, v) in b {
            a.insert(k.clone(), v.clone());
        }
    }
    a
}

/// Throttled mark builder + publisher. Publish failures are counted and logged, never fatal.
pub struct MarkSink {
    pub builder: MarkBuilder,
    pub publisher: Arc<dyn MarkPublisher>,
}

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error(transparent)]
    Db(#[from] db::DbError),
}

fn server_now() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

impl Pipeline {
    async fn order_failed(
        &mut self,
        ck: &CoinKey,
        c: &NewCoin,
        p: papersim::OrderFailed,
    ) -> Result<(), PipelineError> {
        self.stats.order_failed += 1;
        let e = self
            .event(
                ck,
                &c.mint,
                c.ts + 3,
                EventKind::OrderFailed,
                Actor::Executor,
                serde_json::to_value(&p).unwrap_or_default(),
            )
            .with_untrusted_symbol(&c.name, &c.symbol);
        self.repo.append_event(&e).await?;
        Ok(())
    }

    fn event(
        &self,
        ck: &CoinKey,
        mint: &Mint,
        ts: i64,
        kind: EventKind,
        actor: Actor,
        data: serde_json::Value,
    ) -> Event {
        let mut e = Event::new(self.workspace_id.clone(), &ck.0, ts, kind, actor, data);
        e.ck = Some(ck.0.clone());
        e.mint = Some(mint.to_string());
        e.strategy_id = Some(self.strategy_id.clone());
        e
    }

    async fn publish_mark(&mut self, t: &TradeTick) {
        let Some(sink) = self.marks.as_mut() else {
            return;
        };
        let Some(m) = sink.builder.mark(t) else {
            return;
        };
        let res = match sink.builder.payload(&m) {
            Ok(p) => sink.publisher.publish(&p).await,
            Err(e) => Err(e),
        };
        match res {
            Ok(()) => self.stats.marks_published += 1,
            Err(e) => {
                self.stats.marks_failed += 1;
                tracing::warn!(error = %e, mint = %m.mint, "mark publish failed");
            }
        }
    }

    pub async fn process(&mut self, ev: IngestEvent) -> Result<(), PipelineError> {
        match ev {
            IngestEvent::NewCoin(c) => self.on_new_coin(*c).await,
            IngestEvent::Trade(t) => {
                // Phase 2: feed exit engine / re-check rejected coins (revisit_after_move_pct).
                self.stats.trades += 1;
                self.publish_mark(&t).await;
                Ok(())
            }
            IngestEvent::Migrated { .. } => Ok(()),
        }
    }

    async fn on_new_coin(&mut self, c: NewCoin) -> Result<(), PipelineError> {
        self.stats.seen += 1;
        let ck = CoinKey::derive(&self.strategy_id, &c.mint);
        // One market-cap computation feeds both the screener metric and the wire fields.
        let market_cap = c.pool.as_ref().and_then(|p| {
            common::market_cap(
                p.mid_price(),
                c.total_supply,
                c.decimals,
                self.sol_usd,
                c.ts,
            )
        });
        let mut metrics = c.metrics.clone().unwrap_or_default();
        if let Some(usd) = market_cap.and_then(|m| m.usd) {
            metrics.mcap_usd = Some(usd);
        }
        let mcap = mcap_fields(market_cap.as_ref(), metrics.mcap_usd, c.ts, c.venue);
        let snap = CoinSnapshot {
            mint: c.mint.clone(),
            venue: c.venue,
            launchpad: c.launchpad,
            creator: c.creator.clone(),
            observed_at: c.ts,
            metrics,
            name: c.name.clone(),
            symbol: c.symbol.clone(),
            uri: c.uri.clone(),
            quote_mint: c.quote_mint.clone(),
            decimals: c.decimals,
            token_program: c.token_program.clone(),
            market_cap,
        };
        self.repo.upsert_coin(&snap).await?;
        let found = self
            .event(
                &ck,
                &c.mint,
                c.ts,
                EventKind::CoinDetected,
                Actor::Ingest,
                merge(json!({ "mint": c.mint.to_string(), "venue": c.venue, "launchpad": c.launchpad, "creator": c.creator.as_ref().map(|m| m.to_string()), "quote_mint": c.quote_mint, "decimals": c.decimals, "token_program": c.token_program }), &mcap),
            )
            .with_untrusted_symbol(&c.name, &c.symbol);
        self.repo.append_event(&found).await?;

        let mut pick = PickRecord {
            ck: ck.clone(),
            workspace_id: self.workspace_id.clone(),
            strategy_id: self.strategy_id.clone(),
            mint: c.mint.clone(),
            stage: PickStage::Found,
            score: None,
            score_threshold: None,
            checks: json!([]),
            guard: json!(null),
            market_cap,
            updated_at: c.ts,
        };

        // 1) screener
        let sr = evaluate(&self.rules, &snap);
        pick.score = Some(sr.score);
        pick.score_threshold = Some(sr.score_threshold);
        pick.checks = serde_json::to_value(&sr.checks).unwrap_or_default();
        if !sr.passed {
            self.stats.rejected += 1;
            pick.stage = PickStage::Rejected;
            self.repo.upsert_pick(&pick).await?;
            let failed: Vec<_> = sr.failed_hard().map(|c| c.reason.clone()).collect();
            let rejected_by = match &sr.skip_reason {
                Some(code) => Some(code.clone()),
                None => failed.first().cloned(),
            };
            let e = self.event(
                &ck,
                &c.mint,
                c.ts + 1,
                EventKind::ScreenerScored,
                Actor::Screener,
                merge(json!({ "mint": c.mint.to_string(), "passed": false, "tradeable": sr.tradeable, "skip_reason": sr.skip_reason, "quote_mint": sr.quote_mint, "summary": sr.summary(), "rejected_by": rejected_by, "failed": failed, "result": sr }), &mcap),
            );
            self.repo.append_event(&e).await?;
            tracing::debug!(mint = %c.mint, summary = %sr.summary(), "rejected");
            return Ok(());
        }

        // 2) guard (fixture input if present, else data source)
        let gi: GuardInput = match c.guard.clone() {
            Some(g) => g,
            None => match self.guard_src.fetch(&c.mint).await {
                Ok(g) => g,
                Err(e) => {
                    tracing::warn!(mint = %c.mint, error = %e, "guard data unavailable; assessing with empty input");
                    GuardInput::default()
                }
            },
        };
        let gi = GuardInput {
            venue: gi.venue.or(Some(c.venue)),
            ..gi
        };
        let report = assess(&self.guard_cfg, &gi);
        pick.guard = serde_json::to_value(&report).unwrap_or_default();
        if report.verdict == Verdict::Fail {
            self.stats.blocked += 1;
            pick.stage = PickStage::Blocked;
            self.repo.upsert_pick(&pick).await?;
            let e = self.event(
                &ck,
                &c.mint,
                c.ts + 2,
                EventKind::GuardResult,
                Actor::Guard,
                json!({ "mint": c.mint.to_string(), "verdict": report.verdict, "risk_score": report.risk_score, "reasons": report.reasons, "checks": report.checks }),
            );
            self.repo.append_event(&e).await?;
            return Ok(());
        }

        self.stats.passed += 1;
        pick.stage = PickStage::Passed;
        let e = self.event(
            &ck,
            &c.mint,
            c.ts + 2,
            EventKind::PickCreated,
            Actor::Screener,
            merge(json!({ "mint": c.mint.to_string(), "summary": sr.summary(), "score": sr, "guard_verdict": report.verdict, "guard_reasons": report.reasons }), &mcap),
        );
        self.repo.append_event(&e).await?;

        // 3) optional paper demo buy (Phase 2: entry state machine + approvals decide instead)
        if self.demo_buy_sol > 0.0 {
            let order = Order {
                side: Side::Buy,
                amount_in: self.demo_buy_sol,
                max_slippage_bps: 1_500,
            };
            let order_id = format!("{}:buy:0", ck.0);
            let Some(decimals) = c.decimals else {
                // decimals come from the mint account only; never assumed
                let p = papersim::order_failed(
                    &order_id,
                    None,
                    &c.mint.to_string(),
                    &order,
                    0,
                    common::ErrorCode::PoolStale,
                    "mint decimals unknown (mint account not read)".into(),
                    c.pool.as_ref(),
                    c.quote_mint.as_deref(),
                    server_now(),
                );
                self.order_failed(&ck, &c, p).await?;
                self.repo.upsert_pick(&pick).await?;
                return Ok(());
            };
            // Stop buys: the pick was valid, so it stays `Passed`; nothing executes and the operator sees
            // an order failure with a stable reason instead of a silent drop. Checked after decimals (the
            // failure wire needs them) and before the pool branch, so "paused" wins over pool staleness.
            if self.buys_paused.as_ref().is_some_and(|r| *r.borrow()) {
                tracing::info!(mint = %c.mint, "paper buy suppressed: buys paused");
                let p = papersim::order_failed(
                    &order_id,
                    None,
                    &c.mint.to_string(),
                    &order,
                    decimals,
                    common::ErrorCode::BuysPaused,
                    "buys are paused for this workspace".into(),
                    c.pool.as_ref(),
                    c.quote_mint.as_deref(),
                    server_now(),
                );
                self.order_failed(&ck, &c, p).await?;
                self.repo.upsert_pick(&pick).await?;
                return Ok(());
            }
            let Some(pool) = c.pool else {
                // no usable pool (non-SOL quote, or not fetched / stale): report, never convert
                let code = papersim::no_pool_reason(c.quote_mint.as_deref());
                let p = papersim::order_failed(
                    &order_id,
                    None,
                    &c.mint.to_string(),
                    &order,
                    decimals,
                    code,
                    "no SOL pool state for this coin".into(),
                    None,
                    c.quote_mint.as_deref(),
                    server_now(),
                );
                self.order_failed(&ck, &c, p).await?;
                self.repo.upsert_pick(&pick).await?;
                return Ok(());
            };
            {
                match self.executor.execute(&order, &pool).await {
                    Ok(f) => {
                        let w = match f.to_wire(decimals) {
                            Ok(w) => w,
                            Err(e) => {
                                tracing::warn!(mint = %c.mint, error = %e, "fill not representable on the wire");
                                return Ok(());
                            }
                        };
                        self.stats.bought += 1;
                        pick.stage = PickStage::Bought;
                        let pk = PositionKey::new(&ck, 0);
                        self.repo
                            .record_fill(&FillRecord {
                                position_key: pk.0.clone(),
                                workspace_id: self.workspace_id.clone(),
                                side: "buy",
                                simulated: true,
                                tx_sig: None,
                                sol_lamports: w.sol_lamports,
                                token_amount_raw: w.token_amount_raw,
                                exec_price_sol: w.exec_price_sol.clone(),
                                swap_fee_lamports: w.swap_fee_lamports,
                                network_fee_lamports: w.network_fee_lamports,
                                slippage_bps: w.slippage_bps,
                                latency_ms: w.latency_ms,
                                ts: c.ts + 3,
                            })
                            .await?;
                        let e = self.event(
                            &ck,
                            &c.mint,
                            c.ts + 3,
                            EventKind::PositionOpened,
                            Actor::Executor,
                            json!({ "position_key": pk.0, "rev": 1, "practice_epoch": self.practice_epoch, "mint": c.mint.to_string(), "decimals": decimals, "token_program": c.token_program, "fill": w, "first_buy": true }),
                        );
                        self.repo.append_event(&e).await?;
                    }
                    Err(err) => {
                        tracing::info!(mint = %c.mint, error = %err, "paper buy rejected");
                        let p = papersim::order_failed_from(
                            &order_id,
                            None,
                            &c.mint.to_string(),
                            &order,
                            decimals,
                            &pool,
                            &err,
                            server_now(),
                        );
                        self.order_failed(&ck, &c, p).await?;
                    }
                }
            }
        }
        self.repo.upsert_pick(&pick).await?;
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::source::replay::ReplaySource;
    use crate::source::StreamSource;
    use db::MemoryRepo;
    use guard::StubDataSource;
    use papersim::PaperExecutor;
    use tokio::sync::{mpsc, watch};

    #[tokio::test]
    async fn replay_fixture_end_to_end() {
        let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
        let rules = RuleSet::from_json(
            &std::fs::read_to_string(format!("{root}/config/screener.example.json"))
                .expect("rules"),
        )
        .expect("valid");
        let repo = Arc::new(MemoryRepo::new());
        let mut p = Pipeline {
            workspace_id: "ws".into(),
            strategy_id: "s".into(),
            rules,
            guard_cfg: GuardConfig::default(),
            guard_src: Arc::new(StubDataSource::default()),
            repo: repo.clone(),
            executor: Arc::new(PaperExecutor::default()),
            demo_buy_sol: 0.25,
            practice_epoch: 0,
            stats: Stats::default(),
            marks: None,
            sol_usd: None,
            buys_paused: None,
        };
        let (tx, mut rx) = mpsc::channel(64);
        let (_stx, srx) = watch::channel(false);
        let src = ReplaySource {
            path: format!("{root}/fixtures/sample_stream.jsonl"),
        };
        src.run(tx, srx).await.expect("replay");
        while let Some(ev) = rx.recv().await {
            p.process(ev).await.expect("process");
        }
        assert_eq!(
            p.stats,
            Stats {
                seen: 4,
                rejected: 1,
                blocked: 2,
                passed: 1,
                bought: 1,
                trades: 1,
                order_failed: 0,
                marks_published: 0,
                marks_failed: 0
            }
        );
        let fills = repo.fills().await;
        assert_eq!(fills.len(), 1);
        assert!(fills[0].simulated && fills[0].tx_sig.is_none());
        // found + verdict per coin, + bought for the passing one
        assert_eq!(repo.event_count().await, 4 * 2 + 1);
        // contract: every event serializes with no floats and the v1 envelope
        for e in repo.all_events().await {
            let v = serde_json::to_value(&e).expect("ser");
            common::units::assert_wire_numbers(&v);
            assert_eq!(v["mode"], "practice");
            assert!(
                v["seq"].as_str().is_some_and(|s| s.parse::<i64>().is_ok()),
                "seq is an int64 string"
            );
        }
    }

    fn pipeline(repo: Arc<MemoryRepo>) -> Pipeline {
        let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
        let rules = RuleSet::from_json(
            &std::fs::read_to_string(format!("{root}/config/screener.example.json"))
                .expect("rules"),
        )
        .expect("valid");
        Pipeline {
            workspace_id: "ws".into(),
            strategy_id: "s".into(),
            rules,
            guard_cfg: GuardConfig::default(),
            guard_src: Arc::new(StubDataSource::default()),
            repo,
            executor: Arc::new(PaperExecutor::default()),
            demo_buy_sol: 0.25,
            practice_epoch: 0,
            stats: Stats::default(),
            marks: None,
            sol_usd: None,
            buys_paused: None,
        }
    }

    /// The fixture coin that passes screener + guard and gets the demo buy.
    fn passing_coin() -> NewCoin {
        let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
        let line = std::fs::read_to_string(format!("{root}/fixtures/sample_stream.jsonl"))
            .expect("fixture")
            .lines()
            .find(|l| {
                l.contains("7825dQ14LvPzUkfoVrUZCk52nuvZdUH4kCk4fEFPSkPc") && l.contains("new_coin")
            })
            .expect("line")
            .to_string();
        match serde_json::from_str::<IngestEvent>(&line).expect("event") {
            IngestEvent::NewCoin(c) => *c,
            _ => panic!("not a coin"),
        }
    }

    async fn events_of(repo: &MemoryRepo, kind: &str) -> Vec<serde_json::Value> {
        repo.all_events()
            .await
            .into_iter()
            .map(|e| serde_json::to_value(&e).expect("ser"))
            .filter(|v| v["type"] == kind)
            .collect()
    }

    /// Run a source-produced coin through screener + guard + demo buy. Screener/guard inputs come
    /// from the passing fixture coin; the mint facts (mint, decimals, token program, pool, quote)
    /// come from `c`. Returns every emitted event as wire JSON.
    pub(crate) async fn run_coin_through_demo_buy(c: NewCoin) -> Vec<serde_json::Value> {
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        let mut base = passing_coin();
        base.mint = c.mint;
        base.decimals = c.decimals;
        base.token_program = c.token_program;
        base.pool = c.pool;
        base.quote_mint = c.quote_mint;
        p.process(IngestEvent::NewCoin(Box::new(base)))
            .await
            .expect("process");
        repo.all_events()
            .await
            .into_iter()
            .map(|e| serde_json::to_value(&e).expect("ser"))
            .collect()
    }

    const PUMP_QUOTE: &str = "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn";

    #[tokio::test]
    async fn non_sol_quote_is_flagged_by_screener_and_never_filled() {
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        let mut c = passing_coin();
        c.quote_mint = Some(PUMP_QUOTE.into());
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        assert_eq!(p.stats.rejected, 1);
        assert_eq!(p.stats.bought, 0);
        assert!(repo.fills().await.is_empty());
        let s = events_of(&repo, "screener.scored").await;
        assert_eq!(s.len(), 1);
        let pl = &s[0]["payload"];
        assert_eq!(pl["tradeable"], false);
        assert_eq!(pl["skip_reason"], "UNSUPPORTED_QUOTE_MINT");
        assert_eq!(pl["rejected_by"], "UNSUPPORTED_QUOTE_MINT");
        assert_eq!(pl["quote_mint"], PUMP_QUOTE);
        assert_eq!(pl["result"]["tradeable"], false);
        let d = events_of(&repo, "coin.detected").await;
        assert_eq!(d[0]["payload"]["quote_mint"], PUMP_QUOTE);
    }

    #[tokio::test]
    async fn buys_paused_suppresses_the_buy_but_keeps_the_pick_passed() {
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        let (_tx, rx) = watch::channel(true);
        p.buys_paused = Some(rx);
        let c = passing_coin();
        let ck = CoinKey::derive(&p.strategy_id, &c.mint);
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");

        assert_eq!(p.stats.bought, 0, "nothing is executed while paused");
        assert_eq!(p.stats.order_failed, 1);
        assert!(repo.fills().await.is_empty(), "no fill row");
        assert!(
            events_of(&repo, "position.opened").await.is_empty(),
            "no position is opened"
        );

        let f = events_of(&repo, "order.failed").await;
        assert_eq!(f.len(), 1);
        let pl = &f[0]["payload"];
        assert_eq!(pl["reason_code"], "BUYS_PAUSED");
        assert_eq!(pl["side"], "buy");
        assert_eq!(pl["amount_lamports"], "250000000");
        assert_eq!(pl["mode"], "practice");
        assert!(pl["server_now"].is_string());
        assert!(
            f[0]["untrusted"]["symbol"].is_string(),
            "symbol still travels as untrusted"
        );
        common::units::assert_wire_numbers(&f[0]);

        let pick = repo.get_pick(&ck).await.expect("pick");
        assert_eq!(
            pick.stage,
            PickStage::Passed,
            "the valid pick is not marked Bought"
        );

        // Unpaused: the same coin fills on a fresh pipeline.
        let repo2 = Arc::new(MemoryRepo::new());
        let mut p2 = pipeline(repo2.clone());
        let (_tx2, rx2) = watch::channel(false);
        p2.buys_paused = Some(rx2);
        p2.process(IngestEvent::NewCoin(Box::new(passing_coin())))
            .await
            .expect("process");
        assert_eq!(p2.stats.bought, 1, "unpaused buys fill");
        assert_eq!(repo2.fills().await.len(), 1);
    }

    #[tokio::test]
    async fn buys_paused_wins_over_a_missing_pool() {
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        let (_tx, rx) = watch::channel(true);
        p.buys_paused = Some(rx);
        let mut c = passing_coin();
        c.pool = None;
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        let f = events_of(&repo, "order.failed").await;
        assert_eq!(f.len(), 1);
        assert_eq!(
            f[0]["payload"]["reason_code"], "BUYS_PAUSED",
            "the operator's pause is the reported reason, not POOL_STALE"
        );
    }

    #[tokio::test]
    async fn rejected_paper_fill_emits_order_failed() {
        // (1) no pool at all -> POOL_STALE
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        let mut c = passing_coin();
        c.pool = None;
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        let f = events_of(&repo, "order.failed").await;
        assert_eq!(f.len(), 1);
        let pl = &f[0]["payload"];
        assert_eq!(pl["reason_code"], "POOL_STALE");
        assert_eq!(pl["side"], "buy");
        assert_eq!(pl["amount_lamports"], "250000000");
        assert_eq!(pl["mode"], "practice");
        assert!(pl["server_now"].is_string());
        assert!(
            f[0]["untrusted"]["symbol"].is_string(),
            "symbol travels as untrusted"
        );
        common::units::assert_wire_numbers(&f[0]);
        assert_eq!(p.stats.order_failed, 1);

        // (2) a pool quoted in another mint reaching the executor -> papersim rejects it
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        let mut c = passing_coin();
        if let Some(pool) = c.pool.as_mut() {
            pool.quote = common::QuoteAsset::parse(PUMP_QUOTE).expect("q");
        }
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        assert!(repo.fills().await.is_empty());
        let f = events_of(&repo, "order.failed").await;
        assert_eq!(f[0]["payload"]["reason_code"], "UNSUPPORTED_QUOTE_MINT");
        assert_eq!(f[0]["payload"]["quote_mint"], PUMP_QUOTE);

        // (3) decimals unknown (mint account not read) -> never assume 6: POOL_STALE, no fill
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        let mut c = passing_coin();
        c.decimals = None;
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        assert!(repo.fills().await.is_empty());
        let f = events_of(&repo, "order.failed").await;
        assert_eq!(f[0]["payload"]["reason_code"], "POOL_STALE");
    }

    #[tokio::test]
    async fn coin_detected_carries_decimals_and_token_program() {
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        p.process(IngestEvent::NewCoin(Box::new(passing_coin())))
            .await
            .expect("process");
        let d = events_of(&repo, "coin.detected").await;
        assert_eq!(d[0]["payload"]["decimals"], 6);
        assert_eq!(
            d[0]["payload"]["token_program"],
            "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        );
    }

    #[tokio::test]
    async fn market_cap_fields_match_the_screener_mcap_metric() {
        // Fixture coin: pool 85 SOL / 2e8 tokens, 6 decimals. Supply 1e9 whole tokens -> 425 SOL.
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        p.sol_usd = Some(500.0); // 425 SOL x 500 = 212,500 USD: inside the screener's 60k..3M band
        let mut c = passing_coin();
        c.total_supply = Some(1_000_000_000_000_000);
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        let want = common::market_cap(
            85.0 / 200_000_000.0,
            Some(1_000_000_000_000_000),
            Some(6),
            Some(500.0),
            0,
        )
        .expect("mcap");
        assert_eq!(want.lamports, 425_000_000_000);
        for kind in ["coin.detected", "pick.created"] {
            let e = events_of(&repo, kind).await;
            let pl = &e[0]["payload"];
            assert_eq!(pl["market_cap_lamports"], "425000000000", "{kind}");
            assert_eq!(pl["mcap_usd"], "212500", "{kind}");
            assert_eq!(pl["mcap_as_of"], "2025-10-29T01:06:40.000Z", "{kind}");
            assert!(
                pl["mcap_source"] == "curve" || pl["mcap_source"] == "pool",
                "{kind}"
            );
        }
        // the screener measured the same value (fixture said 350000; the computed value wins)
        let pick = &events_of(&repo, "pick.created").await[0]["payload"]["score"]["checks"];
        let m = pick
            .as_array()
            .expect("checks")
            .iter()
            .find(|c| c["id"] == "mcap")
            .expect("mcap check");
        assert_eq!(m["measured"], 212_500.0);

        // too small once computed: the screener rejects on the computed mcap, and says so
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        p.sol_usd = Some(50.0); // 21,250 USD < 60k
        let mut c = passing_coin();
        c.total_supply = Some(1_000_000_000_000_000);
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        let s = events_of(&repo, "screener.scored").await;
        assert_eq!(s[0]["payload"]["passed"], false);
        assert_eq!(s[0]["payload"]["mcap_usd"], "21250");
        assert_eq!(s[0]["payload"]["market_cap_lamports"], "425000000000");
    }

    #[tokio::test]
    async fn market_cap_is_null_when_supply_or_decimals_unknown() {
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        p.sol_usd = Some(500.0);
        let mut c = passing_coin();
        c.total_supply = None; // unread supply: no lamports; USD stays the source's metric
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        let d = &events_of(&repo, "coin.detected").await[0]["payload"];
        assert_eq!(d["market_cap_lamports"], serde_json::Value::Null);
        assert_eq!(d["mcap_usd"], "350000");
        let repo = Arc::new(MemoryRepo::new());
        let mut p = pipeline(repo.clone());
        let mut c = passing_coin();
        c.total_supply = Some(1);
        c.decimals = None;
        c.metrics = None;
        p.process(IngestEvent::NewCoin(Box::new(c)))
            .await
            .expect("process");
        let d = &events_of(&repo, "coin.detected").await[0]["payload"];
        assert_eq!(d["market_cap_lamports"], serde_json::Value::Null);
        assert_eq!(d["mcap_usd"], serde_json::Value::Null);
        assert_eq!(d["mcap_as_of"], serde_json::Value::Null);
        assert_eq!(d["mcap_source"], "unavailable");
    }

    #[tokio::test]
    async fn trades_publish_throttled_marks_and_failures_are_not_fatal() {
        use crate::marks::{MarkError, MemoryMarkPublisher};
        use common::QuoteAsset;
        use papersim::PoolState;
        struct Failing;
        #[async_trait::async_trait]
        impl MarkPublisher for Failing {
            async fn publish(&self, _: &str) -> Result<(), MarkError> {
                Err(MarkError::Publish("down".into()))
            }
        }
        let ws = "10000000-0000-0000-0000-0000000000a1";
        let tick = |ts| {
            IngestEvent::Trade(TradeTick {
                mint: Mint::parse("Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump").expect("test"),
                side: Side::Buy,
                sol: 0.1,
                tokens: 1.0,
                trader: "t".into(),
                ts,
                pool: Some(PoolState {
                    sol_reserve: 30.0,
                    token_reserve: 1e9,
                    quote: QuoteAsset::Sol,
                }),
            })
        };
        let mem = Arc::new(MemoryMarkPublisher::default());
        let mut p = pipeline(Arc::new(MemoryRepo::new()));
        p.marks = Some(MarkSink {
            builder: MarkBuilder::new(ws, Some(150.0), 1000).expect("test"),
            publisher: mem.clone(),
        });
        for ts in [1_000, 1_400, 2_100] {
            p.process(tick(ts)).await.expect("test");
        }
        assert_eq!(p.stats.trades, 3);
        assert_eq!(p.stats.marks_published, 2);
        let sent = mem.sent.lock().await;
        let v: serde_json::Value = serde_json::from_str(&sent[0]).expect("test");
        assert_eq!(v["workspace_id"], ws);
        assert_eq!(v["mark"]["price_usd"], "0.0000045");
        drop(sent);

        p.marks = Some(MarkSink {
            builder: MarkBuilder::new(ws, Some(150.0), 0).expect("test"),
            publisher: Arc::new(Failing),
        });
        p.process(tick(5_000)).await.expect("test");
        assert_eq!(p.stats.marks_failed, 1);
    }
}
