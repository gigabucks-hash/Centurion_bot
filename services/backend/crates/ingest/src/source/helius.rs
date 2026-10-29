//! Helius standard WebSocket + RPC source (paper mode).
//!
//! * Discovery: one WebSocket to `wss://mainnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>` with
//!   `logsSubscribe {mentions: [<launch program>]}` at `confirmed`. Anchor events arrive as
//!   `Program data: <base64>` log lines; we decode three of them: token created, trade, curve
//!   complete (migration).
//! * Enrichment: `getTransaction(signature)` over HTTPS RPC for created coins (block time, fee
//!   payer, fee, creator's SOL spend and initial token balance).
//! * Resilience: ping every 30 s (idle sockets are closed by the provider), reconnect with
//!   jittered exponential backoff (1 s → 60 s), resubscribe on every connect.
//!
//! The API key is read from the environment only and is never logged (`Secret`).
//! Decoding is pure and unit-tested against real mainnet frames in `services/backend/fixtures/mainnet/`
//! (plus synthetic frames for shapes mainnet no longer emits). Event reserves are not used as a SOL pool:
//! some curves quote in a non-SOL token and the event carries no quote mint.
use std::time::Duration;

use async_trait::async_trait;
use base64::Engine as _;
use common::{Launchpad, Mint, TsMs, Untrusted, Venue};
use futures_util::{SinkExt, StreamExt};
use papersim::Side;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message;

use super::yellowstone::PUMP_FUN_PROGRAM;
use super::{IngestEvent, NewCoin, SourceError, StreamSource, TradeTick};
use crate::config::Secret;

pub const DEFAULT_WS_BASE: &str = "wss://mainnet.helius-rpc.com/";
pub const DEFAULT_RPC_BASE: &str = "https://mainnet.helius-rpc.com/";
/// Token decimals on the launch curve.
const CURVE_TOKEN_DECIMALS: i32 = 6;
const LAMPORTS_PER_SOL: f64 = 1_000_000_000.0;

pub struct HeliusSource {
    pub ws_base: String,
    pub rpc_base: String,
    pub api_key: Secret,
    pub program: String,
    /// Call `getTransaction` for each created coin.
    pub enrich: bool,
}

