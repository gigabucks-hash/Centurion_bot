//! `ingest` — coin-stream ingest service (paper mode only).
//!
//! ```text
//! ingest                       # live sources from env (stubs in Phase 1 skeleton)
//! ingest --replay <file.jsonl> # offline replay through the full pipeline
//! ```
use std::sync::Arc;

use guard::{GuardConfig, StubDataSource};
use papersim::{PaperExecutor, SimConfig};
use screener::RuleSet;
use tokio::sync::{mpsc, watch};
use tracing_subscriber::EnvFilter;

use ingest::config::Config;
use ingest::pipeline::{Pipeline, Stats};
use ingest::source::{
    pumpportal::PumpPortalSource, replay::ReplaySource, yellowstone::YellowstoneSource, CoinSource,
};

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let json = std::env::var("LOG_FORMAT")
        .map(|v| v == "json")
        .unwrap_or(false);
    let b = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false);
    if json {
        b.json().init();
    } else {
        b.init();
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    init_tracing();
    let cfg = Config::from_env()?;
    let args: Vec<String> = std::env::args().collect();
    let replay = args
        .iter()
        .position(|a| a == "--replay")
        .and_then(|i| args.get(i + 1))
        .cloned();

    let rules = RuleSet::from_json(&tokio::fs::read_to_string(&cfg.screener_rules_path).await?)?;
    tracing::info!(rules = %rules.name, pass_mark = rules.pass_mark, mode = %cfg.trading_mode, "starting ingest");

    let mut sources: Vec<Arc<dyn CoinSource>> = Vec::new();
    if let Some(path) = replay {
        sources.push(Arc::new(ReplaySource { path }));
    } else {
        if let Some(url) = cfg.yellowstone_grpc_url.clone() {
            sources.push(Arc::new(YellowstoneSource::new(
                url,
                cfg.yellowstone_x_token.clone(),
            )));
        }
        sources.push(Arc::new(PumpPortalSource {
            url: cfg.pumpportal_ws_url.clone(),
        }));
    }

    let (tx, mut rx) = mpsc::channel(cfg.channel_capacity);
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    for s in sources {
        let tx = tx.clone();
        let srx = shutdown_rx.clone();
        tokio::spawn(async move {
            if let Err(e) = s.run(tx, srx).await {
                tracing::error!(source = s.name(), error = %e, "source stopped");
            }
        });
    }
    drop(tx);

    let repo = Arc::new(db::MemoryRepo::new()); // week 2: PgRepo when DATABASE_URL is set
    let mut pipeline = Pipeline {
        workspace_id: cfg.workspace_id.clone(),
        strategy_id: cfg.strategy_id.clone(),
        rules,
        guard_cfg: GuardConfig::default(),
        guard_src: Arc::new(StubDataSource::default()),
        repo: repo.clone(),
        executor: Arc::new(PaperExecutor::new(SimConfig::default())),
        demo_buy_sol: cfg.paper_demo_buy_sol,
        stats: Stats::default(),
    };

    loop {
        tokio::select! {
            ev = rx.recv() => match ev {
                Some(ev) => {
                    if let Err(e) = pipeline.process(ev).await {
                        tracing::error!(error = %e, "pipeline error");
                    }
                }
                None => break,
            },
            _ = tokio::signal::ctrl_c() => {
                tracing::info!("shutdown requested");
                let _ = shutdown_tx.send(true);
                break;
            }
        }
    }
    let s = &pipeline.stats;
    tracing::info!(
        seen = s.seen,
        rejected = s.rejected,
        blocked = s.blocked,
        passed = s.passed,
        paper_bought = s.bought,
        trades = s.trades,
        events = repo.event_count().await,
        "ingest stopped"
    );
    Ok(())
}
