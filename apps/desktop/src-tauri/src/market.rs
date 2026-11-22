//! GeckoTerminal free candles. The webview cannot open that host, so this command does.
//! Paths are exact: one token's pools, and one pool's OHLCV. No key, no redirects.

use crate::util::{is_valid_mint, now_ms};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

const GECKO: &str = "https://api.geckoterminal.com";
const WSOL: &str = "So11111111111111111111111111111111111111112";
const POOL_TTL_MS: u64 = 10 * 60_000;

pub(crate) struct Pool {
    address: String,
    base: String,
    quote: String,
    pair: String,
}

struct Gate {
    pools: HashMap<String, (Pool, u64)>,
    bars: HashMap<String, (Value, u64)>,
    next: HashMap<String, u64>,
    fails: HashMap<String, u32>,
}

fn gate() -> &'static tokio::sync::Mutex<Gate> {
    static GATE: OnceLock<tokio::sync::Mutex<Gate>> = OnceLock::new();
    GATE.get_or_init(|| {
        tokio::sync::Mutex::new(Gate {
            pools: HashMap::new(),
            bars: HashMap::new(),
            next: HashMap::new(),
            fails: HashMap::new(),
        })
    })
}

fn client() -> &'static reqwest::Client {
    static HTTP: OnceLock<reqwest::Client> = OnceLock::new();
    HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(8))
            .build()
            .expect("market http client")
    })
}

pub(crate) fn market_url_ok(raw: &str) -> bool {
    if raw.contains("..") {
        return false;
    }
    let Ok(u) = reqwest::Url::parse(raw) else {
        return false;
    };
    if u.scheme() != "https"
        || !u.username().is_empty()
        || u.password().is_some()
        || u.port().is_some()
    {
        return false;
    }
    if u.host_str() != Some("api.geckoterminal.com") {
        return false;
    }
    let path = u.path();
    if path == "/api/v2/networks/solana/new_pools" {
        return false;
    }
    gecko_path(path)
}

fn gecko_path(path: &str) -> bool {
    if let Some(rest) = path.strip_prefix("/api/v2/networks/solana/tokens/") {
        let Some((mint, tail)) = rest.split_once('/') else {
            return false;
        };
        return tail == "pools" && is_valid_mint(mint);
    }
    if let Some(rest) = path.strip_prefix("/api/v2/networks/solana/pools/") {
        let Some((pool, tail)) = rest.split_once('/') else {
            return false;
        };
        return is_valid_mint(pool) && matches!(tail, "ohlcv/minute" | "ohlcv/hour" | "ohlcv/day");
    }
    false
}

fn frame(tf: &str) -> Option<(&'static str, u32, u64)> {
    Some(match tf {
        "1m" => ("minute", 1, 20_000),
        "5m" => ("minute", 5, 60_000),
        "15m" => ("minute", 15, 60_000),
        "1h" => ("hour", 1, 60_000),
        "4h" => ("hour", 4, 60_000),
        "1d" => ("day", 1, 60_000),
        _ => return None,
    })
}