impl HeliusSource {
    pub fn new(api_key: Secret) -> Self {
        Self {
            ws_base: DEFAULT_WS_BASE.into(),
            rpc_base: DEFAULT_RPC_BASE.into(),
            api_key,
            program: PUMP_FUN_PROGRAM.into(),
            enrich: true,
        }
    }
    fn ws_url(&self) -> String {
        format!("{}?api-key={}", self.ws_base, self.api_key.expose())
    }
    fn rpc_url(&self) -> String {
        format!("{}?api-key={}", self.rpc_base, self.api_key.expose())
    }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/// JSON-RPC `logsSubscribe` for every transaction that mentions `program`.
pub fn logs_subscribe_request(id: u64, program: &str) -> Value {
    json!({
        "jsonrpc": "2.0", "id": id, "method": "logsSubscribe",
        "params": [ { "mentions": [program] }, { "commitment": "confirmed" } ]
    })
}

/// JSON-RPC `getTransaction` (legacy + v0 transactions, `json` encoding).
pub fn get_transaction_request(id: u64, signature: &str) -> Value {
    json!({
        "jsonrpc": "2.0", "id": id, "method": "getTransaction",
        "params": [ signature, { "encoding": "json", "commitment": "confirmed", "maxSupportedTransactionVersion": 0 } ]
    })
}

// ---------------------------------------------------------------------------
// Anchor event decoding
// ---------------------------------------------------------------------------

/// Anchor event discriminator: first 8 bytes of `sha256("event:<Name>")`.
pub fn event_discriminator(name: &str) -> [u8; 8] {
    let h = Sha256::digest(format!("event:{name}").as_bytes());
    let mut d = [0u8; 8];
    d.copy_from_slice(&h[..8]);
    d
}

/// Decoded launch-program event.
#[derive(Debug, Clone, PartialEq)]
pub enum CurveEvent {
    Created {
        name: String,
        symbol: String,
        uri: String,
        mint: String,
        bonding_curve: String,
        user: String,
        /// Present in newer program versions (trailing fields).
        creator: Option<String>,
        timestamp: Option<i64>,
        virtual_token_reserves: Option<u64>,
        virtual_sol_reserves: Option<u64>,
    },
    Trade {
        mint: String,
        sol_amount: u64,
        token_amount: u64,
        is_buy: bool,
        user: String,
        timestamp: i64,
        virtual_sol_reserves: u64,
        virtual_token_reserves: u64,
    },
    Completed {
        user: String,
        mint: String,
        bonding_curve: String,
        timestamp: i64,
    },
}

struct Reader<'a> {
    b: &'a [u8],
    at: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let end = self.at.checked_add(n)?;
        let s = self.b.get(self.at..end)?;
        self.at = end;
        Some(s)
    }
    fn remaining(&self) -> usize {
        self.b.len().saturating_sub(self.at)
    }
    fn u64(&mut self) -> Option<u64> {
        Some(u64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }
    fn i64(&mut self) -> Option<i64> {
        Some(i64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }
    fn bool(&mut self) -> Option<bool> {
        match self.take(1)?[0] {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        }
    }
    /// Borsh string: u32 LE length + UTF-8 bytes. Capped to reject garbage.
    fn string(&mut self, max: usize) -> Option<String> {
        let n = u32::from_le_bytes(self.take(4)?.try_into().ok()?) as usize;
        if n > max {
            return None;
        }
        String::from_utf8(self.take(n)?.to_vec()).ok()
    }
    fn pubkey(&mut self) -> Option<String> {
        Some(bs58::encode(self.take(32)?).into_string())
    }
}

/// Decode one `Program data:` payload. Unknown discriminators -> `None`.
pub fn decode_event(data: &[u8]) -> Option<CurveEvent> {
    let (disc, body) = (data.get(..8)?, data.get(8..)?);
    let mut r = Reader { b: body, at: 0 };
    if disc == event_discriminator("CreateEvent") {
        let name = r.string(200)?;
        let symbol = r.string(50)?;
        let uri = r.string(400)?;
        let mint = r.pubkey()?;
        let bonding_curve = r.pubkey()?;
        let user = r.pubkey()?;
        let creator = if r.remaining() >= 32 {
            r.pubkey()
        } else {
            None
        };
        let timestamp = if r.remaining() >= 8 { r.i64() } else { None };
        let virtual_token_reserves = if r.remaining() >= 8 { r.u64() } else { None };
        let virtual_sol_reserves = if r.remaining() >= 8 { r.u64() } else { None };
        return Some(CurveEvent::Created {
            name,
            symbol,
            uri,
            mint,
            bonding_curve,
            user,
            creator,
            timestamp,
            virtual_token_reserves,
            virtual_sol_reserves,
        });
    }
    if disc == event_discriminator("TradeEvent") {
        return Some(CurveEvent::Trade {
            mint: r.pubkey()?,
            sol_amount: r.u64()?,
            token_amount: r.u64()?,
            is_buy: r.bool()?,
            user: r.pubkey()?,
            timestamp: r.i64()?,
            virtual_sol_reserves: r.u64()?,
            virtual_token_reserves: r.u64()?,
        });
    }
    if disc == event_discriminator("CompleteEvent") {
        return Some(CurveEvent::Completed {
            user: r.pubkey()?,
            mint: r.pubkey()?,
            bonding_curve: r.pubkey()?,
            timestamp: r.i64()?,
        });
    }
    None
}

/// Map a decoded event to the pipeline's [`IngestEvent`].
pub fn to_ingest(ev: CurveEvent, now_ms: TsMs) -> Option<IngestEvent> {
    match ev {
        CurveEvent::Created {
            name,
            symbol,
            uri,
            mint,
            user,
            creator,
            timestamp,
            ..
        } => Some(IngestEvent::NewCoin(Box::new(NewCoin {
            mint: Mint::parse(&mint).ok()?,
            venue: Venue::Curve,
            launchpad: Launchpad::PumpFun,
            creator: Some(creator.unwrap_or(user)),
            ts: timestamp.map(|s| s * 1000).unwrap_or(now_ms),
            name: Untrusted::new(name),
            symbol: Untrusted::new(symbol),
            uri: Untrusted::new(uri),
            // Reserves are decoded but NOT turned into a SOL pool: mainnet capture (2026-10-29) shows
            // curves whose quote side is not SOL, and the event does not carry the quote mint. Pool
            // state must come from the bonding-curve account (quote mint checked) before paper fills.
            pool: None,
            metrics: None,
            guard: None,
        }))),
        CurveEvent::Trade {
            mint,
            sol_amount,
            token_amount,
            is_buy,
            user,
            timestamp,
            ..
        } => Some(IngestEvent::Trade(TradeTick {
            mint: Mint::parse(&mint).ok()?,
            side: if is_buy { Side::Buy } else { Side::Sell },
            sol: sol_amount as f64 / LAMPORTS_PER_SOL,
            tokens: token_amount as f64 / 10f64.powi(CURVE_TOKEN_DECIMALS),
            trader: user,
            ts: timestamp * 1000,
            pool: None, // see NewCoin above: quote unit unknown from the event alone
        })),
        CurveEvent::Completed {
            mint, timestamp, ..
        } => Some(IngestEvent::Migrated {
            mint: Mint::parse(&mint).ok()?,
            ts: timestamp * 1000,
        }),
    }
}

/// One `logsNotification` decoded.
#[derive(Debug, Clone, PartialEq)]
pub struct LogBatch {
    pub signature: String,
    pub slot: u64,
    pub events: Vec<CurveEvent>,
}

#[derive(Deserialize)]
struct Notification {
    method: Option<String>,
    params: Option<NotifParams>,
}
#[derive(Deserialize)]
struct NotifParams {
    result: NotifResult,
}
#[derive(Deserialize)]
struct NotifResult {
    context: Context,
    value: LogsValue,
}
#[derive(Deserialize)]
struct Context {
    slot: u64,
}
#[derive(Deserialize)]
struct LogsValue {
    signature: String,
    err: Option<Value>,
    #[serde(default)]
    logs: Vec<String>,
}

/// Parse one WebSocket text frame. Subscription acks, failed transactions and frames
/// without launch-program events return `None`.
pub fn parse_logs_notification(raw: &str) -> Option<LogBatch> {
    let n: Notification = serde_json::from_str(raw).ok()?;
    if n.method.as_deref() != Some("logsNotification") {
        return None;
    }
    let r = n.params?.result;
    if r.value.err.as_ref().is_some_and(|e| !e.is_null()) {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD;
    let events: Vec<CurveEvent> = r
        .value
        .logs
        .iter()
        .filter_map(|l| l.strip_prefix("Program data: "))
        .filter_map(|d| b64.decode(d.trim()).ok())
        .filter_map(|bytes| decode_event(&bytes))
        .collect();
    (!events.is_empty()).then_some(LogBatch {
        signature: r.value.signature,
        slot: r.context.slot,
        events,
    })
}

/// Facts from `getTransaction` used to enrich a created coin.
#[derive(Debug, Clone, PartialEq)]
pub struct CreateTxDetails {
    pub slot: u64,
    pub block_time_ms: Option<TsMs>,
    pub fee_payer: String,
    pub fee_lamports: u64,
    /// SOL the fee payer spent in the create transaction (incl. dev buy, rent, fees).
    pub payer_sol_spent_lamports: u64,
    /// Fee payer's token balance of `mint` after the transaction (dev initial buy), raw units.
    pub payer_initial_tokens_raw: u64,
}

/// Parse a `getTransaction` JSON-RPC response (`json` encoding).
pub fn parse_get_transaction(raw: &str, mint: &str) -> Option<CreateTxDetails> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let r = v.get("result")?;
    if r.is_null() {
        return None;
    }
    let meta = r.get("meta")?;
    if !meta.get("err").is_none_or(Value::is_null) {
        return None;
    }
    let keys = r.pointer("/transaction/message/accountKeys")?.as_array()?;
    let fee_payer = keys.first()?.as_str()?.to_string();
    let pre = meta.pointer("/preBalances/0")?.as_u64()?;
    let post = meta.pointer("/postBalances/0")?.as_u64()?;
    let tokens = meta
        .get("postTokenBalances")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|b| {
            b.get("mint").and_then(Value::as_str) == Some(mint)
                && b.get("owner").and_then(Value::as_str) == Some(fee_payer.as_str())
        })
        .and_then(|b| b.pointer("/uiTokenAmount/amount")?.as_str()?.parse().ok())
        .unwrap_or(0);
    Some(CreateTxDetails {
        slot: r.get("slot")?.as_u64()?,
        block_time_ms: r.get("blockTime").and_then(Value::as_i64).map(|s| s * 1000),
        fee_payer,
        fee_lamports: meta.get("fee")?.as_u64()?,
        payer_sol_spent_lamports: pre.saturating_sub(post),
        payer_initial_tokens_raw: tokens,
    })
}

