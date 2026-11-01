//! Geyser (Yellowstone gRPC) source, **provider-agnostic**: Helius LaserStream, Triton, Shyft,
//! Alchemy or self-hosted all speak the same Yellowstone `Subscribe` API; only the endpoint and the
//! `x-token` differ, and both come from env (`YELLOWSTONE_GRPC_URL`, `YELLOWSTONE_X_TOKEN`).
//!
//! What is here (no new dependencies):
//! * [`GeyserConfig`]: endpoint, x-token (secret), commitment, Pump program / account filters, parsed
//!   and validated from env.
//! * [`GeyserSubscribe`]: the provider-neutral subscription (Yellowstone `SubscribeRequest` field
//!   names: `transactions.account_include`, `vote`, `failed`, `accounts.owner`, `commitment`).
//! * [`GeyserTransport`] / [`GeyserStream`]: the seam a gRPC client plugs into. The `tonic` +
//!   `yellowstone-grpc-proto` transport is **not** added yet (new deps need review); until then the
//!   default transport returns `NotImplemented`.
//! * [`YellowstoneSource`]: the stream loop over any transport: launch-program events are decoded
//!   from transaction logs with the same decoder as the Helius WebSocket source, metered
//!   (`yellowstone` bytes/day) and deduplicated by signature.
use async_trait::async_trait;
use base64::Engine as _;
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};

use super::{IngestEvent, SourceError, StreamSource};
use crate::config::{ConfigError, Secret};

/// Program ids we filter on (public, on-chain).
pub const PUMP_FUN_PROGRAM: &str = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
pub const PUMP_SWAP_PROGRAM: &str = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Commitment {
    Processed,
    Confirmed,
    Finalized,
}

impl Commitment {
    pub fn as_str(self) -> &'static str {
        match self {
            Commitment::Processed => "processed",
            Commitment::Confirmed => "confirmed",
            Commitment::Finalized => "finalized",
        }
    }
    fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "processed" => Some(Self::Processed),
            "confirmed" => Some(Self::Confirmed),
            "finalized" => Some(Self::Finalized),
            _ => None,
        }
    }
}

/// Provider-agnostic Geyser settings (env only; the token never appears in Debug or logs).
#[derive(Debug, Clone, PartialEq)]
pub struct GeyserConfig {
    pub endpoint: String,
    pub x_token: Secret,
    /// `YELLOWSTONE_COMMITMENT` (default `processed`: discovery; fills are still simulated).
    pub commitment: Commitment,
    /// Transactions touching any of these programs (`YELLOWSTONE_PROGRAMS`, default Pump + PumpSwap).
    pub programs: Vec<String>,
    /// Account updates for accounts owned by these programs (`YELLOWSTONE_ACCOUNT_OWNERS`, default
    /// Pump: bonding curves). Empty = no account subscription.
    pub account_owners: Vec<String>,
}

fn is_base58_pubkey(s: &str) -> bool {
    bs58::decode(s).into_vec().is_ok_and(|v| v.len() == 32)
}

impl GeyserConfig {
    /// `Ok(None)` when no endpoint is configured.
    pub fn from_lookup(get: &impl Fn(&str) -> Option<String>) -> Result<Option<Self>, ConfigError> {
        let Some(endpoint) = get("YELLOWSTONE_GRPC_URL") else {
            return Ok(None);
        };
        let e = endpoint.trim().to_owned();
        if !(e.starts_with("https://") || e.starts_with("http://")) {
            return Err(ConfigError::Invalid(
                "YELLOWSTONE_GRPC_URL",
                "must be an http(s) URL".into(),
            ));
        }
        if e.contains('?') || e.to_ascii_lowercase().contains("token") {
            return Err(ConfigError::Invalid(
                "YELLOWSTONE_GRPC_URL",
                "must not carry the token; set YELLOWSTONE_X_TOKEN".into(),
            ));
        }
        let commitment = match get("YELLOWSTONE_COMMITMENT") {
            None => Commitment::Processed,
            Some(c) => {
                Commitment::parse(&c).ok_or(ConfigError::Invalid("YELLOWSTONE_COMMITMENT", c))?
            }
        };
        let list = |k: &'static str, d: &[&str]| -> Result<Vec<String>, ConfigError> {
            let v: Vec<String> = match get(k) {
                None => d.iter().map(|s| (*s).to_owned()).collect(),
                Some(s) => s
                    .split(',')
                    .map(|x| x.trim().to_owned())
                    .filter(|x| !x.is_empty())
                    .collect(),
            };
            match v.iter().find(|p| !is_base58_pubkey(p)) {
                Some(bad) => Err(ConfigError::Invalid(k, bad.clone())),
                None => Ok(v),
            }
        };
        let programs = list(
            "YELLOWSTONE_PROGRAMS",
            &[PUMP_FUN_PROGRAM, PUMP_SWAP_PROGRAM],
        )?;
        if programs.is_empty() {
            return Err(ConfigError::Invalid("YELLOWSTONE_PROGRAMS", "empty".into()));
        }
        Ok(Some(Self {
            endpoint: e,
            x_token: Secret::from_env_value(get("YELLOWSTONE_X_TOKEN").unwrap_or_default()),
            commitment,
            programs,
            account_owners: list("YELLOWSTONE_ACCOUNT_OWNERS", &[PUMP_FUN_PROGRAM])?,
        }))
    }

    pub fn subscribe(&self) -> GeyserSubscribe {
        GeyserSubscribe {
            commitment: self.commitment,
            programs: self.programs.clone(),
            account_owners: self.account_owners.clone(),
            from_slot: None,
        }
    }
}

