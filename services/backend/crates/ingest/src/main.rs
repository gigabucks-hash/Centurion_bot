//! `ingest` — coin-stream ingest service (paper mode only).
//!
//! ```text
//! ingest                       # sources from INGEST_SOURCES (default: helius when HELIUS_API_KEY is set)
//! ingest --replay <file.jsonl> # offline replay through the full pipeline
//! ```
use std::sync::Arc;

use guard::{GuardConfig, StubDataSource};
use papersim::{PaperExecutor, SimConfig};
use screener::RuleSet;
use tokio::sync::{mpsc, watch};
use tracing_subscriber::EnvFilter;

use ingest::config::Config;
use ingest::marks::{MarkBuilder, PgMarkPublisher};
use ingest::pipeline::{MarkSink, Pipeline, Stats};
use ingest::source::helius::HeliusSource;
use ingest::source::{
    pumpportal::PumpPortalSource, replay::ReplaySource, yellowstone::YellowstoneSource,
    StreamSource,
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

/// Marks need a uuid workspace, a SOL/USD reference and a database; otherwise they stay off.
async fn marks_sink(cfg: &Config) -> Option<MarkSink> {
    let builder = MarkBuilder::new(
        &cfg.workspace_id,
        cfg.marks_sol_usd,
        cfg.marks_min_interval_ms,
    )?;
    if cfg.database_url.is_empty() {
        tracing::info!("marks off: DATABASE_URL not set");
        return None;
    }
    match PgMarkPublisher::connect(cfg.database_url.expose(), &cfg.marks_channel).await {
        Ok(p) => {
            tracing::info!(channel = %cfg.marks_channel, "marks on (pg_notify)");
            Some(MarkSink {
                builder,
                publisher: Arc::new(p),
            })
        }
        Err(e) => {
            tracing::warn!(error = %e, "marks off: publisher unavailable");
            None
        }
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
    tracing::info!(rules = %rules.name, score_threshold = rules.score_threshold, mode = %cfg.trading_mode, "starting ingest");

    let mut sources: Vec<Arc<dyn StreamSource>> = Vec::new();
    if let Some(path) = replay {
        sources.push(Arc::new(ReplaySource { path }));
    } else {
        for s in &cfg.sources {
            match s.as_str() {
                "helius" => {
                    let mut h = HeliusSource::new(cfg.helius_api_key.clone());
                    h.ws_base = cfg.helius_ws_url.clone();
                    h.rpc_base = cfg.helius_rpc_url.clone();
                    sources.push(Arc::new(h));
                }
                // read-only mint/curve reads use the Helius RPC key when set
                "pumpportal" => sources.push(Arc::new(PumpPortalSource::new(
                    cfg.pumpportal_ws_url.clone(),
                    cfg.helius_rpc_url.clone(),
                    cfg.helius_api_key.clone(),
                ))),
                // pending Boss's provider choice: returns NotConfigured / NotImplemented
                "yellowstone" => sources.push(Arc::new(YellowstoneSource::new(
                    cfg.yellowstone_grpc_url.clone().unwrap_or_default(),
                    cfg.yellowstone_x_token.clone(),
                ))),
                _ => {}
            }
        }
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
        practice_epoch: 0,
        stats: Stats::default(),
        marks: marks_sink(&cfg).await,
        sol_usd: cfg.marks_sol_usd,
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
        marks = s.marks_published,
        marks_failed = s.marks_failed,
        events = repo.event_count().await,
        "ingest stopped"
    );
    Ok(())
}