// ---------------------------------------------------------------------------
// Socket loop
// ---------------------------------------------------------------------------

fn now_ms() -> TsMs {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn backoff(attempt: u32) -> Duration {
    let base = 1000u64.saturating_mul(1u64 << attempt.min(6)).min(60_000);
    let jitter = (now_ms() as u64) % (base / 4 + 1);
    Duration::from_millis(base / 2 + jitter + base / 4)
}

enum Exit {
    Shutdown,
    Downstream,
    Reconnect(String),
}

impl HeliusSource {
    async fn enrich_created(&self, http: &reqwest::Client, sig: &str, mint: &str) {
        let res = http
            .post(self.rpc_url())
            .json(&get_transaction_request(1, sig))
            .timeout(Duration::from_secs(5))
            .send()
            .await;
        match res {
            Ok(r) => match r.text().await {
                Ok(body) => match parse_get_transaction(&body, mint) {
                    Some(d) => tracing::debug!(
                        mint,
                        slot = d.slot,
                        payer_sol_spent = d.payer_sol_spent_lamports,
                        payer_tokens = d.payer_initial_tokens_raw,
                        "create tx enriched"
                    ),
                    None => tracing::debug!(mint, "getTransaction not available yet"),
                },
                Err(e) => tracing::warn!(error = %e, "getTransaction body"),
            },
            // reqwest errors never include the URL query (api key) when built without_url
            Err(e) => tracing::warn!(error = %e.without_url(), "getTransaction failed"),
        }
    }

    async fn session(
        &self,
        tx: &mpsc::Sender<IngestEvent>,
        shutdown: &mut watch::Receiver<bool>,
        http: &reqwest::Client,
    ) -> Exit {
        let (mut ws, _) = match tokio_tungstenite::connect_async(self.ws_url()).await {
            Ok(c) => c,
            Err(e) => return Exit::Reconnect(format!("connect: {e}")),
        };
        let sub = logs_subscribe_request(1, &self.program).to_string();
        if let Err(e) = ws.send(Message::Text(sub.into())).await {
            return Exit::Reconnect(format!("subscribe: {e}"));
        }
        tracing::info!(program = %self.program, "helius logsSubscribe sent");
        let mut ping = tokio::time::interval(Duration::from_secs(30));
        loop {
            tokio::select! {
                _ = shutdown.changed() => {
                    if *shutdown.borrow() { let _ = ws.close(None).await; return Exit::Shutdown; }
                }
                _ = ping.tick() => {
                    if let Err(e) = ws.send(Message::Ping(Vec::new().into())).await {
                        return Exit::Reconnect(format!("ping: {e}"));
                    }
                }
                msg = ws.next() => match msg {
                    Some(Ok(Message::Text(t))) => {
                        let Some(batch) = parse_logs_notification(t.as_str()) else { continue };
                        for ev in batch.events {
                            let created_mint = match &ev {
                                CurveEvent::Created { mint, .. } => Some(mint.clone()),
                                _ => None,
                            };
                            if let Some(ie) = to_ingest(ev, now_ms()) {
                                if tx.send(ie).await.is_err() { return Exit::Downstream; }
                            }
                            if let (true, Some(m)) = (self.enrich, created_mint) {
                                self.enrich_created(http, &batch.signature, &m).await;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => return Exit::Reconnect("closed by server".into()),
                    Some(Ok(_)) => {}
                    Some(Err(e)) => return Exit::Reconnect(format!("read: {e}")),
                }
            }
        }
    }
}

#[async_trait]
impl StreamSource for HeliusSource {
    fn name(&self) -> &'static str {
        "helius"
    }
    async fn run(
        &self,
        tx: mpsc::Sender<IngestEvent>,
        mut shutdown: watch::Receiver<bool>,
    ) -> Result<(), SourceError> {
        if self.api_key.is_empty() {
            return Err(SourceError::NotConfigured("HELIUS_API_KEY"));
        }
        let http = reqwest::Client::builder()
            .build()
            .map_err(|e| SourceError::Decode(e.without_url().to_string()))?;
        let mut attempt = 0u32;
        loop {
            match self.session(&tx, &mut shutdown, &http).await {
                Exit::Shutdown => return Ok(()),
                Exit::Downstream => return Err(SourceError::ChannelClosed),
                Exit::Reconnect(why) => {
                    let why = why.replace(self.api_key.expose(), "***");
                    let wait = backoff(attempt);
                    tracing::warn!(reason = %why, wait_ms = wait.as_millis() as u64, "helius reconnect");
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

    /// Real frames captured read-only from mainnet (see `services/backend/fixtures/mainnet/README.md`).
    fn mainnet(name: &str) -> String {
        let p = format!(
            "{}/../../fixtures/mainnet/{name}",
            env!("CARGO_MANIFEST_DIR")
        );
        std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{p}: {e}"))
    }
    /// Synthetic frames, only for shapes no current mainnet frame has.
    fn synthetic(name: &str) -> String {
        let p = format!("{}/fixtures/helius/{name}", env!("CARGO_MANIFEST_DIR"));
        std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{p}: {e}"))
    }
    const CAPTURE: &str = "2026-10-29";

    #[test]
    fn discriminators_are_anchor_sha256_prefixes() {
        assert_eq!(
            event_discriminator("CreateEvent"),
            [0x1b, 0x72, 0xa9, 0x4d, 0xde, 0xeb, 0x63, 0x76]
        );
        assert_ne!(
            event_discriminator("TradeEvent"),
            event_discriminator("CreateEvent")
        );
    }

    #[test]
    fn subscribe_request_shape() {
        let r = logs_subscribe_request(7, PUMP_FUN_PROGRAM);
        assert_eq!(r["method"], "logsSubscribe");
        assert_eq!(r["params"][0]["mentions"][0], PUMP_FUN_PROGRAM);
        assert_eq!(r["params"][1]["commitment"], "confirmed");
        let g = get_transaction_request(1, "sig");
        assert_eq!(g["params"][1]["maxSupportedTransactionVersion"], 0);
    }

    #[test]
    fn mainnet_create_v2() {
        let b = parse_logs_notification(&mainnet(&format!("logs_create.{CAPTURE}.json")))
            .expect("batch");
        assert_eq!(b.slot, 462_832_912);
        assert_eq!(
            b.signature,
            "5DT6QVW9gAz6rwcFezH3CA4PK5NpuhVW51B63wpWXV398yhH7WHsNPjUQvFqcHLSqqNhaZ6xp5FdPN52Cc449GLM"
        );
        assert_eq!(b.events.len(), 1);
        let CurveEvent::Created {
            ref symbol,
            ref mint,
            ref bonding_curve,
            ref user,
            ref creator,
            timestamp,
            virtual_token_reserves,
            ..
        } = b.events[0]
        else {
            panic!("expected Created")
        };
        assert_eq!(symbol, "Fart");
        assert_eq!(mint, "McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW");
        assert_eq!(
            bonding_curve,
            "BDtQDnH38Y3ab97yP9WFSjwZTPawjvTsuGZH779j2efN"
        );
        assert_eq!(user, "424dpHGa8XRe5T2Czg2Nc4JSbLQGbR43q8LoYD13CFuy");
        assert_eq!(
            creator.as_deref(),
            Some("9R55983jyCunSsqAx7G9BxbYN5mbkaRDsPuof7sejSQJ")
        );
        assert_eq!(timestamp, Some(1_793_266_607));
        assert_eq!(virtual_token_reserves, Some(1_073_000_000_000_000));
        let Some(IngestEvent::NewCoin(c)) = to_ingest(b.events[0].clone(), 0) else {
            panic!("expected NewCoin")
        };
        assert_eq!(c.venue, Venue::Curve);
        assert_eq!(c.launchpad, Launchpad::PumpFun);
        assert_eq!(
            c.creator.as_deref(),
            Some("9R55983jyCunSsqAx7G9BxbYN5mbkaRDsPuof7sejSQJ")
        );
        assert_eq!(c.ts, 1_793_266_607_000);
        assert!(c.pool.is_none(), "quote unit unknown from the event");
        // metadata is attacker-controlled text: stays wrapped
        assert_eq!(c.symbol.expose(), "Fart");
    }

    #[test]
    fn mainnet_trade() {
        let b = parse_logs_notification(&mainnet(&format!("logs_trade.{CAPTURE}.json")))
            .expect("batch");
        assert_eq!(b.slot, 462_832_906);
        assert_eq!(
            b.events.len(),
            1,
            "unknown events in the same tx are skipped"
        );
        let Some(IngestEvent::Trade(t)) = to_ingest(b.events[0].clone(), 0) else {
            panic!("expected Trade")
        };
        assert_eq!(
            t.mint.as_str(),
            "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump"
        );
        assert_eq!(t.side, Side::Sell);
        assert_eq!(t.trader, "BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s");
        assert!((t.sol - 0.020_936_024).abs() < 1e-12);
        assert_eq!(t.ts, 1_793_266_605_000);
    }

    #[test]
    fn mainnet_complete_as_migration() {
        let b = parse_logs_notification(&mainnet(&format!("logs_complete.{CAPTURE}.json")))
            .expect("batch");
        assert_eq!(b.slot, 462_833_663);
        assert_eq!(b.events.len(), 2, "final buy + curve complete");
        let migrated: Vec<_> = b
            .events
            .into_iter()
            .filter_map(|e| to_ingest(e, 0))
            .filter_map(|e| match e {
                IngestEvent::Migrated { mint, ts } => Some((mint, ts)),
                _ => None,
            })
            .collect();
        assert_eq!(migrated.len(), 1);
        assert_eq!(
            migrated[0].0.as_str(),
            "F6LeVR2QMkzNXcQy6593Kf1hM7CPLnQaQ4eyBAvrpump"
        );
        assert_eq!(migrated[0].1, 1_793_266_769_000);
    }

    #[test]
    fn mainnet_get_transaction_enrichment() {
        let d = parse_get_transaction(
            &mainnet(&format!("get_transaction_create.{CAPTURE}.json")),
            "McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW",
        )
        .expect("details");
        assert_eq!(d.slot, 462_832_912);
        assert_eq!(d.block_time_ms, Some(1_793_266_607_000));
        assert_eq!(d.fee_payer, "424dpHGa8XRe5T2Czg2Nc4JSbLQGbR43q8LoYD13CFuy");
        assert_eq!(d.fee_lamports, 55_000);
        assert_eq!(d.payer_sol_spent_lamports, 11_037_960);
        assert_eq!(d.payer_initial_tokens_raw, 91_430_114_952_123);
        assert!(parse_get_transaction(r#"{"jsonrpc":"2.0","result":null,"id":1}"#, "x").is_none());
    }

    #[test]
    fn synthetic_legacy_create_without_trailing_fields() {
        // v1 CreateEvent layout (no creator/timestamp/reserves): not emitted by today's program.
        let b = parse_logs_notification(&synthetic("logs_create_legacy.json")).expect("batch");
        let Some(IngestEvent::NewCoin(c)) = to_ingest(b.events[0].clone(), 42) else {
            panic!("expected NewCoin")
        };
        assert_eq!(c.ts, 42, "falls back to receive time");
        assert_eq!(
            c.creator.as_deref(),
            Some("So11111111111111111111111111111111111111112")
        );
    }

    #[test]
    fn ignores_acks_failed_and_garbage() {
        assert!(parse_logs_notification(r#"{"jsonrpc":"2.0","result":4242,"id":1}"#).is_none());
        assert!(parse_logs_notification(&synthetic("logs_failed.json")).is_none());
        assert!(parse_logs_notification(&synthetic("logs_unrelated.json")).is_none());
        assert!(parse_logs_notification("not json").is_none());
        assert!(decode_event(&event_discriminator("CreateEvent")).is_none());
        let mut huge = event_discriminator("CreateEvent").to_vec();
        huge.extend_from_slice(&u32::MAX.to_le_bytes());
        assert!(decode_event(&huge).is_none());
    }

    #[test]
    fn api_key_not_in_debug() {
        let s = HeliusSource::new(Secret::from_test("k-123"));
        assert!(!format!("{:?}", s.api_key).contains("k-123"));
    }
}
