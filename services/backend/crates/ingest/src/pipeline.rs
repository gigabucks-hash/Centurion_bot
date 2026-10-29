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

use crate::source::{IngestEvent, NewCoin};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Stats {
    pub seen: u64,
    pub rejected: u64,
    pub blocked: u64,
    pub passed: u64,
    pub bought: u64,
    pub trades: u64,
    pub order_failed: u64,
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

    pub async fn process(&mut self, ev: IngestEvent) -> Result<(), PipelineError> {
        match ev {
            IngestEvent::NewCoin(c) => self.on_new_coin(*c).await,
            IngestEvent::Trade(_) | IngestEvent::Migrated { .. } => {
                // Phase 2: feed exit engine / re-check rejected coins (revisit_after_move_pct).
                self.stats.trades += 1;
                Ok(())
            }
        }
    }

    async fn on_new_coin(&mut self, c: NewCoin) -> Result<(), PipelineError> {
        self.stats.seen += 1;
        let ck = CoinKey::derive(&self.strategy_id, &c.mint);
        let snap = CoinSnapshot {
            mint: c.mint.clone(),
            venue: c.venue,
            launchpad: c.launchpad,
            creator: c.creator.clone(),
            observed_at: c.ts,
            metrics: c.metrics.clone().unwrap_or_default(),
            name: c.name.clone(),
            symbol: c.symbol.clone(),
            uri: c.uri.clone(),
            quote_mint: c.quote_mint.clone(),
            decimals: c.decimals,
            token_program: c.token_program.clone(),
        };
        self.repo.upsert_coin(&snap).await?;
        let found = self
            .event(
                &ck,
                &c.mint,
                c.ts,
                EventKind::CoinDetected,
                Actor::Ingest,
                json!({ "mint": c.mint.to_string(), "venue": c.venue, "launchpad": c.launchpad, "creator": c.creator.as_ref().map(|m| m.to_string()), "quote_mint": c.quote_mint, "decimals": c.decimals, "token_program": c.token_program }),
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
                json!({ "mint": c.mint.to_string(), "passed": false, "tradeable": sr.tradeable, "skip_reason": sr.skip_reason, "quote_mint": sr.quote_mint, "summary": sr.summary(), "rejected_by": rejected_by, "failed": failed, "result": sr }),
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
            json!({ "mint": c.mint.to_string(), "summary": sr.summary(), "score": sr, "guard_verdict": report.verdict, "guard_reasons": report.reasons }),
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
mod tests {
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
                order_failed: 0
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
        }
    }

    /// The fixture coin that passes screener + guard and gets the demo buy.
    fn passing_coin() -> NewCoin {
        let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
        let line = std::fs::read_to_string(format!("{root}/fixtures/sample_stream.jsonl"))
            .expect("fixture")
            .lines()
            .find(|l| {
                l.contains("MASi45ub7Qe4ZE36UT5G6cU4ud8Fhhe4deS4F3cw9KTA") && l.contains("new_coin")
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
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        );
    }
}
