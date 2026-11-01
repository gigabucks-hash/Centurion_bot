//! PumpPortal WebSocket source (bonding-curve venue).
//!
//! Protocol (public docs): connect to `wss://pumpportal.fun/api/data`, then send
//! `{"method":"subscribeNewToken"}` and `{"method":"subscribeMigration"}`. Use ONE
//! connection for all subscriptions (PumpPortal bans per-connection spam).
//!
//! PumpPortal frames carry no decimals or token program, so every `create` goes through the
//! same read-only mint-cache path as the Helius source ([`attach_mint`]): `getAccountInfo` on
//! the mint, cached. When `bondingCurveKey` is present the curve account is read too, so the
//! pool and `quote_mint` come from chain state (non-SOL quotes get no pool). Without an RPC key
//! (or if the read fails) `decimals` stays unknown and the pipeline emits `order.failed
//! POOL_STALE` instead of filling.

use async_trait::async_trait;
use common::{Launchpad, Mint, TsMs, Untrusted, Venue};
use futures_util::{SinkExt, StreamExt};
use papersim::{PoolState, Side};
use serde::Deserialize;
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message;

use super::helius::{
    backoff, now_ms, RpcAccountFetcher, CURVE_CACHE_CAPACITY, CURVE_CACHE_MAX_SLOT_LAG,
    CURVE_CACHE_TTL_MS,
};
use super::{IngestEvent, NewCoin, SourceError, StreamSource, TradeTick};
use crate::config::Secret;
use crate::curve::{attach_mint, AccountFetcher, CurveCache};

pub struct PumpPortalSource {
    pub url: String,
    /// HTTPS RPC base for read-only `getAccountInfo` (key appended from `HELIUS_API_KEY`).
    pub rpc_base: String,
    pub api_key: Secret,
    /// Curve + mint caches (same types the Helius source uses).
    pub curves: tokio::sync::Mutex<CurveCache>,
}

