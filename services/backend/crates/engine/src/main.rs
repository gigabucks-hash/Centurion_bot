//! `centurion-engine`: P1 paper-only engine (M1: supervised ingest + watchdog + Scout + view).
use std::sync::{Arc, Mutex};

use engine::config::EngineConfig;
use engine::credits::CreditMeter;
use engine::http::{serve, AppState};
use engine::latency::Latency;
use engine::lead::{Candidate, Lead};
use engine::scout::Scout;
use engine::stats::IngestStats;
use engine::strategy::{StrategyConfig, StrategyStore};
use engine::supervisor::{FeedSpec, Role, Supervisor, SupervisorConfig, Tagged};
use engine::watchdog::{StageState, Watchdog};
use ingest::backfill::BackfillConfig;
use ingest::source::helius::HeliusSource;
use ingest::source::pumpportal::PumpPortalSource;
use ingest::source::{IngestEvent, StreamSource};
use serde_json::json;
use tokio::sync::{mpsc, watch};
use tracing_subscriber::EnvFilter;

fn candidate(t: &Tagged) -> Candidate {
    let mut c = Candidate {
        mint: t.event.mint().as_str().to_string(),
        as_of_ms: t.recv_ms,
        ..Default::default()
    };
    match &t.event {
        // still on the bonding curve: not an AMM pool yet
        IngestEvent::NewCoin(_) | IngestEvent::Trade(_) => c.venue_amm = false,
        IngestEvent::Migrated { ts, .. } => {
            c.venue_amm = true;
            c.quote_is_sol = Some(true); // pump.fun graduations migrate into SOL-quoted PumpSwap pools
            c.since_migration_s = Some(((t.recv_ms - ts) / 1000).max(0));
        }
    }
    c
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(false)
        .init();
    let cfg = EngineConfig::from_env()?;
    tracing::info!(
        mode = %cfg.trading_mode,
        helius_key = if cfg.helius_api_key.is_empty() { "absent" } else { "present" },
        cap = cfg.rpc_daily_credit_cap,
        "centurion-engine starting (PAPER ONLY, real locked)"
    );
    let now = engine::now_ms();
    std::fs::create_dir_all(&cfg.data_dir)?;
    let credits = Arc::new(CreditMeter::new(
        cfg.rpc_daily_credit_cap,
        Some(cfg.data_dir.join("credits.json")),
    ));
    let wd = Arc::new(Watchdog::new(Some(cfg.data_dir.join("alerts.jsonl")), now));
    let stats = Arc::new(IngestStats::default());
    wd.register("engine.loop", Some(5_000), StageState::Up, now);
    wd.register("router", None, StageState::Standby, now);

    // strategies + hot reload
    let mut store = StrategyStore::new(&cfg.strategies_dir);
    store.poll(now);
    if store.active.is_empty() {
        return Err(format!("no valid strategy in {}", cfg.strategies_dir.display()).into());
    }
    let active: Arc<std::sync::RwLock<Vec<StrategyConfig>>> =
        Arc::new(std::sync::RwLock::new(vec![]));

    // feeds: PumpPortal primary (no RPC key passed -> zero credits), Helius WS fallback
    let mut specs = vec![FeedSpec {
        source: Arc::new(PumpPortalSource::new(
            cfg.pumpportal_ws_url.clone(),
            cfg.helius_rpc_url.clone(),
            ingest::config::Secret::from_env_value(String::new()),
        )) as Arc<dyn StreamSource>,
        role: Role::Primary,
        credits_per_new_coin: 0,
    }];
    if cfg.helius_fallback && !cfg.helius_api_key.is_empty() {
        let mut h = HeliusSource::new(cfg.helius_api_key.clone());
        h.ws_base = cfg.helius_ws_url.clone();
        h.rpc_base = cfg.helius_rpc_url.clone();
        h.backfill = BackfillConfig {
            max_signatures: 200,
            max_pages: 1,
            page_limit: 200,
            rps: 2.0,
            burst: 4.0,
            ..BackfillConfig::default()
        };
        // getTransaction per created coin (1 credit each, recorded as helius_enrich)
        specs.push(FeedSpec {
            source: Arc::new(h),
            role: Role::Fallback,
            credits_per_new_coin: 1,
        });
    } else {
        tracing::warn!("Helius fallback off (ENGINE_HELIUS_FALLBACK=false or no HELIUS_API_KEY)");
    }

    let (tx, mut rx) = mpsc::channel::<Tagged>(cfg.channel_capacity);
    let (cmd_tx, cmd_rx) = mpsc::channel(16);
    let (sd_tx, sd_rx) = watch::channel(false);
    let sup = Supervisor::new(
        SupervisorConfig {
            stall_ms: (cfg.stall_s * 1000) as i64,
            fallback_release_ms: (cfg.fallback_release_s * 1000) as i64,
            channel_capacity: cfg.channel_capacity,
        },
        specs,
        tx,
        wd.clone(),
        stats.clone(),
        credits.clone(),
        now,
    );
    let state = Arc::new(AppState {
        wd: wd.clone(),
        stats: stats.clone(),
        credits: credits.clone(),
        scout_latency: Arc::new(Latency::default()),
        e2e_latency: Arc::new(Latency::default()),
        decisions: Default::default(),
        reject_counts: Default::default(),
        strategies: Mutex::new(json!({})),
        cmds: cmd_tx,
        positions: Default::default(),
    });

    let publish = |store: &StrategyStore,
                   active: &std::sync::RwLock<Vec<StrategyConfig>>,
                   st: &AppState| {
        let list: Vec<StrategyConfig> = store.active.values().map(|l| l.config.clone()).collect();
        let summary: serde_json::Value = store
            .active
            .values()
            .map(|l| {
                (l.config.strategy_key.clone(), json!({
                    "config_rev": l.config.config_rev, "enabled": l.config.enabled, "reloads": l.reloads,
                    "mode": "paper", "real_locked": true, "real_locked_reason": l.config.real_locked_reason(),
                }))
            })
            .collect::<serde_json::Map<_, _>>()
            .into();
        if let Ok(mut s) = st.strategies.lock() {
            *s = json!({ "active": summary, "rejected": store.rejected });
        }
        if let Ok(mut a) = active.write() {
            *a = list;
        }
    };
    publish(&store, &active, &state);

    tokio::spawn(sup.run(cmd_rx, sd_rx.clone()));
    {
        let (st, addr) = (state.clone(), cfg.http_addr.clone());
        tokio::spawn(async move {
            if let Err(e) = serve(addr, st).await {
                tracing::error!(error = %e, "localhost view stopped");
            }
        });
    }
    // housekeeping: loop heartbeat, strategy hot reload (2 s), credit flush + stats line (60 s)
    {
        let (wd, st, active, credits, stats) = (
            wd.clone(),
            state.clone(),
            active.clone(),
            credits.clone(),
            stats.clone(),
        );
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_secs(2));
            let mut n = 0u64;
            loop {
                tick.tick().await;
                n += 1;
                let now = engine::now_ms();
                wd.beat("engine.loop", now);
                let rep = store.poll(now);
                if !rep.loaded.is_empty() || !rep.rejected.is_empty() {
                    publish(&store, &active, &st);
                    for r in &rep.rejected {
                        wd.alert(
                            engine::watchdog::Level::Warn,
                            "strategy",
                            "STRATEGY_REJECTED",
                            r,
                            now,
                        );
                    }
                }
                if n.is_multiple_of(30) {
                    if let Err(e) = credits.flush() {
                        tracing::warn!(error = %e, "credit meter flush failed");
                    }
                    let s = stats.snapshot();
                    tracing::info!(ingest = %serde_json::to_string(&s).unwrap_or_default(),
                        scout = %serde_json::to_string(&st.scout_latency.summary()).unwrap_or_default(),
                        credits_today = credits.snapshot(now).day_used, "engine stats");
                }
            }
        });
    }
    // router: every event -> Lead (Scout first) per enabled strategy -> decision log
    let router = {
        let (wd, st, active) = (wd.clone(), state.clone(), active.clone());
        let lead = Lead {
            modules: vec![Box::new(Scout)],
        };
        tokio::spawn(async move {
            while let Some(t) = rx.recv().await {
                wd.beat("router", engine::now_ms());
                if matches!(t.event, IngestEvent::Trade(_)) {
                    continue; // M2: swap log + price tracking on watched pools
                }
                let c = candidate(&t);
                let strategies = active.read().map(|a| a.clone()).unwrap_or_default();
                for s in strategies.iter().filter(|s| s.enabled) {
                    let d = lead.decide(&c, s);
                    st.scout_latency.record_us(d.latency_us);
                    st.e2e_latency
                        .record_us(((engine::now_ms() - t.recv_ms).max(0) as u64) * 1000);
                    st.push_decision(d);
                }
            }
        })
    };
    tokio::signal::ctrl_c().await?;
    tracing::info!("shutdown");
    let _ = sd_tx.send(true);
    router.abort();
    let _ = credits.flush();
    Ok(())
}