fn num(v: Option<&Value>) -> f64 {
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

fn mint_of(v: Option<&Value>) -> String {
    let Some(s) = v.and_then(|x| x.as_str()) else {
        return String::new();
    };
    let raw = s.strip_prefix("solana_").unwrap_or(s);
    if is_valid_mint(raw) {
        raw.to_owned()
    } else {
        String::new()
    }
}

pub(crate) fn pick_pool(v: &Value, mint: &str) -> Option<Pool> {
    let rows = v.get("data")?.as_array()?;
    let mut best: Option<(Pool, f64, f64)> = None;
    for row in rows {
        let address = row
            .pointer("/attributes/address")
            .and_then(|x| x.as_str())
            .unwrap_or("");
        if !is_valid_mint(address) {
            continue;
        }
        let base = mint_of(row.pointer("/relationships/base_token/data/id"));
        let quote = mint_of(row.pointer("/relationships/quote_token/data/id"));
        if base != mint && quote != mint {
            continue;
        }
        let reserve = num(row.pointer("/attributes/reserve_in_usd"));
        let volume = num(row.pointer("/attributes/volume_usd/h24"));
        let pair = row
            .pointer("/attributes/name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .chars()
            .filter(|c| !c.is_control())
            .take(48)
            .collect::<String>();
        let pool = Pool {
            address: address.to_owned(),
            base,
            quote,
            pair,
        };
        let replace = match &best {
            None => true,
            Some((_, r, vol)) => reserve > *r || (reserve == *r && volume > *vol),
        };
        if replace {
            best = Some((pool, reserve, volume));
        }
    }
    best.map(|(pool, _, _)| pool)
}

pub(crate) fn parse_ohlcv(v: &Value) -> Vec<Value> {
    let Some(list) = v
        .pointer("/data/attributes/ohlcv_list")
        .and_then(|x| x.as_array())
    else {
        return Vec::new();
    };
    let mut by_time: HashMap<i64, Value> = HashMap::new();
    for row in list {
        let Some(row) = row.as_array() else { continue };
        if row.len() < 6 {
            continue;
        }
        let time = num(Some(&row[0])).trunc() as i64;
        let open = num(Some(&row[1]));
        let high = num(Some(&row[2]));
        let low = num(Some(&row[3]));
        let close = num(Some(&row[4]));
        let volume = num(Some(&row[5]));
        if time <= 0 || open <= 0.0 || high <= 0.0 || low <= 0.0 || close <= 0.0 {
            continue;
        }
        by_time.entry(time).or_insert_with(|| {
            json!({"time": time, "open": open, "high": high, "low": low, "close": close, "volume": volume})
        });
    }
    let mut out: Vec<(i64, Value)> = by_time.into_iter().collect();
    out.sort_by_key(|(t, _)| *t);
    out.into_iter().map(|(_, v)| v).collect()
}

fn sol_side(pool: &Pool, mint: &str) -> Option<&'static str> {
    if pool.base == mint && pool.quote == WSOL {
        Some("base")
    } else if pool.quote == mint && pool.base == WSOL {
        Some("quote")
    } else {
        None
    }
}

async fn get_json(url: &str) -> Result<Value, bool> {
    let now = now_ms();
    {
        let g = gate().lock().await;
        if g.next.get(url).copied().unwrap_or(0) > now {
            return Err(true);
        }
    }
    let res = client()
        .get(url)
        .header("accept", "application/json")
        .header("user-agent", "CenturionTrade/chart")
        .send()
        .await;
    let Ok(res) = res else {
        note_fail(url).await;
        return Err(false);
    };
    if res.status().as_u16() == 429 {
        note_fail(url).await;
        return Err(true);
    }
    if !res.status().is_success() {
        note_fail(url).await;
        return Err(false);
    }
    let body = res.bytes().await.unwrap_or_default();
    if body.len() > 1_500_000 {
        return Err(false);
    }
    let Ok(v) = serde_json::from_slice::<Value>(&body) else {
        return Err(false);
    };
    let mut g = gate().lock().await;
    g.fails.remove(url);
    g.next.remove(url);
    Ok(v)
}

async fn note_fail(url: &str) {
    let mut g = gate().lock().await;
    let fails = g.fails.get(url).copied().unwrap_or(0).saturating_add(1);
    g.fails.insert(url.to_owned(), fails);
    let wait = 5_000u64.saturating_mul(1u64 << fails.min(4)).min(60_000);
    g.next.insert(url.to_owned(), now_ms().saturating_add(wait));
}

pub async fn load(mint: &str, tf: &str, currency: &str) -> Value {
    let empty = |reason: &str| json!({"ok": false, "reason": reason, "candles": [], "pool": null, "pair": null, "solSide": null, "currency": "usd", "attribution": null});
    if !is_valid_mint(mint) {
        return empty("unavailable");
    }
    let Some((frame, aggregate, ttl)) = frame(tf) else {
        return empty("unavailable");
    };
    let now = now_ms();
    let pool = {
        let g = gate().lock().await;
        g.pools
            .get(mint)
            .filter(|(_, at)| now.saturating_sub(*at) < POOL_TTL_MS)
            .map(|(p, _)| Pool {
                address: p.address.clone(),
                base: p.base.clone(),
                quote: p.quote.clone(),
                pair: p.pair.clone(),
            })
    };
    let pool = if let Some(pool) = pool {
        pool
    } else {
        let url = format!("{GECKO}/api/v2/networks/solana/tokens/{mint}/pools?page=1");
        if !market_url_ok(&url) {
            return empty("unavailable");
        }
        let body = match get_json(&url).await {
            Ok(v) => v,
            Err(true) => return empty("rate"),
            Err(false) => return empty("unavailable"),
        };
        let Some(pool) = pick_pool(&body, mint) else {
            return empty("unavailable");
        };
        gate().lock().await.pools.insert(
            mint.to_owned(),
            (
                Pool {
                    address: pool.address.clone(),
                    base: pool.base.clone(),
                    quote: pool.quote.clone(),
                    pair: pool.pair.clone(),
                },
                now,
            ),
        );
        pool
    };
    let side = sol_side(&pool, mint);
    let use_sol = currency == "sol" && side.is_some();
    let key = format!(
        "{}|{tf}|{}",
        pool.address,
        if use_sol { "sol" } else { "usd" }
    );
    if let Some((cached, at)) = gate().lock().await.bars.get(&key) {
        if now.saturating_sub(*at) < ttl {
            return cached.clone();
        }
    }
    let mut url = format!(
        "{GECKO}/api/v2/networks/solana/pools/{}/ohlcv/{frame}?aggregate={aggregate}&limit=300&currency={}",
        pool.address,
        if use_sol { "token" } else { "usd" }
    );
    if use_sol {
        url.push_str("&token=");
        url.push_str(side.unwrap_or("base"));
    }
    if !market_url_ok(&url) {
        return empty("unavailable");
    }
    let body = match get_json(&url).await {
        Ok(v) => v,
        Err(true) => return empty("rate"),
        Err(false) => return empty("unavailable"),
    };
    let candles = parse_ohlcv(&body);
    let attribution = format!(
        "https://www.geckoterminal.com/solana/pools/{}",
        pool.address
    );
    if candles.is_empty() {
        return json!({"ok": false, "reason": "unavailable", "candles": [], "pool": pool.address, "pair": pool.pair, "solSide": side, "currency": "usd", "attribution": attribution});
    }
    let out = json!({
        "ok": true,
        "reason": "ok",
        "candles": candles,
        "pool": pool.address,
        "pair": pool.pair,
        "solSide": side,
        "currency": if use_sol { "sol" } else { "usd" },
        "attribution": attribution,
    });
    gate().lock().await.bars.insert(key, (out.clone(), now));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINT: &str = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";
    const POOL: &str = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

    #[test]
    fn candle_urls_are_exact() {
        let pools = format!("{GECKO}/api/v2/networks/solana/tokens/{MINT}/pools?page=1");
        let bars = format!("{GECKO}/api/v2/networks/solana/pools/{POOL}/ohlcv/minute?aggregate=15&limit=300&currency=usd");
        assert!(market_url_ok(&pools));
        assert!(market_url_ok(&bars));
        assert!(!market_url_ok(&format!(
            "{GECKO}/api/v2/networks/solana/pools"
        )));
        assert!(!market_url_ok(&format!(
            "{GECKO}/api/v2/networks/solana/pools/{POOL}/ohlcv/minute/../day"
        )));
        assert!(!market_url_ok(
            "https://api.geckoterminal.com.evil/api/v2/networks/solana/tokens/x/pools"
        ));
    }

    #[test]
    fn deepest_pool_and_sorted_candles() {
        let body = json!({"data": [
            {"attributes": {"address": POOL, "reserve_in_usd": "10", "volume_usd": {"h24": "1"}},
             "relationships": {"base_token": {"data": {"id": format!("solana_{MINT}")}}, "quote_token": {"data": {"id": format!("solana_{WSOL}")}}}},
            {"attributes": {"address": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", "reserve_in_usd": "90", "volume_usd": {"h24": "1"}},
             "relationships": {"base_token": {"data": {"id": format!("solana_{MINT}")}}, "quote_token": {"data": {"id": format!("solana_{WSOL}")}}}}
        ]});
        let pool = pick_pool(&body, MINT).unwrap();
        assert_eq!(pool.address, "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R");
        assert_eq!(sol_side(&pool, MINT), Some("base"));
        let bars = json!({"data": {"attributes": {"ohlcv_list": [[200, 2, 3, 1, 2.5, 10], [100, 1, 2, 0.5, 1.5, 4]]}}});
        let candles = parse_ohlcv(&bars);
        assert_eq!(candles[0]["time"], 100);
        assert_eq!(candles[1]["close"], 2.5);
    }
}
