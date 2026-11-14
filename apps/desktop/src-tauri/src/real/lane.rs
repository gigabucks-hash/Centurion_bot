//! Network lane for a live swap. Security checks stay in `vet` and `quote_matches`.
//! This module only overlaps the reads, keeps the connections warm, and confirms on `confirmed`.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

use super::b64;
use super::speed::{
    blockhash_fresh, cu_limit_from_sim, jito_url, micro_lamports_per_cu, percentile_u64,
    prioritization_fee_field, priority_fee_lamports, quote_fresh, send_config, swap_body, ws_url,
    StageUs, CONFIRM_COMMITMENT,
};
use super::tx::{self, patch_compute_budget, TxRefuse};
use super::{quote_url, JUPITER_QUOTE, JUPITER_SWAP};

#[derive(Debug)]
pub enum BuildFail {
    Quote,
    Swap,
    Tx(TxRefuse),
    FeePayer,
    Simulation,
    Network,
}

pub struct SwapIn {
    pub input_mint: String,
    pub output_mint: String,
    pub amount: u64,
    pub slippage_bps: u32,
    pub wallet: String,
    pub owner: [u8; 32],
    pub tip_cap: u64,
    pub priority_cap: u64,
    pub percentile: u8,
    pub jito: bool,
    pub rpc_url: String,
    /// `None` uses the public Jupiter host. Tests pass a loopback base.
    pub quote_base: Option<String>,
    pub swap_url: Option<String>,
}

pub struct Built {
    pub b64: String,
    pub message: Vec<u8>,
    pub quote_us: u64,
    pub build_us: u64,
    pub simulated: bool,
    pub last_valid_block_height: u64,
    pub priority_fee_lamports: u64,
    pub min_out: u64,
}

struct QuoteHit {
    body: Value,
    at: Instant,
}

struct HashHit {
    rpc: String,
    hash: String,
    height: u64,
    at: Instant,
}

struct FeeHit {
    rpc: String,
    samples: Vec<u64>,
    at: Instant,
}

struct TokenHit {
    amount: u64,
    at: Instant,
}

struct Cache {
    quotes: HashMap<String, QuoteHit>,
    blockhash: Option<HashHit>,
    fees: Option<FeeHit>,
    tokens: HashMap<String, TokenHit>,
    rpc: String,
    wallet: String,
}

fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Mutex::new(Cache {
            quotes: HashMap::new(),
            blockhash: None,
            fees: None,
            tokens: HashMap::new(),
            rpc: "https://api.mainnet-beta.solana.com".into(),
            wallet: String::new(),
        })
    })
}

pub fn http() -> &'static reqwest::Client {
    static HTTP: OnceLock<reqwest::Client> = OnceLock::new();
    HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(12))
            .connect_timeout(Duration::from_secs(4))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(4)
            .tcp_keepalive(Duration::from_secs(30))
            .tcp_nodelay(true)
            .build()
            .expect("http client")
    })
}

/// Remember which RPC and wallet the background refresh should use. Empty `fast` keeps the primary.
pub fn use_endpoint(primary: &str, fast: &str, wallet: &str) {
    if let Ok(mut c) = cache().lock() {
        c.rpc = if fast.is_empty() {
            primary.to_owned()
        } else {
            fast.to_owned()
        };
        if !wallet.is_empty() {
            c.wallet = wallet.to_owned();
        }
    }
}

