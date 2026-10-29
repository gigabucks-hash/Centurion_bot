//! Real transport: REST + SSE against the Sentra API (`services/backend/api`, contracts 1.1.3).
//!
//! Selected at startup with `SENTRA_BACKEND=<base url>` (default: the in-process mock). Dev-only
//! credentials come from the environment (`SENTRA_BACKEND_TOKEN`, `SENTRA_WORKSPACE_ID`); the
//! production session token will come from the OS keychain (`keychain` feature). The token is
//! never logged or sent to the webview.
//!
//! Wire handling:
//! - every write: `Idempotency-Key` (caller-supplied; fresh per distinct body) and the revision it
//!   is based on: `If-Match: "<rev>"` (+ `expected_rev` in the approval body); `None` → 428.
//! - `ETag: "<rev>"` on single resources is cross-checked against the body `rev`.
//! - `Retry-After`: copied into the error details as `retry_after_s` (429 RESET_COOLDOWN, …); a
//!   `503 UNAVAILABLE` with `Retry-After ≤ 2 s` (same key still in flight) is retried once with the
//!   identical request (same key + same body is the only allowed reuse).
//! - SSE `GET /v1/workspaces/{ws}/events/stream?mode=practice&include=marks,clock&after_seq=` with
//!   `Last-Event-ID` = the resume seq (int64 string). `event: mark|clock` frames have no `id:`.
//! - Response envelopes follow API_ENDPOINTS (lists `{items, next_cursor, server_now}`, single
//!   resources `{data, server_now}`, a few RPC results flat) and are adapted to the trait types.
use super::{sse_path, ws_path, ApiFailure, ApiResult, Inbound, Transport};
use crate::model::*;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Method, StatusCode};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::sync::mpsc;

/// Test builds only: every raw REST body / SSE frame seen, for the smoke test's contract scans.
#[cfg(test)]
pub static CAPTURE: std::sync::Mutex<Vec<(String, Value)>> = std::sync::Mutex::new(Vec::new());
#[cfg(test)]
fn capture(what: String, v: &Value) {
    CAPTURE.lock().unwrap().push((what, v.clone()));
}
#[cfg(not(test))]
fn capture(_: String, _: &Value) {}

const UA: &str = concat!("sentra-desktop/", env!("CARGO_PKG_VERSION"));
const MAX_BODY: usize = 4 * 1024 * 1024;
const MAX_SSE_LINE: usize = 256 * 1024;

#[derive(Clone)]
pub struct HttpTransport {
    client: reqwest::Client,
    base: String,
    ws: String,
    token: String,
}

impl std::fmt::Debug for HttpTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HttpTransport").field("base", &self.base).field("ws", &self.ws).field("token", &"<redacted>").finish()
    }
}

/// `https://…` anywhere, plain `http://` only to loopback (dev server).
pub fn validate_base(url: &str) -> Result<String, String> {
    let u = url.trim().trim_end_matches('/');
    let rest = u.strip_prefix("https://").map(|r| (true, r)).or_else(|| u.strip_prefix("http://").map(|r| (false, r)));
    let Some((tls, rest)) = rest else { return Err("SENTRA_BACKEND must start with http:// or https://".into()) };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let hostname = host.rsplit_once(':').map(|(h, p)| if p.chars().all(|c| c.is_ascii_digit()) { h } else { host }).unwrap_or(host);
    if hostname.is_empty() || u.len() > 200 || rest.contains('@') || rest.contains(char::is_whitespace) {
        return Err("SENTRA_BACKEND: bad URL".into());
    }
    if !tls && !matches!(hostname, "127.0.0.1" | "localhost" | "[::1]") {
        return Err("SENTRA_BACKEND: plain http is only allowed to loopback".into());
    }
    if rest.contains('/') {
        return Err("SENTRA_BACKEND: base URL only (no path); /v1 is added".into());
    }
    Ok(u.to_owned())
}

fn is_uuid(s: &str) -> bool {
    s.len() == 36 && s.chars().enumerate().all(|(i, c)| if [8, 13, 18, 23].contains(&i) { c == '-' } else { c.is_ascii_hexdigit() })
}

