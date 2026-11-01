//! JSON-RPC backfill for stream gaps (provider-agnostic; any Solana JSON-RPC endpoint).
//!
//! When a stream source reconnects (or reports a gap), the slots it missed are recovered with
//! `getSignaturesForAddress(<launch program>)` (newest first, paged with `before`) plus one
//! `getTransaction` per missed signature, decoded with the same launch-program event decoder the
//! live stream uses. Guarantees:
//!
//! * **Bounded window:** never older than `last_slot` (the newest slot the stream already saw)
//!   and never more than `max_slots` behind the chain tip, at most `max_signatures` signatures and
//!   `max_pages` signature pages. Hitting a bound sets `truncated` (logged; coins in the part that
//!   is not recovered are simply missed, never guessed).
//! * **Rate budget:** a token bucket (`rps`, `burst`) shared by every request of a backfill run.
//! * **Dedup:** a bounded [`SeenSignatures`] set shared with the live stream; a signature is
//!   emitted once whichever path sees it first. Failed transactions are skipped.
//! * Emitted oldest first, so downstream ordering matches the stream.
//!
//! Paper only: read-only RPC methods, no keys, no signing.

use std::collections::{HashSet, VecDeque};
use std::time::Duration;

use async_trait::async_trait;
use base64::Engine;
use serde_json::{json, Value};

use crate::source::helius::{decode_event, get_transaction_request, CurveEvent};

/// Read-only JSON-RPC transport. `call` returns the raw response body.
#[async_trait]
pub trait RpcTransport: Send + Sync {
    async fn call(&self, body: &Value) -> Result<String, BackfillError>;
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum BackfillError {
    #[error("rpc transport: {0}")]
    Transport(String),
    #[error("rpc error: {0}")]
    Rpc(String),
    #[error("decode: {0}")]
    Decode(String),
}

/// HTTPS JSON-RPC transport. The URL may carry a provider key; it is never logged
/// (errors are reported `without_url`).
pub struct HttpRpc {
    pub url: String,
    pub http: reqwest::Client,
}

impl std::fmt::Debug for HttpRpc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("HttpRpc { url: *** }")
    }
}

#[async_trait]
impl RpcTransport for HttpRpc {
    async fn call(&self, body: &Value) -> Result<String, BackfillError> {
        let r = self
            .http
            .post(&self.url)
            .json(body)
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| BackfillError::Transport(e.without_url().to_string()))?;
        if r.status().as_u16() == 429 {
            return Err(BackfillError::Rpc("rate limited (429)".into()));
        }
        r.text()
            .await
            .map_err(|e| BackfillError::Transport(e.without_url().to_string()))
    }
}

/// Backfill bounds and budget (env: `BACKFILL_*`, see config.rs).
#[derive(Debug, Clone, PartialEq)]
pub struct BackfillConfig {
    pub enabled: bool,
    /// Never look further back than this many slots behind the newest signature (~0.4 s/slot).
    pub max_slots: u64,
    pub max_signatures: usize,
    pub max_pages: usize,
    /// `getSignaturesForAddress` page size (RPC max 1000).
    pub page_limit: usize,
    /// Token bucket: sustained requests per second and burst.
    pub rps: f64,
    pub burst: f64,
}

impl Default for BackfillConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_slots: 1_500,
            max_signatures: 2_000,
            max_pages: 5,
            page_limit: 1_000,
            rps: 5.0,
            burst: 10.0,
        }
    }
}

/// Token bucket. Pure (time is passed in) so it is testable without a clock.
#[derive(Debug, Clone)]
pub struct RateBudget {
    rps: f64,
    burst: f64,
    tokens: f64,
    last_ms: i64,
}