pub fn prewarm() {
    static STARTED: OnceLock<()> = OnceLock::new();
    if STARTED.set(()).is_err() {
        return;
    }
    tokio::spawn(async {
        let client = http();
        if let Ok(url) = quote_url(
            super::WSOL,
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            1_000,
            50,
        ) {
            let _ = client.get(url).send().await;
        }
        let rpc = cache()
            .lock()
            .ok()
            .map(|c| c.rpc.clone())
            .unwrap_or_default();
        if !rpc.is_empty() {
            let _ = rpc_call(
                client,
                &rpc,
                "getLatestBlockhash",
                json!([{"commitment": CONFIRM_COMMITMENT}]),
            )
            .await;
            let _ = rpc_call(client, &rpc, "getRecentPrioritizationFees", json!([])).await;
        }
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let (rpc, wallet) = match cache().lock() {
                Ok(c) => (c.rpc.clone(), c.wallet.clone()),
                Err(_) => continue,
            };
            if rpc.is_empty() {
                continue;
            }
            if let Ok(v) = rpc_call(
                client,
                &rpc,
                "getLatestBlockhash",
                json!([{"commitment": CONFIRM_COMMITMENT}]),
            )
            .await
            {
                store_blockhash(&rpc, &v);
            }
            if !wallet.is_empty() {
                let _ = refresh_tokens(client, &rpc, &wallet).await;
            }
        }
    });
}

pub async fn build_swap(req: SwapIn) -> Result<Built, BuildFail> {
    let started = Instant::now();
    let base = req.quote_base.as_deref().unwrap_or(JUPITER_QUOTE);
    let swap_url = req
        .swap_url
        .clone()
        .unwrap_or_else(|| JUPITER_SWAP.to_owned());
    let selling_cached = req.output_mint == super::WSOL && req.amount == 0;
    let client = http();
    let quote_url_now = if selling_cached {
        None
    } else {
        Some(quote_on(
            base,
            &req.input_mint,
            &req.output_mint,
            req.amount,
            req.slippage_bps,
        )?)
    };
    let quote_f = async {
        match quote_url_now {
            Some(url) => cached_quote(client, url).await,
            None => Ok(Value::Null),
        }
    };
    let hash_f = cached_blockhash(client, req.rpc_url.clone());
    let bal_f = wallet_balance(client, req.rpc_url.clone(), req.wallet.clone());
    let fee_f = cached_fees(client, req.rpc_url.clone());
    let token_f = token_amount(
        client,
        req.rpc_url.clone(),
        req.wallet.clone(),
        req.input_mint.clone(),
        selling_cached,
    );
    let (quote, hash, balance, fees, token) = tokio::join!(quote_f, hash_f, bal_f, fee_f, token_f);
    let mut quote_us = started.elapsed().as_micros() as u64;
    let amount = if selling_cached {
        token.ok_or(BuildFail::Quote)?
    } else {
        req.amount
    };
    let quote = if selling_cached {
        let url = quote_on(
            base,
            &req.input_mint,
            &req.output_mint,
            amount,
            req.slippage_bps,
        )?;
        let q = cached_quote(client, url).await?;
        quote_us = started.elapsed().as_micros() as u64;
        q
    } else {
        quote?
    };
    if req.input_mint == super::WSOL {
        if let Some(have) = balance {
            if have < amount {
                return Err(BuildFail::Quote);
            }
        }
    }
    if !super::quote_matches(
        &quote,
        &req.input_mint,
        &req.output_mint,
        amount,
        req.slippage_bps,
    ) {
        return Err(BuildFail::Quote);
    }
    let min_out = quote
        .get("otherAmountThreshold")
        .and_then(|v| v.as_str())
        .unwrap_or("0")
        .parse::<u64>()
        .unwrap_or(0);
    let tip = if req.jito { req.tip_cap } else { 0 };
    let fee_field = prioritization_fee_field(req.priority_cap, req.jito, tip);
    let body = swap_body(&quote, &req.wallet, fee_field);
    let build_started = Instant::now();
    let swap: Value = client
        .post(&swap_url)
        .json(&body)
        .send()
        .await
        .map_err(|_| BuildFail::Swap)?
        .json()
        .await
        .map_err(|_| BuildFail::Swap)?;
    let b64 = super::swap_tx_b64(&swap.to_string()).ok_or(BuildFail::Swap)?;
    let mut raw = b64::decode(&b64).map_err(|_| BuildFail::Swap)?;
    check_tx(&raw, &req.owner, req.tip_cap)?;
    let units = simulate(client, &req.rpc_url, &b64).await?;
    apply_budget(&mut raw, units, &fees, req.percentile, req.priority_cap)?;
    check_tx(&raw, &req.owner, req.tip_cap)?;
    let message = tx::message_bytes(&raw).map_err(BuildFail::Tx)?;
    let priority = fee_lamports_of(&raw, req.priority_cap);
    Ok(Built {
        b64: b64::encode(&raw),
        message,
        quote_us,
        build_us: build_started.elapsed().as_micros() as u64,
        simulated: true,
        last_valid_block_height: hash.map(|(_, h)| h).unwrap_or(0),
        priority_fee_lamports: priority,
        min_out,
    })
}