impl HttpTransport {
    pub fn new(base: &str, ws: &str, token: &str) -> Result<Self, String> {
        let base = validate_base(base)?;
        if !is_uuid(ws) {
            return Err("SENTRA_WORKSPACE_ID must be a UUID".into());
        }
        if token.is_empty() || token.len() > 4096 || !token.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)) {
            return Err("SENTRA_BACKEND_TOKEN missing or malformed".into());
        }
        let client = reqwest::Client::builder()
            .user_agent(UA)
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { client, base, ws: ws.to_ascii_lowercase(), token: token.to_owned() })
    }

    /// From `SENTRA_BACKEND`, `SENTRA_WORKSPACE_ID`, `SENTRA_BACKEND_TOKEN` (dev only).
    pub fn from_env() -> Result<Self, String> {
        let base = std::env::var("SENTRA_BACKEND").map_err(|_| "SENTRA_BACKEND not set".to_string())?;
        let ws = std::env::var("SENTRA_WORKSPACE_ID").map_err(|_| "SENTRA_WORKSPACE_ID not set".to_string())?;
        let token = std::env::var("SENTRA_BACKEND_TOKEN").map_err(|_| "SENTRA_BACKEND_TOKEN not set".to_string())?;
        Self::new(&base, &ws, &token)
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    fn headers(&self) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", self.token)).expect("token validated"));
        h.insert(ACCEPT, HeaderValue::from_static("application/json"));
        h.insert("Accept-Language", HeaderValue::from_static("id"));
        h
    }

    /// One request → (status, headers, JSON body). Non-2xx → [`ApiFailure`] (with `Retry-After`).
    pub async fn raw(&self, method: Method, path: &str, body: Option<&Value>, extra: &[(&str, String)]) -> ApiResult<(StatusCode, HeaderMap, Value)> {
        for attempt in 0..2 {
            let mut rb = self.client.request(method.clone(), format!("{}{path}", self.base)).headers(self.headers()).timeout(Duration::from_secs(15));
            for (k, v) in extra {
                rb = rb.header(*k, v);
            }
            if let Some(b) = body {
                rb = rb.header(CONTENT_TYPE, "application/json").body(serde_json::to_vec(b).expect("json"));
            }
            let resp = rb.send().await.map_err(|e| ApiFailure::Network(redact(&e.to_string())))?;
            let status = resp.status();
            let headers = resp.headers().clone();
            let bytes = resp.bytes().await.map_err(|e| ApiFailure::Network(redact(&e.to_string())))?;
            if bytes.len() > MAX_BODY {
                return Err(ApiFailure::Network("response too large".into()));
            }
            let v: Value = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).map_err(|e| ApiFailure::Network(format!("bad JSON ({status}): {e}")))? };
            capture(format!("{method} {} → {}", path.split('?').next().unwrap_or(path), status.as_u16()), &v);
            if status.is_success() {
                return Ok((status, headers, v));
            }
            let retry_after = headers.get("retry-after").and_then(|h| h.to_str().ok()).and_then(|s| s.trim().parse::<u64>().ok());
            if status == StatusCode::SERVICE_UNAVAILABLE && attempt == 0 && retry_after.is_some_and(|s| s <= 2) {
                tokio::time::sleep(Duration::from_secs(retry_after.unwrap_or(1))).await;
                continue; // identical request (same key + same body) — the only allowed reuse
            }
            let mut f = ApiFailure::from_body(status.as_u16(), &v);
            if let (Some(s), ApiFailure::Api { details, .. }) = (retry_after, &mut f) {
                let d = details.get_or_insert_with(|| json!({}));
                if d.get("retry_after_s").is_none() {
                    d["retry_after_s"] = json!(s);
                }
            }
            return Err(f);
        }
        unreachable!("loop returns")
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> ApiResult<(T, HeaderMap)> {
        let (_, h, v) = self.raw(Method::GET, path, None, &[]).await?;
        Ok((decode(v)?, h))
    }

    async fn write<T: DeserializeOwned>(&self, method: Method, path: &str, idem: &str, if_match: Option<u64>, body: &Value) -> ApiResult<T> {
        let mut h = vec![("Idempotency-Key", idem.to_owned())];
        if let Some(r) = if_match {
            h.push(("If-Match", format!("\"{r}\"")));
        }
        let (_, _, v) = self.raw(method, path, Some(body), &h).await?;
        decode(v)
    }

    /// Raw status + headers + body without error mapping (smoke tests: 429 Retry-After header).
    #[cfg(test)]
    pub async fn client_raw_status(&self, path: &str, idem: &str) -> Result<(u16, HeaderMap, Value), String> {
        let r = self.client.post(format!("{}{path}", self.base)).headers(self.headers()).header("Idempotency-Key", idem).json(&json!({})).send().await.map_err(|e| e.to_string())?;
        let (st, h) = (r.status().as_u16(), r.headers().clone());
        Ok((st, h, r.json().await.unwrap_or(Value::Null)))
    }

    fn p(&self, rest: &str) -> String {
        ws_path(&self.ws, rest)
    }

    /// Open the SSE stream. `last_event_id` wins over `after_seq` on the server (both are sent on a resume).
    pub async fn open_stream(&self, after_seq: i64, last_event_id: Option<i64>) -> ApiResult<mpsc::Receiver<Inbound>> {
        let mut rb = self.client.get(format!("{}{}", self.base, sse_path(&self.ws, after_seq))).headers(self.headers()).header(ACCEPT, "text/event-stream");
        if let Some(id) = last_event_id {
            rb = rb.header("Last-Event-ID", id.to_string());
        }
        let mut resp = rb.send().await.map_err(|e| ApiFailure::Network(redact(&e.to_string())))?;
        if !resp.status().is_success() {
            let st = resp.status().as_u16();
            let v = resp.json::<Value>().await.unwrap_or(Value::Null);
            return Err(ApiFailure::from_body(st, &v));
        }
        let (tx, rx) = mpsc::channel(4096);
        tokio::spawn(async move {
            let mut buf: Vec<u8> = Vec::new();
            let mut fr = Frame::default();
            loop {
                let chunk = match tokio::time::timeout(Duration::from_secs(45), resp.chunk()).await {
                    Ok(Ok(Some(c))) => c,
                    _ => break, // EOF, error, or no heartbeat for 45 s
                };
                buf.extend_from_slice(&chunk);
                while let Some(nl) = buf.iter().position(|b| *b == b'\n') {
                    let line: Vec<u8> = buf.drain(..=nl).collect();
                    let line = String::from_utf8_lossy(&line[..line.len() - 1]).trim_end_matches('\r').to_string();
                    if line.is_empty() {
                        if let Some(m) = std::mem::take(&mut fr).into_inbound() {
                            if tx.send(m).await.is_err() {
                                return;
                            }
                        }
                    } else {
                        fr.feed(&line);
                    }
                }
                if buf.len() > MAX_SSE_LINE {
                    log::warn!("sse: line too long, dropping stream");
                    break;
                }
            }
            let _ = tx.send(Inbound::Disconnected).await;
        });
        Ok(rx)
    }
}