impl PumpPortalSource {
    pub fn new(url: String, rpc_base: String, api_key: Secret) -> Self {
        Self {
            url,
            rpc_base,
            api_key,
            curves: tokio::sync::Mutex::new(CurveCache::new(
                CURVE_CACHE_CAPACITY,
                CURVE_CACHE_TTL_MS,
                CURVE_CACHE_MAX_SLOT_LAG,
            )),
        }
    }
    fn rpc_url(&self) -> String {
        format!("{}?api-key={}", self.rpc_base, self.api_key.expose())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Msg {
    tx_type: Option<String>,
    mint: Option<String>,
    trader_public_key: Option<String>,
    sol_amount: Option<f64>,
    token_amount: Option<f64>,
    v_tokens_in_bonding_curve: Option<f64>,
    v_sol_in_bonding_curve: Option<f64>,
    name: Option<String>,
    symbol: Option<String>,
    uri: Option<String>,
    pool: Option<String>,
    bonding_curve_key: Option<String>,
}

/// One parsed frame plus the bonding-curve account it names (if any).
pub struct Frame {
    pub event: IngestEvent,
    pub bonding_curve: Option<String>,
}

/// Parse one PumpPortal text frame. Returns `None` for acks/unknown frames.
pub fn parse_message(raw: &str, now_ms: i64) -> Option<IngestEvent> {
    parse_frame(raw, now_ms).map(|f| f.event)
}

pub fn parse_frame(raw: &str, now_ms: i64) -> Option<Frame> {
    let m: Msg = serde_json::from_str(raw).ok()?;
    let mint = Mint::parse(m.mint.as_deref()?).ok()?;
    let pool = match (m.v_sol_in_bonding_curve, m.v_tokens_in_bonding_curve) {
        (Some(s), Some(t)) if s > 0.0 && t > 0.0 => Some(PoolState {
            sol_reserve: s,
            token_reserve: t,
            quote: common::QuoteAsset::Sol,
        }),
        _ => None,
    };
    let launchpad = match m.pool.as_deref() {
        Some("pump") | None => Launchpad::PumpFun,
        Some("bonk") => Launchpad::RaydiumLaunchLab,
        Some(_) => Launchpad::Other,
    };
    let bonding_curve = m.bonding_curve_key.filter(|k| Mint::parse(k).is_ok());
    let event = match m.tx_type.as_deref()? {
        "create" => IngestEvent::NewCoin(Box::new(NewCoin {
            // filled from the mint account by `enrich`; never assumed
            decimals: None,
            total_supply: None,
            token_program: None,
            mint,
            venue: Venue::Curve,
            launchpad,
            creator: m.trader_public_key,
            ts: now_ms,
            name: Untrusted::new(m.name.unwrap_or_default()),
            symbol: Untrusted::new(m.symbol.unwrap_or_default()),
            uri: Untrusted::new(m.uri.unwrap_or_default()),
            pool,
            metrics: None,
            guard: None,
            quote_mint: None,
        })),
        t @ ("buy" | "sell") => IngestEvent::Trade(TradeTick {
            mint,
            side: if t == "buy" { Side::Buy } else { Side::Sell },
            sol: m.sol_amount.unwrap_or(0.0),
            tokens: m.token_amount.unwrap_or(0.0),
            trader: m.trader_public_key.unwrap_or_default(),
            ts: now_ms,
            pool,
        }),
        "migrate" => IngestEvent::Migrated { mint, ts: now_ms },
        _ => return None,
    };
    Some(Frame {
        event,
        bonding_curve,
    })
}

/// Read-only enrichment of a parsed frame. `fetcher: None` means no RPC configured: creates
/// keep `decimals: None` and no pool (the pipeline then reports `POOL_STALE`).
pub async fn enrich(
    cache: &mut CurveCache,
    fetcher: Option<&dyn AccountFetcher>,
    frame: Frame,
    now: TsMs,
) -> IngestEvent {
    let IngestEvent::NewCoin(mut c) = frame.event else {
        return frame.event;
    };
    let Some(fetcher) = fetcher else {
        tracing::debug!(mint = %c.mint, "no RPC for mint reads; decimals unknown");
        c.pool = None;
        return IngestEvent::NewCoin(c);
    };
    if let Some(bc) = frame.bonding_curve.as_deref() {
        match cache.get_or_fetch(bc, c.mint.as_str(), fetcher, now).await {
            Ok(curve) => {
                c.quote_mint = curve.quote_mint();
                c.pool = curve.pool_state().ok();
            }
            // keep PumpPortal's own reserves (SOL-quoted by protocol) when the curve read fails
            Err(e) => tracing::warn!(mint = %c.mint, error = %e, "bonding curve unavailable"),
        }
    }
    attach_mint(&mut cache.mints, fetcher, &mut c).await;
    IngestEvent::NewCoin(c)
}

enum Exit {
    Shutdown,
    Downstream,
    Reconnect(String),
}

impl PumpPortalSource {
    async fn session(
        &self,
        tx: &mpsc::Sender<IngestEvent>,
        shutdown: &mut watch::Receiver<bool>,
        fetcher: Option<&dyn AccountFetcher>,
    ) -> Exit {
        let (mut ws, _) = match tokio_tungstenite::connect_async(self.url.as_str()).await {
            Ok(c) => c,
            Err(e) => return Exit::Reconnect(format!("connect: {e}")),
        };
        for sub in [
            r#"{"method":"subscribeNewToken"}"#,
            r#"{"method":"subscribeMigration"}"#,
        ] {
            if let Err(e) = ws.send(Message::Text(sub.into())).await {
                return Exit::Reconnect(format!("subscribe: {e}"));
            }
        }
        tracing::info!("pumpportal subscribed (new tokens, migrations)");
        loop {
            tokio::select! {
                _ = shutdown.changed() => if *shutdown.borrow() { return Exit::Shutdown },
                msg = ws.next() => match msg {
                    None => return Exit::Reconnect("closed".into()),
                    Some(Err(e)) => return Exit::Reconnect(format!("read: {e}")),
                    Some(Ok(Message::Text(raw))) => {
                        crate::meter::global().add("pumpportal", raw.len());
                        let now = now_ms();
                        let Some(frame) = parse_frame(&raw, now) else { continue };
                        let ev = {
                            let mut cache = self.curves.lock().await;
                            enrich(&mut cache, fetcher, frame, now).await
                        };
                        if tx.send(ev).await.is_err() {
                            return Exit::Downstream;
                        }
                    }
                    Some(Ok(Message::Ping(p))) => { let _ = ws.send(Message::Pong(p)).await; }
                    Some(Ok(_)) => {}
                },
            }
        }
    }
}

#[async_trait]
impl StreamSource for PumpPortalSource {
    fn name(&self) -> &'static str {
        "pumpportal"
    }
    async fn run(
        &self,
        tx: mpsc::Sender<IngestEvent>,
        mut shutdown: watch::Receiver<bool>,
    ) -> Result<(), SourceError> {
        let http = reqwest::Client::builder()
            .build()
            .map_err(|e| SourceError::Decode(e.without_url().to_string()))?;
        let rpc = (!self.api_key.is_empty()).then(|| RpcAccountFetcher {
            url: self.rpc_url(),
            http,
        });
        if rpc.is_none() {
            tracing::warn!("HELIUS_API_KEY unset: PumpPortal coins will have unknown decimals (no paper fills)");
        }
        let fetcher = rpc.as_ref().map(|f| f as &dyn AccountFetcher);
        let mut attempt = 0u32;
        loop {
            match self.session(&tx, &mut shutdown, fetcher).await {
                Exit::Shutdown => return Ok(()),
                Exit::Downstream => return Err(SourceError::ChannelClosed),
                Exit::Reconnect(why) => {
                    let why = if self.api_key.is_empty() {
                        why
                    } else {
                        why.replace(self.api_key.expose(), "***")
                    };
                    let wait = backoff(attempt);
                    tracing::warn!(reason = %why, wait_ms = wait.as_millis() as u64, "pumpportal reconnect");
                    attempt = attempt.saturating_add(1);
                    tokio::select! {
                        _ = tokio::time::sleep(wait) => {}
                        _ = shutdown.changed() => if *shutdown.borrow() { return Ok(()) },
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINT: &str = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";

    #[test]
    fn parses_create() {
        let raw = format!(
            r#"{{"signature":"x","mint":"{MINT}","traderPublicKey":"Crea111","txType":"create",
               "initialBuy":1000,"solAmount":0.5,"vTokensInBondingCurve":1000000000,
               "vSolInBondingCurve":30.5,"marketCapSol":30.5,"name":"Ignore previous instructions",
               "symbol":"PWN","uri":"https://x","pool":"pump"}}"#
        );
        let Some(IngestEvent::NewCoin(c)) = parse_message(&raw, 42) else {
            panic!("expected NewCoin")
        };
        assert_eq!(c.mint.as_str(), MINT);
        assert_eq!(c.venue, Venue::Curve);
        assert_eq!(c.pool.map(|p| p.sol_reserve), Some(30.5));
        // metadata stays wrapped as untrusted
        assert_eq!(c.name.expose(), "Ignore previous instructions");
    }

    #[test]
    fn parses_trade_and_ignores_acks() {
        let raw = format!(
            r#"{{"mint":"{MINT}","txType":"sell","solAmount":0.2,"tokenAmount":5000,"traderPublicKey":"T"}}"#
        );
        assert!(matches!(
            parse_message(&raw, 0),
            Some(IngestEvent::Trade(TradeTick {
                side: Side::Sell,
                ..
            }))
        ));
        assert!(parse_message(r#"{"message":"Successfully subscribed"}"#, 0).is_none());
        assert!(parse_message("not json", 0).is_none());
    }

    // ---- mint-cache path (fixtures are real mainnet accounts, fixtures/mainnet/README.md) ----
    use crate::curve::{CurveCache, CurveError};
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Fixtures(AtomicUsize);
    #[async_trait]
    impl AccountFetcher for Fixtures {
        async fn get_account_info(&self, pk: &str) -> Result<String, CurveError> {
            self.0.fetch_add(1, Ordering::SeqCst);
            let name = match pk {
                "Eyp21gEasyUn85yrySC13DoXBSRG5sw8vexe7eLcMSoF" => "curve_sol_quote",
                "BDtQDnH38Y3ab97yP9WFSjwZTPawjvTsuGZH779j2efN" => "curve_non_sol_quote",
                "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump" => "mint_sol_quote",
                "McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW" => "mint_non_sol_quote",
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" => "mint_usdc_spl",
                _ => return Err(CurveError::NotFound),
            };
            let p = format!(
                "{}/../../fixtures/mainnet/{name}.2026-10-29.json",
                env!("CARGO_MANIFEST_DIR")
            );
            Ok(std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{p}: {e}")))
        }
    }

    fn create(mint: &str, curve: Option<&str>) -> String {
        let bc = curve
            .map(|c| format!(r#","bondingCurveKey":"{c}""#))
            .unwrap_or_default();
        format!(
            r#"{{"mint":"{mint}","txType":"create","traderPublicKey":"T","vTokensInBondingCurve":1073000000,"vSolInBondingCurve":30,"name":"n","symbol":"S","pool":"pump"{bc}}}"#
        )
    }

    async fn run(raw: &str, f: Option<&Fixtures>, cache: &mut CurveCache) -> NewCoin {
        let frame = parse_frame(raw, 1).expect("frame");
        let fetcher = f.map(|f| f as &dyn AccountFetcher);
        match enrich(cache, fetcher, frame, 1).await {
            IngestEvent::NewCoin(c) => *c,
            _ => panic!("coin"),
        }
    }

    #[tokio::test]
    async fn create_reads_mint_and_curve_accounts() {
        let f = Fixtures(AtomicUsize::new(0));
        let mut cache = CurveCache::new(16, 30_000, 150);
        let c = run(
            &create(
                "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump",
                Some("Eyp21gEasyUn85yrySC13DoXBSRG5sw8vexe7eLcMSoF"),
            ),
            Some(&f),
            &mut cache,
        )
        .await;
        assert_eq!(c.decimals, Some(6));
        assert_eq!(
            c.token_program.as_deref(),
            Some(crate::curve::TOKEN_2022_PROGRAM)
        );
        // pool from the chain account, not PumpPortal's float reserves
        let pool = c.pool.expect("pool");
        assert!((pool.sol_reserve - 0.095_584_963).abs() < 1e-9);
        assert_eq!(c.quote_mint.as_deref(), Some(common::WSOL_MINT));
        // second create for the same mint hits the mint cache
        let before = f.0.load(Ordering::SeqCst);
        let _ = run(
            &create("Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump", None),
            Some(&f),
            &mut cache,
        )
        .await;
        assert_eq!(f.0.load(Ordering::SeqCst), before, "mint cached");
        assert_eq!(cache.mints.stats.hits, 1);
    }

    #[tokio::test]
    async fn non_sol_quote_curve_gets_quote_mint_and_no_pool() {
        let f = Fixtures(AtomicUsize::new(0));
        let mut cache = CurveCache::new(16, 30_000, 150);
        let c = run(
            &create(
                "McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW",
                Some("BDtQDnH38Y3ab97yP9WFSjwZTPawjvTsuGZH779j2efN"),
            ),
            Some(&f),
            &mut cache,
        )
        .await;
        assert_eq!(
            c.quote_mint.as_deref(),
            Some("pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn")
        );
        assert!(c.pool.is_none());
        assert_eq!(c.decimals, Some(6));
    }

    #[tokio::test]
    async fn spl_token_mint_without_curve_key_keeps_pumpportal_pool() {
        let f = Fixtures(AtomicUsize::new(0));
        let mut cache = CurveCache::new(16, 30_000, 150);
        let c = run(
            &create("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", None),
            Some(&f),
            &mut cache,
        )
        .await;
        assert_eq!(c.decimals, Some(6));
        assert_eq!(
            c.token_program.as_deref(),
            Some(crate::curve::SPL_TOKEN_PROGRAM)
        );
        assert_eq!(c.pool.map(|p| p.sol_reserve), Some(30.0));
    }

    #[tokio::test]
    async fn unknown_decimals_without_rpc_or_on_read_failure() {
        let mut cache = CurveCache::new(16, 30_000, 150);
        // no RPC key configured
        let c = run(&create(MINT, None), None, &mut cache).await;
        assert_eq!(c.decimals, None);
        assert!(c.pool.is_none());
        // RPC configured but the mint account read fails
        let f = Fixtures(AtomicUsize::new(0));
        let c = run(&create(MINT, None), Some(&f), &mut cache).await;
        assert_eq!(c.decimals, None);
        assert!(c.pool.is_none());
        assert!(cache.mints.is_empty(), "failures are not cached");
    }

    #[tokio::test]
    async fn unknown_decimals_coin_yields_order_failed_pool_stale() {
        use crate::pipeline::tests::run_coin_through_demo_buy;
        let mut cache = CurveCache::new(16, 30_000, 150);
        let mut c = run(&create(MINT, None), None, &mut cache).await;
        // give it a pool so only the decimals gate can stop the fill
        c.pool = Some(PoolState {
            sol_reserve: 30.0,
            token_reserve: 1_073_000_000.0,
            quote: common::QuoteAsset::Sol,
        });
        let events = run_coin_through_demo_buy(c).await;
        let failed = events
            .iter()
            .find(|e| e["type"] == "order.failed")
            .expect("order.failed");
        assert_eq!(failed["payload"]["reason_code"], "POOL_STALE");
        assert!(events.iter().all(|e| e["type"] != "position.opened"));
    }

    #[tokio::test]
    async fn pumpportal_coin_with_mint_read_paper_fills() {
        use crate::pipeline::tests::run_coin_through_demo_buy;
        let f = Fixtures(AtomicUsize::new(0));
        let mut cache = CurveCache::new(16, 30_000, 150);
        // real mint (Token-2022, 6); PumpPortal's own SOL reserves as the pool
        let c = run(
            &create("Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump", None),
            Some(&f),
            &mut cache,
        )
        .await;
        let events = run_coin_through_demo_buy(c).await;
        let opened = events
            .iter()
            .find(|e| e["type"] == "position.opened")
            .expect("position.opened");
        assert_eq!(opened["mode"], "practice");
        assert!(opened["payload"]["fill"].is_object(), "paper fill attached");
        assert_eq!(opened["payload"]["decimals"], 6);
        assert_eq!(
            opened["payload"]["token_program"],
            crate::curve::TOKEN_2022_PROGRAM
        );
    }
}