impl RateBudget {
    pub fn new(rps: f64, burst: f64, now_ms: i64) -> Self {
        let rps = rps.max(0.01);
        let burst = burst.max(1.0);
        Self {
            rps,
            burst,
            tokens: burst,
            last_ms: now_ms,
        }
    }
    /// Take one token at `now_ms`; `Err(wait_ms)` = come back after that long.
    pub fn take(&mut self, now_ms: i64) -> Result<(), u64> {
        let dt = (now_ms - self.last_ms).max(0) as f64 / 1000.0;
        self.tokens = (self.tokens + dt * self.rps).min(self.burst);
        self.last_ms = now_ms.max(self.last_ms);
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            Ok(())
        } else {
            Err((((1.0 - self.tokens) / self.rps) * 1000.0).ceil() as u64)
        }
    }
    async fn acquire(&mut self) {
        loop {
            match self.take(now_ms()) {
                Ok(()) => return,
                Err(w) => tokio::time::sleep(Duration::from_millis(w.max(1))).await,
            }
        }
    }
}

/// Bounded set of recently seen signatures (FIFO eviction), shared by stream and backfill.
#[derive(Debug)]
pub struct SeenSignatures {
    cap: usize,
    order: VecDeque<String>,
    set: HashSet<String>,
}

impl SeenSignatures {
    pub fn new(cap: usize) -> Self {
        Self {
            cap: cap.max(1),
            order: VecDeque::new(),
            set: HashSet::new(),
        }
    }
    /// `true` when `sig` was not seen before (and records it).
    pub fn insert(&mut self, sig: &str) -> bool {
        if self.set.contains(sig) {
            return false;
        }
        if self.order.len() >= self.cap {
            if let Some(old) = self.order.pop_front() {
                self.set.remove(&old);
            }
        }
        self.order.push_back(sig.to_owned());
        self.set.insert(sig.to_owned());
        true
    }
    pub fn contains(&self, sig: &str) -> bool {
        self.set.contains(sig)
    }
    pub fn len(&self) -> usize {
        self.order.len()
    }
    pub fn is_empty(&self) -> bool {
        self.order.is_empty()
    }
}

/// Stream position the backfill resumes from.
#[derive(Debug, Default)]
pub struct StreamCursor {
    /// Newest slot the live stream delivered (`None` = nothing yet: no backfill on first connect).
    pub last_slot: Option<u64>,
    pub seen: Option<SeenSignatures>,
}

impl StreamCursor {
    pub fn new(cap: usize) -> Self {
        Self {
            last_slot: None,
            seen: Some(SeenSignatures::new(cap)),
        }
    }
    /// Record a live-stream signature; `true` = new.
    pub fn observe(&mut self, sig: &str, slot: u64) -> bool {
        self.last_slot = Some(self.last_slot.map_or(slot, |s| s.max(slot)));
        self.seen.as_mut().is_none_or(|s| s.insert(sig))
    }
}