/// Strip anything that looks like a bearer token from transport error text.
fn redact(s: &str) -> String {
    s.split_whitespace().map(|w| if w.len() > 40 && w.matches('.').count() == 2 { "<redacted>" } else { w }).collect::<Vec<_>>().join(" ")
}

fn decode<T: DeserializeOwned>(v: Value) -> ApiResult<T> {
    serde_json::from_value(v).map_err(|e| ApiFailure::Network(format!("contract decode: {e}")))
}

/// `{items, server_now}` list → the trait's `ApiItem<Vec<T>>`.
fn list<T: DeserializeOwned>(v: Value) -> ApiResult<ApiItem<Vec<T>>> {
    let server_now = decode(v["server_now"].clone())?;
    Ok(ApiItem { data: decode(v.get("items").cloned().unwrap_or(Value::Array(vec![])))?, server_now })
}

/// `ETag: "<rev>"` (weak or strong) → rev.
pub fn etag_rev(h: &HeaderMap) -> Option<u64> {
    h.get("etag")?.to_str().ok()?.trim().trim_start_matches("W/").trim_matches('"').parse().ok()
}

#[derive(Default)]
struct Frame {
    id: Option<String>,
    event: Option<String>,
    data: String,
}

impl Frame {
    fn feed(&mut self, line: &str) {
        if line.starts_with(':') {
            return; // comment / heartbeat
        }
        let (k, v) = line.split_once(':').map(|(k, v)| (k, v.strip_prefix(' ').unwrap_or(v))).unwrap_or((line, ""));
        match k {
            "id" => self.id = Some(v.to_owned()),
            "event" => self.event = Some(v.to_owned()),
            "data" => {
                if !self.data.is_empty() {
                    self.data.push('\n');
                }
                self.data.push_str(v);
            }
            _ => {} // retry: etc.
        }
    }

    fn into_inbound(self) -> Option<Inbound> {
        if self.data.is_empty() {
            return None;
        }
        if let Ok(v) = serde_json::from_str::<Value>(&self.data) {
            capture(format!("SSE {}", self.event.as_deref().unwrap_or("message")), &v);
        }
        let parsed = match self.event.as_deref() {
            Some("mark") => serde_json::from_str::<MarkMessage>(&self.data).map(Inbound::Mark),
            Some("clock") => serde_json::from_str::<ClockMessage>(&self.data).map(Inbound::Clock),
            _ => serde_json::from_str::<EventEnvelope>(&self.data).map(|e| Inbound::Event(Box::new(e))),
        };
        match parsed {
            Ok(m) => Some(m),
            Err(e) => {
                log::warn!("sse: undecodable {:?} frame (id {:?}): {e}", self.event, self.id);
                None
            }
        }
    }
}

