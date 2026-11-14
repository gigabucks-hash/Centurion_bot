//! Read-only market discovery for the Explore tab.
//!
//! The webview cannot open these hosts (connect-src is local IPC only). This module fetches
//! them. The host list is exact: Jupiter's free token API and GeckoTerminal's public new-pool
//! API. Swap, quote, and order paths are rejected. Redirects are not followed. Token names are
//! parsed in the UI with the same sanitizer the web app uses; this module never buys.

use crate::util::{is_valid_mint, now_ms};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

const JUPITER: &str = "lite-api.jup.ag";
const GECKO: &str = "api.geckoterminal.com";
const MAX_BODY: usize = 1_500_000;
const TTL_MS: u64 = 12_000;

#[derive(Clone)]
struct Slot {
    at_ms: u64,
    next_ms: u64,
    fails: u32,
    rate: bool,
    json: Option<Value>,
}

fn cache() -> &'static tokio::sync::Mutex<HashMap<String, Slot>> {
    static CACHE: OnceLock<tokio::sync::Mutex<HashMap<String, Slot>>> = OnceLock::new();
    CACHE.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()))
}

fn client() -> &'static reqwest::Client {
    static HTTP: OnceLock<reqwest::Client> = OnceLock::new();
    HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(8))
            .connect_timeout(Duration::from_secs(4))
            .build()
            .expect("explore http client")
    })
}

/// Exact https hosts and read-only paths. Userinfo, ports, and swap/quote paths fail.
pub fn url_allowed(raw: &str) -> bool {
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
    let Some(host) = u.host_str() else {
        return false;
    };
    let path = u.path();
    if path.contains("..") || path.contains("//") {
        return false;
    }
    let lower = path.to_ascii_lowercase();
    if lower.contains("swap")
        || lower.contains("quote")
        || lower.contains("order")
        || lower.contains("transfer")
    {
        return false;
    }
    match host {
        JUPITER => path.starts_with("/tokens/v2/"),
        GECKO => path == "/api/v2/networks/solana/new_pools",
        _ => false,
    }
}

pub fn trending_url(window: &str) -> Option<String> {
    let interval = match window {
        "5m" | "1h" | "6h" | "24h" => window,
        _ => return None,
    };
    let url = format!("https://{JUPITER}/tokens/v2/toptraded/{interval}?limit=50");
    url_allowed(&url).then_some(url)
}

pub fn bluechip_url() -> Option<String> {
    let url = format!("https://{JUPITER}/tokens/v2/toptraded/24h?limit=100");
    url_allowed(&url).then_some(url)
}

pub fn new_pools_url(page: u8) -> Option<String> {
    if page != 1 && page != 2 {
        return None;
    }
    let url = format!("https://{GECKO}/api/v2/networks/solana/new_pools?include=dex,base_token,quote_token&page={page}");
    url_allowed(&url).then_some(url)
}

pub fn search_url(mints: &[String]) -> Option<String> {
    if mints.is_empty() || mints.len() > 40 || mints.iter().any(|m| !is_valid_mint(m)) {
        return None;
    }
    let mut u = reqwest::Url::parse(&format!("https://{JUPITER}/tokens/v2/search")).ok()?;
    u.query_pairs_mut().append_pair("query", &mints.join(","));
    let url = u.to_string();
    url_allowed(&url).then_some(url)
}