/// One recovered transaction.
#[derive(Debug, Clone, PartialEq)]
pub struct Recovered {
    pub signature: String,
    pub slot: u64,
    pub block_time_ms: Option<i64>,
    pub events: Vec<CurveEvent>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct BackfillReport {
    pub pages: usize,
    pub scanned: usize,
    pub failed_skipped: usize,
    pub dup_skipped: usize,
    pub fetched: usize,
    pub unavailable: usize,
    pub truncated: bool,
    pub truncated_by: Option<&'static str>,
    pub recovered: Vec<Recovered>,
}

pub fn get_signatures_request(id: u64, address: &str, before: Option<&str>, limit: usize) -> Value {
    let mut opts = json!({ "limit": limit.clamp(1, 1000), "commitment": "confirmed" });
    if let Some(b) = before {
        opts["before"] = json!(b);
    }
    json!({ "jsonrpc": "2.0", "id": id, "method": "getSignaturesForAddress", "params": [address, opts] })
}

#[derive(Debug, Clone, PartialEq)]
pub struct SigInfo {
    pub signature: String,
    pub slot: u64,
    pub failed: bool,
}

fn rpc_result(raw: &str) -> Result<Value, BackfillError> {
    let v: Value = serde_json::from_str(raw).map_err(|e| BackfillError::Decode(e.to_string()))?;
    if let Some(e) = v.get("error") {
        return Err(BackfillError::Rpc(
            e.get("message")
                .and_then(Value::as_str)
                .unwrap_or("error")
                .to_owned(),
        ));
    }
    Ok(v.get("result").cloned().unwrap_or(Value::Null))
}

pub fn parse_signatures(raw: &str) -> Result<Vec<SigInfo>, BackfillError> {
    let r = rpc_result(raw)?;
    let arr = r
        .as_array()
        .ok_or_else(|| BackfillError::Decode("result is not an array".into()))?;
    arr.iter()
        .map(|e| {
            Ok(SigInfo {
                signature: e
                    .get("signature")
                    .and_then(Value::as_str)
                    .ok_or_else(|| BackfillError::Decode("signature".into()))?
                    .to_owned(),
                slot: e
                    .get("slot")
                    .and_then(Value::as_u64)
                    .ok_or_else(|| BackfillError::Decode("slot".into()))?,
                failed: e.get("err").is_some_and(|x| !x.is_null()),
            })
        })
        .collect()
}

/// Decode launch-program events from a `getTransaction` (`json` encoding) response.
/// `Ok(None)` = the node does not have the transaction (yet).
pub fn parse_transaction_events(raw: &str) -> Result<Option<Recovered>, BackfillError> {
    let r = rpc_result(raw)?;
    if r.is_null() {
        return Ok(None);
    }
    let meta = r
        .get("meta")
        .ok_or_else(|| BackfillError::Decode("meta".into()))?;
    let signature = r
        .pointer("/transaction/signatures/0")
        .and_then(Value::as_str)
        .ok_or_else(|| BackfillError::Decode("signature".into()))?
        .to_owned();
    let slot = r
        .get("slot")
        .and_then(Value::as_u64)
        .ok_or_else(|| BackfillError::Decode("slot".into()))?;
    if meta.get("err").is_some_and(|e| !e.is_null()) {
        return Ok(Some(Recovered {
            signature,
            slot,
            block_time_ms: None,
            events: vec![],
        }));
    }
    let b64 = base64::engine::general_purpose::STANDARD;
    let events = meta
        .get("logMessages")
        .and_then(Value::as_array)
        .map(|logs| {
            logs.iter()
                .filter_map(Value::as_str)
                .filter_map(|l| l.strip_prefix("Program data: "))
                .filter_map(|d| b64.decode(d.trim()).ok())
                .filter_map(|bytes| decode_event(&bytes))
                .collect()
        })
        .unwrap_or_default();
    let block_time_ms = r.get("blockTime").and_then(Value::as_i64).map(|t| t * 1000);
    Ok(Some(Recovered {
        signature,
        slot,
        block_time_ms,
        events,
    }))
}

pub(crate) fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Recover the launch-program transactions newer than `last_slot`, within the configured bounds.
/// `seen` is consulted (and updated) so nothing the live stream already delivered is re-emitted.
pub async fn backfill(
    rpc: &dyn RpcTransport,
    cfg: &BackfillConfig,
    program: &str,
    last_slot: u64,
    seen: &tokio::sync::Mutex<StreamCursor>,
) -> Result<BackfillReport, BackfillError> {
    let mut rep = BackfillReport::default();
    let mut budget = RateBudget::new(cfg.rps, cfg.burst, now_ms());
    let mut before: Option<String> = None;
    let mut tip: Option<u64> = None;
    let mut todo: Vec<SigInfo> = Vec::new();
    let mut id = 1u64;
    'pages: loop {
        if rep.pages >= cfg.max_pages {
            rep.truncated_by = Some("max_pages");
            break;
        }
        budget.acquire().await;
        let raw = rpc
            .call(&get_signatures_request(
                id,
                program,
                before.as_deref(),
                cfg.page_limit,
            ))
            .await?;
        crate::meter::global().add("backfill_rpc", raw.len());
        id += 1;
        rep.pages += 1;
        let page = parse_signatures(&raw)?;
        let full = page.len() >= cfg.page_limit.clamp(1, 1000);
        for s in page {
            let t = *tip.get_or_insert(s.slot);
            if s.slot <= last_slot {
                break 'pages; // reached what the stream already covered
            }
            if t.saturating_sub(s.slot) > cfg.max_slots {
                rep.truncated_by = Some("max_slots");
                break 'pages;
            }
            if rep.scanned >= cfg.max_signatures {
                rep.truncated_by = Some("max_signatures");
                break 'pages;
            }
            rep.scanned += 1;
            before = Some(s.signature.clone());
            if s.failed {
                rep.failed_skipped += 1;
            } else if seen
                .lock()
                .await
                .seen
                .as_ref()
                .is_some_and(|x| x.contains(&s.signature))
            {
                rep.dup_skipped += 1;
            } else {
                todo.push(s);
            }
        }
        if !full {
            break;
        }
    }
    rep.truncated = rep.truncated_by.is_some();
    // oldest first, like the stream
    todo.reverse();
    for s in todo {
        // the stream may have delivered it while we were paging
        if !seen
            .lock()
            .await
            .seen
            .as_mut()
            .is_none_or(|x| x.insert(&s.signature))
        {
            rep.dup_skipped += 1;
            continue;
        }
        budget.acquire().await;
        let raw = rpc.call(&get_transaction_request(id, &s.signature)).await?;
        crate::meter::global().add("backfill_rpc", raw.len());
        id += 1;
        rep.fetched += 1;
        match parse_transaction_events(&raw)? {
            Some(r) if !r.events.is_empty() => rep.recovered.push(r),
            Some(_) => {}
            None => rep.unavailable += 1,
        }
    }
    Ok(rep)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    const PROGRAM: &str = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