impl Transport for HttpTransport {
    fn workspace_id(&self) -> &str {
        &self.ws
    }

    async fn subscribe(&self, after_seq: i64) -> ApiResult<mpsc::Receiver<Inbound>> {
        self.open_stream(after_seq, (after_seq > 0).then_some(after_seq)).await
    }

    async fn list_events(&self, after_seq: i64, limit: u32) -> ApiResult<EventPage> {
        let limit = limit.clamp(1, 500);
        let (_, _, mut v) = self.raw(Method::GET, &self.p(&format!("/events?mode=practice&after_seq={after_seq}&limit={limit}")), None, &[]).await?;
        // contracts: `{items, next_after_seq, next_before_seq, safe_seq, next_cursor, server_now}` — no
        // `has_more`; a full page means there may be more.
        if v.get("has_more").is_none() {
            let full = v["items"].as_array().is_some_and(|a| a.len() as u32 >= limit);
            v["has_more"] = json!(full);
        }
        decode(v)
    }

    async fn get_workspace(&self) -> ApiResult<ApiItem<WorkspaceSummary>> {
        let (r, h): (ApiItem<WorkspaceSummary>, _) = self.get(&self.p("")).await?;
        if let Some(e) = etag_rev(&h).filter(|e| *e != r.data.rev) {
            log::warn!("workspace ETag rev {e} != body rev {}", r.data.rev);
        }
        Ok(r)
    }

    async fn get_portfolio(&self) -> ApiResult<ApiItem<PortfolioSnapshot>> {
        let (_, _, v) = self.raw(Method::GET, &self.p("/portfolio/overview?mode=practice"), None, &[]).await?;
        let mut d = v["data"].clone();
        if d.is_null() {
            return Err(ApiFailure::Api { http: 404, code: "NOT_FOUND".into(), message: "no portfolio snapshot yet".into(), details: None });
        }
        // `PortfolioWire` = `portfolio_latest` (no `drawdown_pct`; that is the event payload only).
        if d.get("drawdown_pct").is_none() {
            let bps = d["drawdown_bps"].as_i64().unwrap_or(0);
            d["drawdown_pct"] = json!(bps as f64 / 100.0);
        }
        Ok(ApiItem { data: decode(d)?, server_now: decode(v["server_now"].clone())? })
    }

    async fn list_strategies(&self) -> ApiResult<ApiItem<Vec<StrategySummary>>> {
        let (_, _, v) = self.raw(Method::GET, &self.p("/strategies?mode=practice"), None, &[]).await?;
        list(v)
    }

    async fn get_approval(&self, proposal_id: &str) -> ApiResult<ApiItem<ApprovalDetail>> {
        if !is_uuid(proposal_id) {
            return Err(ApiFailure::Api { http: 404, code: "NOT_FOUND".into(), message: "bad id".into(), details: None });
        }
        let (r, h): (ApiItem<ApprovalDetail>, _) = self.get(&self.p(&format!("/approvals/{proposal_id}"))).await?;
        if let Some(e) = etag_rev(&h).filter(|e| *e != u64::from(r.data.version)) {
            log::warn!("approval ETag rev {e} != body rev {}", r.data.version);
        }
        Ok(r)
    }

    async fn decide(&self, proposal_id: &str, idem_key: &str, req: ApprovalDecisionRequest) -> ApiResult<ApiItem<ApprovalDecisionResponse>> {
        let rev = u64::from(req.expected_rev);
        let body = serde_json::to_value(&req).expect("json");
        self.write(Method::POST, &self.p(&format!("/approvals/{proposal_id}/decision")), idem_key, Some(rev), &body).await
    }

    async fn close(&self, position_id: &str, idem_key: &str, if_match: Option<u64>, fraction_bps: u16) -> ApiResult<CloseResponse> {
        self.write(Method::POST, &self.p(&format!("/positions/{position_id}/close")), idem_key, if_match, &json!({ "fraction_bps": fraction_bps })).await
    }

    async fn set_strategy_paused(&self, id: &str, idem_key: &str, if_match: Option<u64>, paused: bool) -> ApiResult<ApiItem<StrategySummary>> {
        let verb = if paused { "pause" } else { "resume" };
        self.write(Method::POST, &self.p(&format!("/strategies/{id}/{verb}")), idem_key, if_match, &json!({})).await
    }

    async fn patch_strategy(&self, id: &str, idem_key: &str, if_match: Option<u64>, settings_patch: Value) -> ApiResult<ApiItem<StrategySummary>> {
        self.write(Method::PATCH, &self.p(&format!("/strategies/{id}")), idem_key, if_match, &json!({ "settings_patch": settings_patch })).await
    }