fn check_tx(raw: &[u8], owner: &[u8; 32], tip: u64) -> Result<(), BuildFail> {
    // A lookup table is unresolved until the caller loads it. `prove_swap` does that and vets again.
    // Every other refusal (unknown program, transfer out, tip over the cap) still stops here.
    match tx::vet(raw, owner, tip, &[]) {
        Ok(()) => {}
        Err(tx::TxRefuse::Unresolved) => {}
        Err(e) => return Err(BuildFail::Tx(e)),
    }
    if tx::fee_payer(raw).map_err(BuildFail::Tx)? != *owner {
        return Err(BuildFail::FeePayer);
    }
    Ok(())
}

fn apply_budget(
    raw: &mut [u8],
    units: u64,
    samples: &[u64],
    percentile: u8,
    cap: u64,
) -> Result<(), BuildFail> {
    let spans = tx::budget_spans(raw).map_err(BuildFail::Tx)?;
    let existing_limit = spans
        .limit_at
        .and_then(|at| raw.get(at..at + 4))
        .map(|b| u32::from_le_bytes(b.try_into().unwrap_or([0; 4])));
    let cu = if units > 0 {
        cu_limit_from_sim(units)
    } else {
        existing_limit.unwrap_or(0)
    };
    let micro = percentile_u64(samples, percentile);
    let desired = if samples.is_empty() {
        let current = match (spans.price_at, existing_limit) {
            (Some(at), Some(limit)) => {
                let price = raw
                    .get(at..at + 8)
                    .map(|b| u64::from_le_bytes(b.try_into().unwrap_or([0; 8])))
                    .unwrap_or(0);
                priority_fee_lamports(price, limit, u64::MAX)
            }
            _ => 0,
        };
        current.min(cap)
    } else if cu == 0 {
        0
    } else {
        priority_fee_lamports(micro, cu, cap)
    };
    let price = if cu == 0 {
        None
    } else {
        Some(micro_lamports_per_cu(desired, cu))
    };
    let limit = if units > 0 { Some(cu) } else { None };
    patch_compute_budget(raw, limit, price).map_err(BuildFail::Tx)?;
    if cap == 0 {
        if let Some(at) = tx::budget_spans(raw).ok().and_then(|s| s.price_at) {
            let left = raw
                .get(at..at + 8)
                .map(|b| u64::from_le_bytes(b.try_into().unwrap_or([0; 8])))
                .unwrap_or(0);
            if left != 0 {
                return Err(BuildFail::Simulation);
            }
        }
    }
    Ok(())
}

fn fee_lamports_of(raw: &[u8], cap: u64) -> u64 {
    let Ok(spans) = tx::budget_spans(raw) else {
        return 0;
    };
    let (Some(limit_at), Some(price_at)) = (spans.limit_at, spans.price_at) else {
        return 0;
    };
    let limit = raw
        .get(limit_at..limit_at + 4)
        .map(|b| u32::from_le_bytes(b.try_into().unwrap_or([0; 4])))
        .unwrap_or(0);
    let price = raw
        .get(price_at..price_at + 8)
        .map(|b| u64::from_le_bytes(b.try_into().unwrap_or([0; 8])))
        .unwrap_or(0);
    priority_fee_lamports(price, limit, cap)
}