pub fn collect_mints(body: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let Some(items) = body.get("included").and_then(Value::as_array) else {
        return out;
    };
    for item in items {
        if item.get("type").and_then(Value::as_str) != Some("token") {
            continue;
        }
        let Some(addr) = item
            .get("attributes")
            .and_then(|a| a.get("address"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        if !is_valid_mint(addr) || out.iter().any(|m| m == addr) {
            continue;
        }
        out.push(addr.to_string());
        if out.len() == 40 {
            break;
        }
    }
    out
}

enum Fail {
    Rate,
    Unavailable,
}

fn backoff(fails: u32) -> u64 {
    (5_000u64.saturating_mul(1u64 << fails.min(4))).min(60_000)
}

async fn http_json(url: &str) -> Result<Value, Fail> {
    if !url_allowed(url) {
        return Err(Fail::Unavailable);
    }
    let res = client()
        .get(url)
        .header("accept", "application/json")
        .header("user-agent", "CenturionTrade/explore")
        .send()
        .await
        .map_err(|_| Fail::Unavailable)?;
    let status = res.status();
    if status.is_redirection() {
        return Err(Fail::Unavailable);
    }
    if status.as_u16() == 429 {
        return Err(Fail::Rate);
    }
    if !status.is_success() {
        return Err(Fail::Unavailable);
    }
    if res.content_length().unwrap_or(0) > MAX_BODY as u64 {
        return Err(Fail::Unavailable);
    }
    let ctype = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !ctype.starts_with("application/json") {
        return Err(Fail::Unavailable);
    }
    let bytes = res.bytes().await.map_err(|_| Fail::Unavailable)?;
    if bytes.len() > MAX_BODY {
        return Err(Fail::Unavailable);
    }
    serde_json::from_slice(&bytes).map_err(|_| Fail::Unavailable)
}

async fn cached_json(url: &str) -> Result<(Value, bool), Fail> {
    {
        let guard = cache().lock().await;
        if let Some(slot) = guard.get(url) {
            let now = now_ms();
            if now < slot.next_ms {
                return match &slot.json {
                    Some(v) => Ok((v.clone(), true)),
                    None => Err(if slot.rate {
                        Fail::Rate
                    } else {
                        Fail::Unavailable
                    }),
                };
            }
            if slot.fails == 0 && slot.json.is_some() && now.saturating_sub(slot.at_ms) < TTL_MS {
                return Ok((slot.json.clone().unwrap_or(Value::Null), false));
            }
        }
    }
    match http_json(url).await {
        Ok(v) => {
            let now = now_ms();
            cache().lock().await.insert(
                url.to_string(),
                Slot {
                    at_ms: now,
                    next_ms: now,
                    fails: 0,
                    rate: false,
                    json: Some(v.clone()),
                },
            );
            Ok((v, false))
        }
        Err(fail) => {
            let now = now_ms();
            let mut guard = cache().lock().await;
            let prev = guard.get(url).cloned();
            let fails = prev
                .as_ref()
                .map(|s| s.fails.saturating_add(1))
                .unwrap_or(1);
            let json = prev.as_ref().and_then(|s| s.json.clone());
            guard.insert(
                url.to_string(),
                Slot {
                    at_ms: prev.as_ref().map(|s| s.at_ms).unwrap_or(now),
                    next_ms: now.saturating_add(backoff(fails)),
                    fails,
                    rate: matches!(fail, Fail::Rate),
                    json: json.clone(),
                },
            );
            match json {
                Some(v) => Ok((v, true)),
                None => Err(fail),
            }
        }
    }
}

fn section_ok(section: &str) -> bool {
    matches!(section, "trending" | "graduated" | "bluechip" | "new")
}

fn window_ok(window: &str) -> bool {
    matches!(window, "1m" | "5m" | "1h" | "6h" | "24h")
}

fn empty(section: &str, window: &str, error: Option<&str>, unsupported: bool) -> Value {
    json!({
        "section": section,
        "window": window,
        "fetchedAt": now_ms(),
        "unsupported": unsupported,
        "error": error,
        "stale": false,
        "parts": [],
    })
}

struct Pull {
    parts: Vec<Value>,
    stale: bool,
    saw_rate: bool,
    saw_fail: bool,
}

impl Pull {
    fn new() -> Self {
        Self {
            parts: Vec::new(),
            stale: false,
            saw_rate: false,
            saw_fail: false,
        }
    }
    async fn take(&mut self, url: Option<String>, kind: &str) {
        let Some(url) = url else { return };
        match cached_json(&url).await {
            Ok((json, stale)) => {
                if stale {
                    self.stale = true;
                }
                self.parts.push(json!({ "kind": kind, "json": json }));
            }
            Err(Fail::Rate) => {
                self.saw_rate = true;
                self.saw_fail = true;
            }
            Err(Fail::Unavailable) => self.saw_fail = true,
        }
    }
}

/// One read for the active Explore tab. The shape matches `RawExplore` in packages/explore.
pub async fn fetch(section: &str, window: &str) -> Value {
    if !section_ok(section) || !window_ok(window) {
        return empty("trending", "5m", Some("unavailable"), false);
    }
    if section == "trending" && window == "1m" {
        return empty(section, window, None, true);
    }
    let mut pull = Pull::new();
    if section == "trending" {
        pull.take(trending_url(window), "jupiter").await;
    } else if section == "bluechip" {
        pull.take(bluechip_url(), "jupiter").await;
    } else {
        pull.take(new_pools_url(1), "gecko").await;
        pull.take(new_pools_url(2), "gecko").await;
        let mut mints = Vec::new();
        for part in &pull.parts {
            if part.get("kind").and_then(Value::as_str) == Some("gecko") {
                if let Some(body) = part.get("json") {
                    for mint in collect_mints(body) {
                        if !mints.contains(&mint) {
                            mints.push(mint);
                        }
                    }
                }
            }
        }
        mints.truncate(40);
        pull.take(search_url(&mints), "jupiter").await;
    }
    let error = if pull.parts.is_empty() {
        Some(if pull.saw_rate {
            "rate_limit"
        } else {
            "unavailable"
        })
    } else if pull.saw_rate {
        Some("rate_limit")
    } else {
        None
    };
    json!({
        "section": section,
        "window": window,
        "fetchedAt": now_ms(),
        "unsupported": false,
        "error": error,
        "stale": !pull.parts.is_empty() && (pull.stale || pull.saw_fail || pull.saw_rate),
        "parts": pull.parts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_is_exact() {
        let ok = trending_url("5m").unwrap();
        assert!(url_allowed(&ok));
        assert!(ok.contains("/tokens/v2/toptraded/5m"));
        assert!(trending_url("1m").is_none());
        assert!(!url_allowed(
            "http://lite-api.jup.ag/tokens/v2/toptraded/5m"
        ));
        assert!(!url_allowed(
            "https://user:pw@lite-api.jup.ag/tokens/v2/toptraded/5m"
        ));
        assert!(!url_allowed(
            "https://lite-api.jup.ag.evil.com/tokens/v2/toptraded/5m"
        ));
        assert!(!url_allowed("https://lite-api.jup.ag/swap/v1/quote"));
        assert!(!url_allowed(
            "https://api.dexscreener.com/latest/dex/search?q=sol"
        ));
        assert!(url_allowed(
            "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1"
        ));
        assert!(new_pools_url(3).is_none());
        assert!(search_url(&["not a mint".into()]).is_none());
        let mint = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump".to_string();
        let search = search_url(&[mint]).unwrap();
        assert!(url_allowed(&search));
        assert!(!search.to_ascii_lowercase().contains("swap"));
    }

    #[test]
    fn mints_are_base58_and_capped() {
        let mut included = Vec::new();
        included.push(json!({"type":"token","attributes":{"address":"javascript:alert(1)"}}));
        included.push(json!({"type":"token","attributes":{"address":"9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"}}));
        included.push(json!({"type":"dex","attributes":{"address":"9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"}}));
        let body = json!({"included": included});
        assert_eq!(
            collect_mints(&body),
            vec!["9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump".to_string()]
        );
    }

    #[tokio::test]
    async fn one_minute_trending_does_not_fetch() {
        let v = fetch("trending", "1m").await;
        assert_eq!(v["unsupported"], true);
        assert_eq!(v["parts"].as_array().unwrap().len(), 0);
        let bad = fetch("swap", "5m").await;
        assert_eq!(bad["error"], "unavailable");
        assert_eq!(bad["parts"].as_array().unwrap().len(), 0);
    }
}