/// Provider-neutral subscription. `from_slot` = resume point after a reconnect (providers that keep
/// history replay from it; others start live and the JSON-RPC backfill covers the gap).
#[derive(Debug, Clone, PartialEq)]
pub struct GeyserSubscribe {
    pub commitment: Commitment,
    pub programs: Vec<String>,
    pub account_owners: Vec<String>,
    pub from_slot: Option<u64>,
}

impl GeyserSubscribe {
    /// Yellowstone `SubscribeRequest` shape (proto field names), for the transport and for logs.
    pub fn to_request(&self) -> Value {
        let mut r = json!({
            "transactions": { "pump": {
                "vote": false, "failed": false,
                "account_include": self.programs, "account_exclude": [], "account_required": []
            }},
            "commitment": self.commitment.as_str(),
            "ping": { "id": 1 },
        });
        if !self.account_owners.is_empty() {
            r["accounts"] = json!({ "pump_curves": { "account": [], "owner": self.account_owners, "filters": [] } });
        }
        if let Some(s) = self.from_slot {
            r["from_slot"] = json!(s);
        }
        r
    }
}

/// One update, already transport-decoded (provider/proto independent).
#[derive(Debug, Clone, PartialEq)]
pub enum GeyserUpdate {
    Transaction {
        signature: String,
        slot: u64,
        failed: bool,
        log_messages: Vec<String>,
        wire_bytes: usize,
    },
    Account {
        pubkey: String,
        owner: String,
        slot: u64,
        data: Vec<u8>,
        wire_bytes: usize,
    },
    Slot {
        slot: u64,
    },
    Pong,
}

#[async_trait]
pub trait GeyserStream: Send {
    /// `None` = stream ended (reconnect).
    async fn next(&mut self) -> Option<Result<GeyserUpdate, SourceError>>;
}

#[async_trait]
pub trait GeyserTransport: Send + Sync {
    async fn subscribe(
        &self,
        cfg: &GeyserConfig,
        req: &GeyserSubscribe,
    ) -> Result<Box<dyn GeyserStream>, SourceError>;
}

/// Placeholder until a gRPC transport is reviewed and added.
pub struct NoTransport;

#[async_trait]
impl GeyserTransport for NoTransport {
    async fn subscribe(
        &self,
        _: &GeyserConfig,
        _: &GeyserSubscribe,
    ) -> Result<Box<dyn GeyserStream>, SourceError> {
        Err(SourceError::NotImplemented(
            "yellowstone grpc transport (tonic + yellowstone-grpc-proto pending review)",
        ))
    }
}

pub struct YellowstoneSource {
    pub cfg: Option<GeyserConfig>,
    pub transport: Box<dyn GeyserTransport>,
    pub cursor: tokio::sync::Mutex<crate::backfill::StreamCursor>,
}

impl YellowstoneSource {
    pub fn new(cfg: Option<GeyserConfig>) -> Self {
        Self {
            cfg,
            transport: Box::new(NoTransport),
            cursor: tokio::sync::Mutex::new(crate::backfill::StreamCursor::new(50_000)),
        }
    }