pub async fn broadcast(
    rpc: &str,
    jito: bool,
    tip: u64,
    signed_b64: &str,
    simulated: bool,
    expiry_height: u64,
) -> Result<(String, StageUs), String> {
    let client = http();
    let started = Instant::now();
    let sig = send_once(client, rpc, signed_b64, simulated).await?;
    if let Some(url) = jito_url(jito, tip) {
        let _ = send_once(client, url, signed_b64, true).await;
    }
    let send_us = started.elapsed().as_micros() as u64;
    let confirm_started = Instant::now();
    confirm(client, rpc, &sig, expiry_height, signed_b64, simulated).await?;
    Ok((
        sig,
        StageUs {
            quote: 0,
            build: 0,
            sign: 0,
            send: send_us,
            confirm: confirm_started.elapsed().as_micros() as u64,
        },
    ))
}

async fn confirm(
    client: &reqwest::Client,
    rpc: &str,
    sig: &str,
    expiry_height: u64,
    signed_b64: &str,
    simulated: bool,
) -> Result<(), String> {
    let ws = ws_url(rpc);
    let sig_owned = sig.to_owned();
    let mut watch = tokio::spawn(async move {
        let Some(url) = ws else { return false };
        watch_signature(&url, &sig_owned).await
    });
    let mut ws_open = true;
    let deadline = Instant::now() + Duration::from_secs(45);
    loop {
        if ws_open {
            tokio::select! {
                joined = &mut watch => {
                    ws_open = false;
                    if matches!(joined, Ok(true)) {
                        return Ok(());
                    }
                }
                _ = tokio::time::sleep(Duration::from_millis(350)) => {}
            }
        } else {
            tokio::time::sleep(Duration::from_millis(350)).await;
        }
        let _ = send_once(client, rpc, signed_b64, simulated).await;
        if status_confirmed(client, rpc, sig).await {
            return Ok(());
        }
        if expiry_height > 0 {
            if let Ok(height) = block_height(client, rpc).await {
                if height > expiry_height {
                    return Err("blockhash expired".into());
                }
            }
        }
        if Instant::now() > deadline {
            return Err("not confirmed".into());
        }
    }
}

async fn watch_signature(url: &str, sig: &str) -> bool {
    let Ok((mut sock, _)) = tokio_tungstenite::connect_async(url).await else {
        return false;
    };
    let sub = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "signatureSubscribe",
        "params": [sig, {"commitment": CONFIRM_COMMITMENT}]
    });
    if sock
        .send(Message::Text(sub.to_string().into()))
        .await
        .is_err()
    {
        return false;
    }
    let deadline = Instant::now() + Duration::from_secs(40);
    while Instant::now() < deadline {
        let next = tokio::time::timeout(Duration::from_millis(1_500), sock.next()).await;
        let Ok(Some(Ok(msg))) = next else { continue };
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
            _ => continue,
        };
        let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        if v.get("method").and_then(|m| m.as_str()) == Some("signatureNotification") {
            let err = v.pointer("/params/result/value/err");
            return err.is_none() || err.is_some_and(Value::is_null);
        }
    }
    false
}

async fn send_once(
    client: &reqwest::Client,
    rpc: &str,
    signed_b64: &str,
    simulated: bool,
) -> Result<String, String> {
    let v = rpc_call(
        client,
        rpc,
        "sendTransaction",
        json!([signed_b64, send_config(simulated)]),
    )
    .await
    .map_err(|_| "rpc".to_string())?;
    v.as_str()
        .map(|s| s.to_owned())
        .ok_or_else(|| "rpc".to_string())
}

async fn status_confirmed(client: &reqwest::Client, rpc: &str, sig: &str) -> bool {
    let Ok(v) = rpc_call(
        client,
        rpc,
        "getSignatureStatuses",
        json!([[sig], {"searchTransactionHistory": false}]),
    )
    .await
    else {
        return false;
    };
    let row = &v["value"][0];
    if row.is_null() {
        return false;
    }
    if row.get("err").is_some_and(|err| !err.is_null()) {
        return false;
    }
    matches!(
        row.get("confirmationStatus").and_then(|s| s.as_str()),
        Some("confirmed" | "finalized")
    )
}