    fn fixture(dir: &str, name: &str) -> String {
        let p = format!("{}/{dir}/{name}", env!("CARGO_MANIFEST_DIR"));
        std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{p}: {e}"))
    }

    /// Scripted transport: answers by method (+ `before` cursor), records every request.
    struct Scripted {
        pages: Vec<(Option<&'static str>, String)>,
        txs: Vec<(&'static str, String)>,
        calls: StdMutex<Vec<Value>>,
    }
    #[async_trait]
    impl RpcTransport for Scripted {
        async fn call(&self, body: &Value) -> Result<String, BackfillError> {
            self.calls.lock().expect("lock").push(body.clone());
            match body["method"].as_str() {
                Some("getSignaturesForAddress") => {
                    let before = body["params"][1].get("before").and_then(Value::as_str);
                    Ok(self
                        .pages
                        .iter()
                        .find(|(b, _)| *b == before)
                        .map(|(_, r)| r.clone())
                        .unwrap_or_else(|| r#"{"jsonrpc":"2.0","result":[],"id":1}"#.into()))
                }
                Some("getTransaction") => {
                    let sig = body["params"][0].as_str().unwrap_or_default();
                    Ok(self
                        .txs
                        .iter()
                        .find(|(s, _)| *s == sig)
                        .map(|(_, r)| r.clone())
                        .unwrap_or_else(|| r#"{"jsonrpc":"2.0","result":null,"id":1}"#.into()))
                }
                _ => Err(BackfillError::Rpc("unexpected".into())),
            }
        }
    }
    impl Scripted {
        fn methods(&self) -> Vec<String> {
            self.calls
                .lock()
                .expect("lock")
                .iter()
                .map(|c| c["method"].as_str().unwrap_or_default().to_owned())
                .collect()
        }
    }

    const CREATE_SIG: &str =
        "5DT6QVW9gAz6rwcFezH3CA4PK5NpuhVW51B63wpWXV398yhH7WHsNPjUQvFqcHLSqqNhaZ6xp5FdPN52Cc449GLM";

    fn scripted() -> Scripted {
        Scripted {
            pages: vec![(None, fixture("fixtures/backfill", "signatures_page1.json"))],
            txs: vec![(
                CREATE_SIG,
                fixture(
                    "../../fixtures/mainnet",
                    "get_transaction_create.2026-10-29.json",
                ),
            )],
            calls: StdMutex::new(vec![]),
        }
    }
    fn fast() -> BackfillConfig {
        BackfillConfig {
            rps: 1_000.0,
            burst: 1_000.0,
            ..BackfillConfig::default()
        }
    }

    #[test]
    fn request_shapes() {
        let r = get_signatures_request(3, PROGRAM, Some("abc"), 5000);
        assert_eq!(r["method"], "getSignaturesForAddress");
        assert_eq!(r["params"][0], PROGRAM);
        assert_eq!(r["params"][1]["limit"], 1000);
        assert_eq!(r["params"][1]["before"], "abc");
        assert_eq!(r["params"][1]["commitment"], "confirmed");
        assert!(get_signatures_request(1, PROGRAM, None, 10)["params"][1]
            .get("before")
            .is_none());
    }

    #[test]
    fn parses_signature_pages_and_rpc_errors() {
        let p =
            parse_signatures(&fixture("fixtures/backfill", "signatures_page1.json")).expect("page");
        assert_eq!(p.len(), 5);
        assert!(p[1].failed);
        assert_eq!(p[0].slot, 462_832_950);
        assert_eq!(
            parse_signatures(
                r#"{"jsonrpc":"2.0","error":{"code":-32005,"message":"busy"},"id":1}"#
            ),
            Err(BackfillError::Rpc("busy".into()))
        );
    }

    #[test]
    fn mainnet_transaction_decodes_create_event() {
        let r = parse_transaction_events(&fixture(
            "../../fixtures/mainnet",
            "get_transaction_create.2026-10-29.json",
        ))
        .expect("ok")
        .expect("present");
        assert_eq!(r.signature, CREATE_SIG);
        assert_eq!(r.slot, 462_832_912);
        assert_eq!(r.block_time_ms, Some(1_793_266_607_000));
        assert!(r.events.iter().any(|e| matches!(e, CurveEvent::Created { mint, .. } if mint == "McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW")));
        assert_eq!(
            parse_transaction_events(r#"{"jsonrpc":"2.0","result":null,"id":1}"#),
            Ok(None)
        );
    }

    #[tokio::test]
    async fn recovers_missed_create_skips_failed_and_dedups_against_stream() {
        let rpc = scripted();
        let cursor = tokio::sync::Mutex::new(StreamCursor::new(100));
        // the stream already delivered one signature of the window
        cursor.lock().await.observe("2jm2SzCUzrvCU6KJZM8yDdfMHDAhvnD5zjAZVeq7c6RFYMyFFVKsxkvWZUAErk6NaMtdicA9mFpwYGgEedQbVbJ9", 462_832_906);
        let rep = backfill(&rpc, &fast(), PROGRAM, 462_832_900, &cursor)
            .await
            .expect("backfill");
        // page: 950 (unknown tx), 940 (failed), 912 (create), 906 (seen), 890 (<= last_slot: stop)
        assert_eq!(rep.scanned, 4);
        assert_eq!(rep.failed_skipped, 1);
        assert_eq!(rep.dup_skipped, 1);
        assert_eq!(rep.fetched, 2);
        assert_eq!(rep.unavailable, 1);
        assert!(!rep.truncated);
        assert_eq!(rep.recovered.len(), 1);
        assert_eq!(rep.recovered[0].signature, CREATE_SIG);
        // oldest first: the create (912) was fetched before the 950 one
        let calls = rpc.calls.lock().expect("lock").clone();
        assert_eq!(calls[1]["params"][0], CREATE_SIG);
        // a second run (e.g. another reconnect) re-emits nothing
        let again = backfill(&rpc, &fast(), PROGRAM, 462_832_900, &cursor)
            .await
            .expect("again");
        assert!(again.recovered.is_empty());
        assert_eq!(again.fetched, 0);
        assert!(
            !cursor.lock().await.observe(CREATE_SIG, 462_832_912),
            "stream sees it as a dup too"
        );
    }

    #[tokio::test]
    async fn window_bounds_truncate() {
        let rpc = scripted();
        let cursor = tokio::sync::Mutex::new(StreamCursor::new(100));
        let cfg = BackfillConfig {
            max_slots: 20,
            ..fast()
        };
        let rep = backfill(&rpc, &cfg, PROGRAM, 0, &cursor)
            .await
            .expect("backfill");
        assert!(rep.truncated);
        assert_eq!(rep.truncated_by, Some("max_slots"));
        assert_eq!(rep.scanned, 2, "950 and 940 are within 20 slots of the tip");
        let cfg = BackfillConfig {
            max_signatures: 1,
            ..fast()
        };
        let rep = backfill(
            &rpc,
            &cfg,
            PROGRAM,
            0,
            &tokio::sync::Mutex::new(StreamCursor::new(100)),
        )
        .await
        .expect("b");
        assert_eq!(rep.truncated_by, Some("max_signatures"));
        assert_eq!(rep.scanned, 1);
    }

    #[tokio::test]
    async fn pages_with_before_cursor_until_max_pages() {
        let page = |sig: &str, slot: u64| {
            format!(
                r#"{{"jsonrpc":"2.0","id":1,"result":[{{"signature":"{sig}","slot":{slot},"err":null}}]}}"#
            )
        };
        let rpc = Scripted {
            pages: vec![
                (None, page("s3", 103)),
                (Some("s3"), page("s2", 102)),
                (Some("s2"), page("s1", 101)),
            ],
            txs: vec![],
            calls: StdMutex::new(vec![]),
        };
        let cfg = BackfillConfig {
            page_limit: 1,
            max_pages: 2,
            ..fast()
        };
        let rep = backfill(
            &rpc,
            &cfg,
            PROGRAM,
            0,
            &tokio::sync::Mutex::new(StreamCursor::new(10)),
        )
        .await
        .expect("b");
        assert_eq!(rep.pages, 2);
        assert_eq!(rep.truncated_by, Some("max_pages"));
        assert_eq!(rep.scanned, 2);
        assert_eq!(
            rpc.methods(),
            vec![
                "getSignaturesForAddress",
                "getSignaturesForAddress",
                "getTransaction",
                "getTransaction"
            ]
        );
    }

    #[tokio::test]
    async fn rpc_error_aborts_without_emitting() {
        let rpc = Scripted {
            pages: vec![(
                None,
                r#"{"jsonrpc":"2.0","error":{"code":429,"message":"rate limited"},"id":1}"#.into(),
            )],
            txs: vec![],
            calls: StdMutex::new(vec![]),
        };
        let err = backfill(
            &rpc,
            &fast(),
            PROGRAM,
            0,
            &tokio::sync::Mutex::new(StreamCursor::new(10)),
        )
        .await;
        assert_eq!(err, Err(BackfillError::Rpc("rate limited".into())));
    }

    #[test]
    fn rate_budget_bursts_then_spaces_requests() {
        let mut b = RateBudget::new(2.0, 3.0, 0);
        assert!(b.take(0).is_ok());
        assert!(b.take(0).is_ok());
        assert!(b.take(0).is_ok());
        assert_eq!(b.take(0), Err(500));
        assert_eq!(b.take(250), Err(250));
        assert!(b.take(500).is_ok());
        assert!(b.take(10_000).is_ok());
        assert!(b.take(10_000).is_ok());
        assert!(b.take(10_000).is_ok());
        assert!(b.take(10_000).is_err(), "refill is capped at the burst");
    }

    #[test]
    fn seen_set_is_bounded_fifo() {
        let mut s = SeenSignatures::new(2);
        assert!(s.insert("a"));
        assert!(!s.insert("a"));
        assert!(s.insert("b"));
        assert!(s.insert("c"));
        assert!(!s.contains("a"), "oldest evicted");
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn http_rpc_debug_hides_url() {
        let h = HttpRpc {
            url: "https://rpc.example/?api-key=SECRET".into(),
            http: reqwest::Client::new(),
        };
        assert!(!format!("{h:?}").contains("SECRET"));
    }
}
