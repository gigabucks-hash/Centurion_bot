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
    pub stats: Stats,
}

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error(transparent)]
    Db(#[from] db::DbError),
}

impl Pipeline {
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
                // Phase 2: feed exit engine / re-check rejected coins (recheckMovePct).
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
            stream: c.stream,
            launchpad: c.launchpad,
            creator: c.creator.clone(),
            observed_at: c.ts,
            metrics: c.metrics.clone().unwrap_or_default(),
            name: c.name.clone(),
            symbol: c.symbol.clone(),
            uri: c.uri.clone(),
        };
        self.repo.upsert_coin(&snap).await?;
        let found = self
            .event(
                &ck,
                &c.mint,
                c.ts,
                EventKind::CoinDetected,
                Actor::Ingest,
                json!({ "mint": c.mint.to_string(), "stream": c.stream, "launchpad": c.launchpad, "creator": c.creator.as_ref().map(|m| m.to_string()) }),
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
            pass_mark: None,
            checks: json!([]),
            guard: json!(null),
            updated_at: c.ts,
        };

        // 1) screener
        let sr = evaluate(&self.rules, &snap);
        pick.score = Some(sr.score);
        pick.pass_mark = Some(sr.pass_mark);
        pick.checks = serde_json::to_value(&sr.checks).unwrap_or_default();
        if !sr.passed {
            self.stats.rejected += 1;
            pick.stage = PickStage::Rejected;
            self.repo.upsert_pick(&pick).await?;
            let failed: Vec<_> = sr.failed_hard().map(|c| c.reason.clone()).collect();
            let e = self.event(
                &ck,
                &c.mint,
                c.ts + 1,
                EventKind::ScreenerScored,
                Actor::Screener,
                json!({ "mint": c.mint.to_string(), "passed": false, "summary": sr.summary(), "rejected_by": failed.first(), "failed": failed, "result": sr }),
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
            stream: gi.stream.or(Some(c.stream)),
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
            if let Some(pool) = c.pool {
                let order = Order {
                    side: Side::Buy,
                    amount_in: self.demo_buy_sol,
                    max_slippage_bps: 1_500,
                };
                match self.executor.execute(&order, &pool).await {
                    Ok(f) => {
                        // pump-style tokens use 6 decimals; real decimals come from the mint (week 2)
                        let w = match f.to_wire(6) {
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
                                slippage_bps: w.slippage_bps.clone(),
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
                            json!({ "position_key": pk.0, "mint": c.mint.to_string(), "fill": w, "first_buy": true }),
                        );
                        self.repo.append_event(&e).await?;
                    }
                    Err(err) => tracing::info!(mint = %c.mint, error = %err, "paper buy rejected"),
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
    use crate::source::CoinSource;
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
                trades: 1
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
            common::units::assert_no_floats(&v);
            assert_eq!(v["mode"], "paper");
            assert!(v["seq"].is_i64());
        }
    }
}