async fn block_height(client: &reqwest::Client, rpc: &str) -> Result<u64, ()> {
    let v = rpc_call(
        client,
        rpc,
        "getBlockHeight",
        json!([{"commitment": CONFIRM_COMMITMENT}]),
    )
    .await?;
    v.as_u64().ok_or(())
}

async fn simulate(client: &reqwest::Client, rpc: &str, b64: &str) -> Result<u64, BuildFail> {
    let v = rpc_call(
        client,
        rpc,
        "simulateTransaction",
        json!([b64, {"encoding": "base64", "commitment": "processed", "replaceRecentBlockhash": true, "sigVerify": false}]),
    )
    .await
    .map_err(|_| BuildFail::Simulation)?;
    let value = &v["value"];
    if value.get("err").is_some_and(|e| !e.is_null()) {
        return Err(BuildFail::Simulation);
    }
    Ok(value
        .get("unitsConsumed")
        .and_then(|n| n.as_u64())
        .unwrap_or(0))
}

async fn rpc_call(
    client: &reqwest::Client,
    url: &str,
    method: &str,
    params: Value,
) -> Result<Value, ()> {
    let body = json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params});
    let v: Value = client
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|_| ())?
        .json()
        .await
        .map_err(|_| ())?;
    if v.get("error").is_some() {
        return Err(());
    }
    Ok(v.get("result").cloned().unwrap_or(Value::Null))
}

async fn cached_quote(client: &reqwest::Client, url: String) -> Result<Value, BuildFail> {
    if let Ok(c) = cache().lock() {
        if let Some(hit) = c.quotes.get(&url) {
            if quote_fresh(hit.at, Instant::now()) {
                return Ok(hit.body.clone());
            }
        }
    }
    let v: Value = client
        .get(&url)
        .send()
        .await
        .map_err(|_| BuildFail::Quote)?
        .json()
        .await
        .map_err(|_| BuildFail::Quote)?;
    if v.get("error").is_some() {
        return Err(BuildFail::Quote);
    }
    if let Ok(mut c) = cache().lock() {
        if c.quotes.len() > 32 {
            c.quotes.clear();
        }
        c.quotes.insert(
            url,
            QuoteHit {
                body: v.clone(),
                at: Instant::now(),
            },
        );
    }
    Ok(v)
}

async fn cached_blockhash(
    client: &reqwest::Client,
    rpc: String,
) -> Result<(String, u64), BuildFail> {
    if let Ok(c) = cache().lock() {
        if let Some(hit) = &c.blockhash {
            if hit.rpc == rpc && blockhash_fresh(hit.at, Instant::now()) {
                return Ok((hit.hash.clone(), hit.height));
            }
        }
    }
    let v = rpc_call(
        client,
        &rpc,
        "getLatestBlockhash",
        json!([{"commitment": CONFIRM_COMMITMENT}]),
    )
    .await
    .map_err(|_| BuildFail::Network)?;
    store_blockhash(&rpc, &v);
    let hash = v["value"]["blockhash"].as_str().unwrap_or("").to_owned();
    let height = v["value"]["lastValidBlockHeight"].as_u64().unwrap_or(0);
    if hash.is_empty() {
        return Err(BuildFail::Network);
    }
    Ok((hash, height))
}

fn store_blockhash(rpc: &str, v: &Value) {
    let Some(hash) = v["value"]["blockhash"].as_str() else {
        return;
    };
    let height = v["value"]["lastValidBlockHeight"].as_u64().unwrap_or(0);
    if let Ok(mut c) = cache().lock() {
        c.blockhash = Some(HashHit {
            rpc: rpc.to_owned(),
            hash: hash.to_owned(),
            height,
            at: Instant::now(),
        });
    }
}

