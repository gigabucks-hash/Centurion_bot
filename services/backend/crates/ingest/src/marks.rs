//! Mark prices for open-position UIs, published to the API's SSE `include=marks` stream through
//! Postgres `NOTIFY` (channel `SSE_MARKS_CHANNEL`, default `sentra_marks`). Marks are display-only:
//! never persisted, never part of the event log, never used for fills.
//!
//! Payload (must match services/backend/api/src/sse.ts):
//! `{"workspace_id": "<uuid>", "mode": "practice", "mark": MarkMessage}`.
//!
//! Known limitations (documented in TECH_DESIGN §8):
//! * `price_usd` / `liquidity_usd` use a configured SOL/USD reference (`MARKS_SOL_USD`); no live feed yet.
//! * `slot` is 0: `TradeTick` carries no slot.
//! * `position_ids` is empty: ingest does not know positions; clients match on `mint`.
use std::collections::HashMap;

use async_trait::async_trait;
use common::QuoteAsset;
use serde::Serialize;
use tokio::sync::Mutex;

use crate::source::TradeTick;

/// Postgres NOTIFY payloads must stay below 8000 bytes.
pub const MAX_PAYLOAD: usize = 7_900;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MarkMessage {
    pub mint: String,
    /// Decimal strings (never floats on the wire for prices).
    pub price_usd: String,
    pub price_sol: String,
    pub liquidity_usd: f64,
    pub slot: u64,
    /// RFC 3339 UTC, millisecond precision.
    pub ts: String,
    pub position_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
struct Envelope<'a> {
    workspace_id: &'a str,
    mode: &'static str,
    mark: &'a MarkMessage,
}

#[derive(Debug, thiserror::Error)]
pub enum MarkError {
    #[error("marks: {0}")]
    Publish(String),
    #[error("marks payload too large ({0} bytes)")]
    TooLarge(usize),
}

#[async_trait]
pub trait MarkPublisher: Send + Sync {
    async fn publish(&self, payload: &str) -> Result<(), MarkError>;
}

/// Test / dry-run publisher.
#[derive(Default)]
pub struct MemoryMarkPublisher {
    pub sent: Mutex<Vec<String>>,
}

#[async_trait]
impl MarkPublisher for MemoryMarkPublisher {
    async fn publish(&self, payload: &str) -> Result<(), MarkError> {
        self.sent.lock().await.push(payload.to_string());
        Ok(())
    }
}

/// `select pg_notify($channel, $payload)` on one dedicated connection.
pub struct PgMarkPublisher {
    client: tokio_postgres::Client,
    channel: String,
}

impl PgMarkPublisher {
    /// Plain TCP/unix socket only for now (sidecar or local Postgres); a TLS connector is a remaining item,
    /// so URLs that demand TLS are refused rather than silently downgraded.
    pub async fn connect(url: &str, channel: &str) -> Result<Self, MarkError> {
        if url.contains("sslmode=require") || url.contains("sslmode=verify") {
            return Err(MarkError::Publish(
                "TLS database URLs are not supported by the marks publisher yet".into(),
            ));
        }
        if !valid_channel(channel) {
            return Err(MarkError::Publish(
                "SSE_MARKS_CHANNEL must be a plain identifier".into(),
            ));
        }
        let (client, conn) = tokio_postgres::connect(url, tokio_postgres::NoTls)
            .await
            .map_err(|e| MarkError::Publish(e.to_string()))?;
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::warn!(error = %e, "marks connection closed");
            }
        });
        Ok(Self {
            client,
            channel: channel.to_string(),
        })
    }
}

#[async_trait]
impl MarkPublisher for PgMarkPublisher {
    async fn publish(&self, payload: &str) -> Result<(), MarkError> {
        self.client
            .execute("select pg_notify($1, $2)", &[&self.channel, &payload])
            .await
            .map(|_| ())
            .map_err(|e| MarkError::Publish(e.to_string()))
    }
}

pub fn valid_channel(c: &str) -> bool {
    let mut it = c.chars();
    matches!(it.next(), Some(ch) if ch.is_ascii_lowercase() || ch == '_')
        && c.len() <= 63
        && it.all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_')
}