    /// Map one update to ingest events (dedup by signature; failed transactions skipped).
    pub async fn on_update(&self, u: GeyserUpdate) -> Vec<IngestEvent> {
        match u {
            GeyserUpdate::Transaction {
                signature,
                slot,
                failed,
                log_messages,
                wire_bytes,
            } => {
                crate::meter::global().add("yellowstone", wire_bytes);
                if failed || !self.cursor.lock().await.observe(&signature, slot) {
                    return vec![];
                }
                let b64 = base64::engine::general_purpose::STANDARD;
                log_messages
                    .iter()
                    .filter_map(|l| l.strip_prefix("Program data: "))
                    .filter_map(|d| b64.decode(d.trim()).ok())
                    .filter_map(|b| super::helius::decode_event(&b))
                    .filter_map(|ev| super::helius::to_ingest(ev, super::helius::now_ms()))
                    .collect()
            }
            GeyserUpdate::Account { wire_bytes, .. } => {
                // curve account updates feed the curve cache once the transport lands
                crate::meter::global().add("yellowstone", wire_bytes);
                vec![]
            }
            GeyserUpdate::Slot { .. } | GeyserUpdate::Pong => vec![],
        }
    }
}

#[async_trait]
impl StreamSource for YellowstoneSource {
    fn name(&self) -> &'static str {
        "yellowstone"
    }
    async fn run(
        &self,
        tx: mpsc::Sender<IngestEvent>,
        mut shutdown: watch::Receiver<bool>,
    ) -> Result<(), SourceError> {
        let Some(cfg) = &self.cfg else {
            return Err(SourceError::NotConfigured("YELLOWSTONE_GRPC_URL"));
        };
        if cfg.x_token.is_empty() {
            return Err(SourceError::NotConfigured("YELLOWSTONE_X_TOKEN"));
        }
        let mut attempt = 0u32;
        loop {
            let mut req = cfg.subscribe();
            req.from_slot = self.cursor.lock().await.last_slot;
            let why = match self.transport.subscribe(cfg, &req).await {
                Err(SourceError::NotImplemented(w)) => return Err(SourceError::NotImplemented(w)),
                Err(e) => e.to_string(),
                Ok(mut stream) => loop {
                    tokio::select! {
                        _ = shutdown.changed() => if *shutdown.borrow() { return Ok(()) },
                        u = stream.next() => match u {
                            None => break "stream ended".to_owned(),
                            Some(Err(e)) => break e.to_string(),
                            Some(Ok(u)) => {
                                attempt = 0;
                                for ev in self.on_update(u).await {
                                    if tx.send(ev).await.is_err() { return Err(SourceError::ChannelClosed) }
                                }
                            }
                        }
                    }
                },
            };
            let wait = super::helius::backoff(attempt);
            tracing::warn!(reason = %why.replace(cfg.x_token.expose(), "***"), wait_ms = wait.as_millis() as u64, "yellowstone reconnect");
            attempt = attempt.saturating_add(1);
            tokio::select! {
                _ = tokio::time::sleep(wait) => {}
                _ = shutdown.changed() => if *shutdown.borrow() { return Ok(()) },
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn get<'a>(m: &'a HashMap<&'static str, &'static str>) -> impl Fn(&str) -> Option<String> + 'a {
        move |k| m.get(k).map(|v| v.to_string())
    }

    #[test]
    fn config_defaults_validation_and_redaction() {
        assert_eq!(
            GeyserConfig::from_lookup(&get(&HashMap::new())).expect("ok"),
            None
        );
        let m = HashMap::from([
            ("YELLOWSTONE_GRPC_URL", "https://geyser.example:443"),
            ("YELLOWSTONE_X_TOKEN", "tok-secret"),
        ]);
        let c = GeyserConfig::from_lookup(&get(&m))
            .expect("ok")
            .expect("some");
        assert_eq!(c.commitment, Commitment::Processed);
        assert_eq!(c.programs, vec![PUMP_FUN_PROGRAM, PUMP_SWAP_PROGRAM]);
        assert_eq!(c.account_owners, vec![PUMP_FUN_PROGRAM]);
        assert!(!format!("{c:?}").contains("tok-secret"));
        for (k, v) in [
            (
                "YELLOWSTONE_GRPC_URL",
                "https://geyser.example/?x-token=abc",
            ),
            ("YELLOWSTONE_GRPC_URL", "geyser.example:443"),
            ("YELLOWSTONE_COMMITMENT", "fast"),
            ("YELLOWSTONE_PROGRAMS", "notapubkey"),
            ("YELLOWSTONE_ACCOUNT_OWNERS", "x"),
        ] {
            let mut m = m.clone();
            m.insert(k, v);
            assert!(
                matches!(GeyserConfig::from_lookup(&get(&m)), Err(ConfigError::Invalid(kk, _)) if kk == k),
                "{k}={v}"
            );
        }
        let mut m2 = m.clone();
        m2.insert("YELLOWSTONE_COMMITMENT", "Confirmed");
        m2.insert("YELLOWSTONE_ACCOUNT_OWNERS", "");
        let c = GeyserConfig::from_lookup(&get(&m2))
            .expect("ok")
            .expect("some");
        assert_eq!(c.commitment, Commitment::Confirmed);
        assert!(c.account_owners.is_empty());
        assert!(c.subscribe().to_request().get("accounts").is_none());
    }

    #[test]
    fn subscribe_request_uses_yellowstone_field_names() {
        let m = HashMap::from([
            ("YELLOWSTONE_GRPC_URL", "https://g.example"),
            ("YELLOWSTONE_X_TOKEN", "t"),
        ]);
        let c = GeyserConfig::from_lookup(&get(&m))
            .expect("ok")
            .expect("some");
        let mut s = c.subscribe();
        s.from_slot = Some(42);
        let r = s.to_request();
        assert_eq!(r["transactions"]["pump"]["vote"], false);
        assert_eq!(r["transactions"]["pump"]["failed"], false);
        assert_eq!(
            r["transactions"]["pump"]["account_include"][0],
            PUMP_FUN_PROGRAM
        );
        assert_eq!(r["accounts"]["pump_curves"]["owner"][0], PUMP_FUN_PROGRAM);
        assert_eq!(r["commitment"], "processed");
        assert_eq!(r["from_slot"], 42);
        assert!(
            !r.to_string().contains("x_token"),
            "the token is metadata, never in the request body"
        );
    }

    struct Fake(std::sync::Mutex<Vec<GeyserUpdate>>);
    #[async_trait]
    impl GeyserStream for Fake {
        async fn next(&mut self) -> Option<Result<GeyserUpdate, SourceError>> {
            let mut v = self.0.lock().expect("lock");
            if v.is_empty() {
                None
            } else {
                Some(Ok(v.remove(0)))
            }
        }
    }

    #[tokio::test]
    async fn transaction_logs_decode_dedup_and_skip_failed() {
        let raw = std::fs::read_to_string(format!(
            "{}/../../fixtures/mainnet/get_transaction_create.2026-10-29.json",
            env!("CARGO_MANIFEST_DIR")
        ))
        .expect("fixture");
        let v: Value = serde_json::from_str(&raw).expect("json");
        let logs: Vec<String> = v["result"]["meta"]["logMessages"]
            .as_array()
            .expect("logs")
            .iter()
            .filter_map(|l| l.as_str().map(str::to_owned))
            .collect();
        let tx = |sig: &str, failed: bool| GeyserUpdate::Transaction {
            signature: sig.into(),
            slot: 462_832_912,
            failed,
            log_messages: logs.clone(),
            wire_bytes: 1000,
        };
        let src = YellowstoneSource::new(None);
        let evs = src.on_update(tx("sigA", false)).await;
        assert!(evs.iter().any(|e| matches!(e, IngestEvent::NewCoin(c) if c.mint.as_str() == "McWZrfqAAJXKzjKXDANWaVp52o7xBAfQCzjQHLhinBW")));
        assert!(
            src.on_update(tx("sigA", false)).await.is_empty(),
            "duplicate signature"
        );
        assert!(
            src.on_update(tx("sigB", true)).await.is_empty(),
            "failed tx"
        );
        assert_eq!(src.cursor.lock().await.last_slot, Some(462_832_912));
        let mut f: Box<dyn GeyserStream> =
            Box::new(Fake(std::sync::Mutex::new(vec![GeyserUpdate::Pong])));
        assert!(matches!(f.next().await, Some(Ok(GeyserUpdate::Pong))));
        assert!(f.next().await.is_none());
    }

    #[tokio::test]
    async fn not_configured_or_no_transport() {
        let (tx, _rx) = mpsc::channel(1);
        let (_s, srx) = watch::channel(false);
        let r = YellowstoneSource::new(None)
            .run(tx.clone(), srx.clone())
            .await;
        assert!(matches!(
            r,
            Err(SourceError::NotConfigured("YELLOWSTONE_GRPC_URL"))
        ));
        let m = HashMap::from([
            ("YELLOWSTONE_GRPC_URL", "https://g.example"),
            ("YELLOWSTONE_X_TOKEN", "t"),
        ]);
        let c = GeyserConfig::from_lookup(&get(&m)).expect("ok");
        let r = YellowstoneSource::new(c).run(tx, srx).await;
        assert!(matches!(r, Err(SourceError::NotImplemented(_))));
    }
}