async fn cached_fees(client: &reqwest::Client, rpc: String) -> Vec<u64> {
    if let Ok(c) = cache().lock() {
        if let Some(hit) = &c.fees {
            if hit.rpc == rpc && quote_fresh(hit.at, Instant::now()) {
                return hit.samples.clone();
            }
        }
    }
    let Ok(v) = rpc_call(client, &rpc, "getRecentPrioritizationFees", json!([])).await else {
        return Vec::new();
    };
    let samples = v
        .as_array()
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.get("prioritizationFee").and_then(|n| n.as_u64()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if let Ok(mut c) = cache().lock() {
        c.fees = Some(FeeHit {
            rpc,
            samples: samples.clone(),
            at: Instant::now(),
        });
    }
    samples
}

async fn wallet_balance(client: &reqwest::Client, rpc: String, wallet: String) -> Option<u64> {
    let v = rpc_call(
        client,
        &rpc,
        "getBalance",
        json!([wallet, {"commitment": CONFIRM_COMMITMENT}]),
    )
    .await
    .ok()?;
    v.get("value").and_then(|n| n.as_u64())
}

async fn token_amount(
    client: &reqwest::Client,
    rpc: String,
    wallet: String,
    mint: String,
    needed: bool,
) -> Option<u64> {
    if !needed {
        return None;
    }
    let key = format!("{wallet}:{mint}");
    if let Ok(c) = cache().lock() {
        if let Some(hit) = c.tokens.get(&key) {
            if blockhash_fresh(hit.at, Instant::now()) {
                return Some(hit.amount);
            }
        }
    }
    refresh_tokens(client, &rpc, &wallet).await.ok()?;
    cache().lock().ok()?.tokens.get(&key).map(|hit| hit.amount)
}

async fn refresh_tokens(client: &reqwest::Client, rpc: &str, wallet: &str) -> Result<(), ()> {
    for program in [
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    ] {
        let v = rpc_call(
            client,
            rpc,
            "getTokenAccountsByOwner",
            json!([wallet, {"programId": program}, {"encoding": "jsonParsed", "commitment": CONFIRM_COMMITMENT}]),
        )
        .await?;
        let Some(rows) = v.get("value").and_then(|v| v.as_array()) else {
            continue;
        };
        let mut guard = cache().lock().map_err(|_| ())?;
        for row in rows {
            let info = &row["account"]["data"]["parsed"]["info"];
            let Some(mint) = info.get("mint").and_then(|m| m.as_str()) else {
                continue;
            };
            let amount = info["tokenAmount"]["amount"]
                .as_str()
                .unwrap_or("0")
                .parse::<u64>()
                .unwrap_or(0);
            guard.tokens.insert(
                format!("{wallet}:{mint}"),
                TokenHit {
                    amount,
                    at: Instant::now(),
                },
            );
        }
    }
    Ok(())
}

fn quote_on(
    base: &str,
    input: &str,
    output: &str,
    amount: u64,
    slippage: u32,
) -> Result<String, BuildFail> {
    let public = quote_url(input, output, amount, slippage).map_err(|_| BuildFail::Quote)?;
    let query = public.split_once('?').map(|(_, q)| q).unwrap_or("");
    Ok(format!("{base}?{query}"))
}

#[cfg(test)]
fn reset_cache() {
    if let Ok(mut c) = cache().lock() {
        c.quotes.clear();
        c.blockhash = None;
        c.fees = None;
        c.tokens.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::real::b58;
    use crate::real::tx::{legacy_tx, COMPUTE};

    fn owner() -> [u8; 32] {
        let mut o = [0u8; 32];
        o[0] = 9;
        o
    }

    fn wallet() -> String {
        b58::encode(&owner())
    }

    async fn serve(
        quote_delay_ms: u64,
        bad_min_out: bool,
    ) -> (
        String,
        std::sync::Arc<std::sync::atomic::AtomicUsize>,
        std::sync::Arc<Mutex<Vec<String>>>,
    ) {
        use std::sync::atomic::AtomicUsize;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let hits = std::sync::Arc::new(AtomicUsize::new(0));
        let seen = std::sync::Arc::new(Mutex::new(Vec::new()));
        let hits2 = hits.clone();
        let seen2 = seen.clone();
        tokio::spawn(async move {
            loop {
                let Ok((sock, _)) = listener.accept().await else {
                    break;
                };
                let hits = hits2.clone();
                let seen = seen2.clone();
                tokio::spawn(async move {
                    let _ = handle(sock, hits, seen, quote_delay_ms, bad_min_out).await;
                });
            }
        });
        (format!("http://{addr}"), hits, seen)
    }

    async fn handle(
        mut sock: tokio::net::TcpStream,
        hits: std::sync::Arc<std::sync::atomic::AtomicUsize>,
        seen: std::sync::Arc<Mutex<Vec<String>>>,
        quote_delay_ms: u64,
        bad_min_out: bool,
    ) -> Result<(), ()> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut buf = vec![0u8; 64 * 1024];
        let n = sock.read(&mut buf).await.map_err(|_| ())?;
        let req = String::from_utf8_lossy(&buf[..n]);
        let first = req.lines().next().unwrap_or("");
        let mut parts = first.split(' ');
        let method = parts.next().unwrap_or("");
        let path = parts.next().unwrap_or("");
        let body = req
            .split_once("\r\n\r\n")
            .map(|(_, b)| b.to_owned())
            .unwrap_or_default();
        let name = if method == "GET" && path.starts_with("/quote") {
            "quote".to_owned()
        } else if method == "POST" && path.starts_with("/swap") {
            "swap".to_owned()
        } else {
            serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| {
                    v.get("method")
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_owned())
                })
                .unwrap_or_else(|| "post".into())
        };
        if let Ok(mut s) = seen.lock() {
            s.push(name.clone());
        }
        if name == "quote" {
            hits.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(quote_delay_ms)).await;
        } else if name != "swap" {
            tokio::time::sleep(Duration::from_millis(quote_delay_ms)).await;
        }
        let payload = reply(&name, &body, bad_min_out);
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
            payload.len()
        );
        let _ = sock.write_all(resp.as_bytes()).await;
        Ok(())
    }

    fn reply(name: &str, body: &str, bad_min_out: bool) -> String {
        let wsol = crate::real::WSOL;
        let usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        if name == "quote" {
            let min_out = if bad_min_out { "1" } else { "970" };
            return json!({
                "inputMint": wsol,
                "outputMint": usdc,
                "inAmount": "50",
                "outAmount": "1000",
                "otherAmountThreshold": min_out,
                "slippageBps": 300,
                "platformFee": null,
                "routePlan": [{"swapInfo": {"inputMint": wsol, "outputMint": usdc}}]
            })
            .to_string();
        }
        if name == "swap" {
            let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
            assert_eq!(v["dynamicComputeUnitLimit"], true);
            assert!(v.get("prioritizationFeeLamports").is_some());
            let mut limit = vec![2u8];
            limit.extend_from_slice(&200_000u32.to_le_bytes());
            let mut price = vec![3u8];
            price.extend_from_slice(&5_000_000u64.to_le_bytes());
            let keys = [owner(), COMPUTE];
            let tx = legacy_tx(&keys, &[(1, &[], &limit), (1, &[], &price)]);
            return json!({"swapTransaction": b64::encode(&tx)}).to_string();
        }
        if name == "getLatestBlockhash" {
            return json!({"jsonrpc":"2.0","id":1,"result":{"value":{"blockhash":"11111111111111111111111111111111","lastValidBlockHeight":42}}}).to_string();
        }
        if name == "getRecentPrioritizationFees" {
            return json!({"jsonrpc":"2.0","id":1,"result":[{"prioritizationFee":100},{"prioritizationFee":400},{"prioritizationFee":900}]}).to_string();
        }
        if name == "getBalance" {
            return json!({"jsonrpc":"2.0","id":1,"result":{"value":5_000_000_000u64}}).to_string();
        }
        if name == "simulateTransaction" {
            let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
            assert_eq!(v["params"][1]["sigVerify"], false);
            return json!({"jsonrpc":"2.0","id":1,"result":{"value":{"err":null,"unitsConsumed":50000}}}).to_string();
        }
        if name == "sendTransaction" {
            let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
            assert_eq!(v["params"][1]["skipPreflight"], true);
            assert_eq!(v["params"][1]["maxRetries"], 0);
            assert_eq!(v["params"][1]["preflightCommitment"], "confirmed");
            return json!({"jsonrpc":"2.0","id":1,"result":"sig111"}).to_string();
        }
        if name == "getSignatureStatuses" {
            return json!({"jsonrpc":"2.0","id":1,"result":{"value":[{"err":null,"confirmationStatus":"confirmed"}]}}).to_string();
        }
        if name == "getBlockHeight" {
            return json!({"jsonrpc":"2.0","id":1,"result":10}).to_string();
        }
        json!({"jsonrpc":"2.0","id":1,"result":null}).to_string()
    }

    fn input(base: &str) -> SwapIn {
        SwapIn {
            input_mint: crate::real::WSOL.into(),
            output_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v".into(),
            amount: 50,
            slippage_bps: 300,
            wallet: wallet(),
            owner: owner(),
            tip_cap: 0,
            priority_cap: 1_000,
            percentile: 50,
            jito: false,
            rpc_url: format!("{base}/rpc"),
            quote_base: Some(format!("{base}/quote")),
            swap_url: Some(format!("{base}/swap")),
        }
    }

    #[tokio::test]
    async fn quote_blockhash_and_fees_overlap_and_a_second_quote_is_cached() {
        reset_cache();
        let (base, hits, seen) = serve(40, false).await;
        let built = build_swap(input(&base)).await.expect("build");
        assert!(built.simulated);
        assert_ne!(built.priority_fee_lamports, 0);
        let raw = b64::decode(&built.b64).unwrap();
        let spans = tx::budget_spans(&raw).unwrap();
        let at = spans.limit_at.expect("limit");
        let limit = u32::from_le_bytes(raw[at..at + 4].try_into().unwrap());
        assert_eq!(limit, 55_000, "simulation units, not the 200_000 default");
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
        let _ = build_swap(input(&base)).await.expect("cached quote");
        assert_eq!(
            hits.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "quote ttl covers the second build"
        );
        let names: Vec<String> = seen
            .lock()
            .unwrap()
            .iter()
            .map(|s| s.split(':').next().unwrap_or("").to_owned())
            .collect();
        let quote_at = names.iter().position(|n| n == "quote").unwrap();
        let swap_at = names.iter().position(|n| n == "swap").unwrap();
        assert!(quote_at < swap_at);
        assert!(names.iter().any(|n| n == "getLatestBlockhash"));
        assert!(names.iter().any(|n| n == "getRecentPrioritizationFees"));
        let (sig, stages) = broadcast(&format!("{base}/rpc"), false, 0, &built.b64, true, 42)
            .await
            .unwrap();
        assert_eq!(sig, "sig111");
        assert!(
            stages.confirm < 5_000_000,
            "confirmed without a finalized wait, got {}us",
            stages.confirm
        );
    }

    #[tokio::test]
    async fn a_quote_below_min_out_never_builds() {
        reset_cache();
        let (base, hits, seen) = serve(1, true).await;
        let err = build_swap(input(&base)).await.err();
        assert!(matches!(err, Some(BuildFail::Quote)));
        let names: Vec<String> = seen
            .lock()
            .unwrap()
            .iter()
            .map(|s| s.split(':').next().unwrap_or("").to_owned())
            .collect();
        assert!(!names.iter().any(|n| n == "swap"));
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}