    async fn reset_practice(&self, idem_key: &str, if_match: Option<u64>) -> ApiResult<ApiItem<PracticeResetResponse>> {
        // contracts: body `{}` + Idempotency-Key, flat `200 {epoch, …, server_now}`. If-Match is sent when
        // known (the server ignores it; the mock requires it).
        let v: Value = self.write(Method::POST, &self.p("/practice/reset"), idem_key, if_match, &json!({})).await?;
        let server_now = decode(v["server_now"].clone())?;
        let data = if v.get("data").is_some() { v["data"].clone() } else { v };
        Ok(ApiItem { data: decode(data)?, server_now })
    }

    async fn coin_timeline(&self, mint: &str) -> ApiResult<CoinTimeline> {
        if !crate::util::is_valid_mint(mint) {
            return Err(ApiFailure::Api { http: 422, code: "VALIDATION_FAILED".into(), message: "mint".into(), details: None });
        }
        Ok(self.get(&self.p(&format!("/coins/{mint}/timeline?mode=practice"))).await?.0)
    }

    async fn exit_reason_stats(&self, window: &str) -> ApiResult<ApiItem<Vec<ExitReasonStat>>> {
        let w = if ["1h", "24h", "7d", "30d", "all"].contains(&window) { window } else { "24h" };
        let (_, _, v) = self.raw(Method::GET, &self.p(&format!("/stats/exit-reasons?mode=practice&window={w}")), None, &[]).await?;
        list(v)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_rules_and_redaction() {
        assert_eq!(validate_base("http://127.0.0.1:18080/").unwrap(), "http://127.0.0.1:18080");
        assert!(validate_base("https://api.sentra.example").is_ok());
        assert!(validate_base("http://api.sentra.example").is_err(), "plain http only to loopback");
        assert!(validate_base("http://127.0.0.1.evil.example").is_err());
        assert!(validate_base("http://user@127.0.0.1").is_err());
        assert!(validate_base("file:///etc/passwd").is_err());
        assert!(validate_base("http://127.0.0.1:1/v1").is_err());
        assert!(HttpTransport::new("http://127.0.0.1:1", "not-a-uuid", "a.b.c").is_err());
        assert!(HttpTransport::new("http://127.0.0.1:1", "10000000-0000-0000-0000-0000000000a1", "bad token with spaces").is_err());
        let t = HttpTransport::new("http://127.0.0.1:1", "10000000-0000-0000-0000-0000000000a1", "aaa.bbb.ccc").unwrap();
        assert!(!format!("{t:?}").contains("aaa.bbb.ccc"), "token never in Debug");
        assert_eq!(redact("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwIn0.c2lnbmF0dXJl x"), "Bearer <redacted> x");
    }

    #[test]
    fn sse_frames_parse_events_marks_clock_and_comments() {
        let mut f = Frame::default();
        for l in [": hb", "id: 42", "event: system.notice", r#"data: {"id":"a:1:system.notice","seq":"42","type":"system.notice","version":1,"workspace_id":"w","strategy_id":null,"ck":null,"mint":null,"ts":"2026-10-29T10:00:00.000Z","actor":"system","mode":"practice","payload":{},"untrusted":{},"server_now":"2026-10-29T10:00:00.000Z"}"#] {
            f.feed(l);
        }
        assert!(matches!(f.into_inbound(), Some(Inbound::Event(e)) if e.seq == 42));
        let mut c = Frame::default();
        c.feed("event: clock");
        c.feed(r#"data: {"server_now":"2026-10-29T10:00:00.000Z","safe_seq":"99"}"#);
        assert!(matches!(c.into_inbound(), Some(Inbound::Clock(k)) if k.safe_seq == 99));
        let mut m = Frame::default();
        m.feed("event: mark");
        m.feed(r#"data: {"mint":"7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr","price_usd":"0.1","price_sol":"0.0005","liquidity_usd":1000,"slot":1,"ts":"2026-10-29T10:00:00.000Z","position_ids":[],"server_now":"2026-10-29T10:00:00.000Z"}"#);
        assert!(matches!(m.into_inbound(), Some(Inbound::Mark(_))));
        let mut bad = Frame::default();
        bad.feed("event: mark");
        bad.feed("data: {not json");
        assert!(bad.into_inbound().is_none());
        let mut h = HeaderMap::new();
        h.insert("etag", HeaderValue::from_static("W/\"7\""));
        assert_eq!(etag_rev(&h), Some(7));
    }
}