pub fn is_uuid(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 36
        && b.iter().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => *c == b'-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// Decimal string with up to `max_frac` fraction digits, trailing zeros trimmed; never exponent notation.
pub fn decimal(v: f64, max_frac: usize) -> String {
    let s = format!("{v:.max_frac$}");
    if s.contains('.') {
        let t = s.trim_end_matches('0').trim_end_matches('.');
        if t.is_empty() || t == "-" {
            "0".into()
        } else {
            t.to_string()
        }
    } else {
        s
    }
}

fn rfc3339_ms(ts_ms: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ts_ms)
        .unwrap_or_default()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

/// Builds throttled marks from trade ticks (per mint, at most one per `min_interval_ms`).
pub struct MarkBuilder {
    pub workspace_id: String,
    pub sol_usd: f64,
    pub min_interval_ms: i64,
    last: HashMap<String, i64>,
}

impl MarkBuilder {
    /// `None` when marks cannot be produced honestly (non-uuid workspace or no SOL/USD reference).
    pub fn new(workspace_id: &str, sol_usd: Option<f64>, min_interval_ms: i64) -> Option<Self> {
        let sol_usd = sol_usd.filter(|v| v.is_finite() && *v > 0.0)?;
        if !is_uuid(workspace_id) {
            return None;
        }
        Some(Self {
            workspace_id: workspace_id.to_ascii_lowercase(),
            sol_usd,
            min_interval_ms: min_interval_ms.max(0),
            last: HashMap::new(),
        })
    }

    pub fn mark(&mut self, t: &TradeTick) -> Option<MarkMessage> {
        let pool = t.pool.as_ref()?;
        if pool.quote != QuoteAsset::Sol
            || pool.token_reserve.is_nan()
            || pool.sol_reserve.is_nan()
            || pool.token_reserve <= 0.0
            || pool.sol_reserve <= 0.0
        {
            return None; // non-SOL quotes are never converted
        }
        let price_sol = pool.mid_price();
        if !price_sol.is_finite() || price_sol <= 0.0 {
            return None;
        }
        let key = t.mint.as_str().to_string();
        if let Some(prev) = self.last.get(&key) {
            if t.ts - prev < self.min_interval_ms {
                return None;
            }
        }
        self.last.insert(key.clone(), t.ts);
        if self.last.len() > 50_000 {
            let cutoff = t.ts - 600_000;
            self.last.retain(|_, v| *v >= cutoff);
        }
        Some(MarkMessage {
            mint: key,
            price_sol: decimal(price_sol, 18),
            price_usd: decimal(price_sol * self.sol_usd, 18),
            // curve approximation: both sides valued at the SOL side
            liquidity_usd: (2.0 * pool.sol_reserve * self.sol_usd * 100.0).round() / 100.0,
            slot: 0,
            ts: rfc3339_ms(t.ts),
            position_ids: Vec::new(),
        })
    }

    pub fn payload(&self, m: &MarkMessage) -> Result<String, MarkError> {
        let s = serde_json::to_string(&Envelope {
            workspace_id: &self.workspace_id,
            mode: "practice",
            mark: m,
        })
        .map_err(|e| MarkError::Publish(e.to_string()))?;
        if s.len() > MAX_PAYLOAD {
            return Err(MarkError::TooLarge(s.len()));
        }
        Ok(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use common::Mint;
    use papersim::{PoolState, Side};

    const WS: &str = "10000000-0000-0000-0000-0000000000a1";
    const MINT: &str = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";

    fn tick(ts: i64, quote: QuoteAsset) -> TradeTick {
        TradeTick {
            mint: Mint::parse(MINT).expect("test"),
            side: Side::Buy,
            sol: 0.5,
            tokens: 1.0,
            trader: "t".into(),
            ts,
            pool: Some(PoolState {
                sol_reserve: 30.0,
                token_reserve: 1_000_000_000.0,
                quote,
            }),
        }
    }

    #[test]
    fn builder_requires_uuid_workspace_and_sol_usd() {
        assert!(MarkBuilder::new("local-dev", Some(150.0), 0).is_none());
        assert!(MarkBuilder::new(WS, None, 0).is_none());
        assert!(MarkBuilder::new(WS, Some(0.0), 0).is_none());
        assert!(MarkBuilder::new(WS, Some(f64::NAN), 0).is_none());
        assert!(MarkBuilder::new(WS, Some(150.0), 0).is_some());
    }

    #[test]
    fn mark_prices_are_decimal_strings_and_payload_matches_api() {
        let mut b = MarkBuilder::new(WS, Some(150.0), 1000).expect("test");
        let m = b
            .mark(&tick(1_761_700_000_123, QuoteAsset::Sol))
            .expect("test");
        assert_eq!(m.price_sol, "0.00000003");
        assert_eq!(m.price_usd, "0.0000045");
        assert_eq!(m.liquidity_usd, 9000.0);
        assert_eq!(m.ts, "2025-10-29T01:06:40.123Z");
        assert_eq!(m.slot, 0);
        let p: serde_json::Value =
            serde_json::from_str(&b.payload(&m).expect("test")).expect("test");
        assert_eq!(p["workspace_id"], WS);
        assert_eq!(p["mode"], "practice");
        assert_eq!(p["mark"]["mint"], MINT);
        assert_eq!(p["mark"]["position_ids"], serde_json::json!([]));
        assert!(!p.to_string().contains("e-"), "no exponent notation");
    }

    #[test]
    fn throttles_per_mint_and_skips_non_sol_quotes_and_missing_pools() {
        let mut b = MarkBuilder::new(WS, Some(150.0), 1000).expect("test");
        assert!(b.mark(&tick(10_000, QuoteAsset::Sol)).is_some());
        assert!(b.mark(&tick(10_500, QuoteAsset::Sol)).is_none());
        assert!(b.mark(&tick(11_000, QuoteAsset::Sol)).is_some());
        assert!(b.mark(&tick(20_000, QuoteAsset::Other([7; 32]))).is_none());
        let mut t = tick(30_000, QuoteAsset::Sol);
        t.pool = None;
        assert!(b.mark(&t).is_none());
    }

    #[test]
    fn decimal_formatting() {
        assert_eq!(decimal(1.5, 18), "1.5");
        assert_eq!(decimal(0.0, 18), "0");
        assert_eq!(decimal(2.0, 18), "2");
        assert_eq!(decimal(1e-12, 18), "0.000000000001");
    }

    #[test]
    fn channel_and_uuid_checks() {
        assert!(valid_channel("sentra_marks"));
        assert!(!valid_channel("x; drop"));
        assert!(!valid_channel("1abc"));
        assert!(is_uuid(WS));
        assert!(!is_uuid("local-dev"));
    }

    #[tokio::test]
    async fn memory_publisher_collects() {
        let p = MemoryMarkPublisher::default();
        p.publish("{}").await.expect("test");
        assert_eq!(p.sent.lock().await.len(), 1);
    }

    /// Real NOTIFY round trip; runs when SENTRA_PG_TEST_URL points at a Postgres (CI and local).
    #[tokio::test]
    async fn pg_notify_round_trip() {
        let Ok(url) = std::env::var("SENTRA_PG_TEST_URL") else {
            eprintln!("SENTRA_PG_TEST_URL not set; skipping");
            return;
        };
        let (listener, mut conn) = tokio_postgres::connect(&url, tokio_postgres::NoTls)
            .await
            .expect("test");
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let stream = futures_util::stream::poll_fn(move |cx| conn.poll_message(cx));
        tokio::spawn(async move {
            use futures_util::StreamExt;
            let mut stream = std::pin::pin!(stream);
            while let Some(Ok(m)) = stream.next().await {
                if let tokio_postgres::AsyncMessage::Notification(n) = m {
                    let _ = tx.send(n.payload().to_string());
                }
            }
        });
        listener
            .batch_execute("listen sentra_marks_test")
            .await
            .expect("test");
        let publisher = PgMarkPublisher::connect(&url, "sentra_marks_test")
            .await
            .expect("test");
        let mut b = MarkBuilder::new(WS, Some(150.0), 0).expect("test");
        let m = b.mark(&tick(1_000, QuoteAsset::Sol)).expect("test");
        publisher
            .publish(&b.payload(&m).expect("test"))
            .await
            .expect("test");
        let got = tokio::time::timeout(std::time::Duration::from_secs(5), rx.recv())
            .await
            .expect("test")
            .expect("test");
        let v: serde_json::Value = serde_json::from_str(&got).expect("test");
        assert_eq!(v["mark"]["price_sol"], "0.00000003");
    }
}
