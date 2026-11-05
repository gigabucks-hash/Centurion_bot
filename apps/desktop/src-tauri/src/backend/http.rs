//! Real transport: REST + SSE against the Centurion API (`services/backend/api`, contracts 1.1.3).
//!
//! Selected at startup with `CENTURION_BACKEND=<base url>` (default: the in-process mock). Dev-only
//! credentials come from the environment (`CENTURION_BACKEND_TOKEN`, `CENTURION_WORKSPACE_ID`); the
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
use super::{sse_path, ws_path, ApiFailure, ApiResult, Inbound, StrategyPatch, Transport};
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

/// No usable session → a wire-shaped 401 so callers treat it like the server saying so.
fn auth_failure(e: crate::auth::AuthError) -> ApiFailure {
    use crate::auth::AuthError::*;
    let (http, code, reason) = match &e {
        SignedOut => (401, "UNAUTHENTICATED", "signed_out"),
        WalletNotAllowed => (403, "FORBIDDEN_ROLE", "wallet_not_allowed"),
        Unavailable(_) => return ApiFailure::Network("auth service unavailable".into()),
    };
    ApiFailure::Api {
        http,
        code: code.into(),
        message: String::new(),
        details: Some(json!({"reason": reason})),
    }
}

const UA: &str = concat!("centurion-desktop/", env!("CARGO_PKG_VERSION"));
const MAX_BODY: usize = 4 * 1024 * 1024;
const MAX_SSE_LINE: usize = 256 * 1024;

/// Where the bearer comes from: a dev JWT from env (smoke tests) or the SIWS session (OS keychain).
#[derive(Clone)]
pub enum Credential {
    Static(String),
    Session(std::sync::Arc<crate::auth::SessionManager>),
}

#[derive(Clone)]
pub struct HttpTransport {
    client: reqwest::Client,
    base: String,
    /// Static mode: from env. Session mode: env override or "" until the first login sets it.
    ws: String,
    cred: Credential,
}

impl std::fmt::Debug for HttpTransport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HttpTransport")
            .field("base", &self.base)
            .field("ws", &self.ws)
            .field(
                "credential",
                &match self.cred {
                    Credential::Static(_) => "static <redacted>",
                    Credential::Session(_) => "siws session",
                },
            )
            .finish()
    }
}

/// `https://…` anywhere, plain `http://` only to loopback (dev server).
pub fn validate_base(url: &str) -> Result<String, String> {
    let u = url.trim().trim_end_matches('/');
    let rest = u
        .strip_prefix("https://")
        .map(|r| (true, r))
        .or_else(|| u.strip_prefix("http://").map(|r| (false, r)));
    let Some((tls, rest)) = rest else {
        return Err("CENTURION_BACKEND must start with http:// or https://".into());
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let hostname = host
        .rsplit_once(':')
        .map(|(h, p)| {
            if p.chars().all(|c| c.is_ascii_digit()) {
                h
            } else {
                host
            }
        })
        .unwrap_or(host);
    if hostname.is_empty()
        || u.len() > 200
        || rest.contains('@')
        || rest.contains(char::is_whitespace)
    {
        return Err("CENTURION_BACKEND: bad URL".into());
    }
    if !tls && !matches!(hostname, "127.0.0.1" | "localhost" | "[::1]") {
        return Err("CENTURION_BACKEND: plain http is only allowed to loopback".into());
    }
    if rest.contains('/') {
        return Err("CENTURION_BACKEND: base URL only (no path); /v1 is added".into());
    }
    Ok(u.to_owned())
}

fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.chars().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}

impl HttpTransport {
    pub fn new(base: &str, ws: &str, token: &str) -> Result<Self, String> {
        let base = validate_base(base)?;
        if !is_uuid(ws) {
            return Err("CENTURION_WORKSPACE_ID must be a UUID".into());
        }
        if token.is_empty()
            || token.len() > 4096
            || !token
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        {
            return Err("CENTURION_BACKEND_TOKEN missing or malformed".into());
        }
        let client = reqwest::Client::builder()
            .user_agent(UA)
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            client,
            base,
            ws: ws.to_ascii_lowercase(),
            cred: Credential::Static(token.to_owned()),
        })
    }

    /// SIWS mode: the bearer comes from `session` (single-flight refresh); the workspace from the session.
    pub fn with_session(
        base: &str,
        ws_override: Option<&str>,
        session: std::sync::Arc<crate::auth::SessionManager>,
    ) -> Result<Self, String> {
        let mut t = Self::new(
            base,
            ws_override.unwrap_or("00000000-0000-0000-0000-000000000000"),
            "placeholder",
        )?;
        if ws_override.is_none() {
            t.ws = String::new();
        }
        t.cred = Credential::Session(session);
        Ok(t)
    }

    pub fn session(&self) -> Option<&std::sync::Arc<crate::auth::SessionManager>> {
        match &self.cred {
            Credential::Session(s) => Some(s),
            Credential::Static(_) => None,
        }
    }

    fn ws(&self) -> &str {
        match &self.cred {
            Credential::Session(s) if self.ws.is_empty() => {
                s.workspace.get().map(String::as_str).unwrap_or("")
            }
            _ => &self.ws,
        }
    }

    /// From `CENTURION_BACKEND`, `CENTURION_WORKSPACE_ID`, `CENTURION_BACKEND_TOKEN` (dev only).
    pub fn from_env() -> Result<Self, String> {
        let base = std::env::var("CENTURION_BACKEND")
            .map_err(|_| "CENTURION_BACKEND not set".to_string())?;
        let ws = std::env::var("CENTURION_WORKSPACE_ID")
            .map_err(|_| "CENTURION_WORKSPACE_ID not set".to_string())?;
        let token = std::env::var("CENTURION_BACKEND_TOKEN")
            .map_err(|_| "CENTURION_BACKEND_TOKEN not set".to_string())?;
        Self::new(&base, &ws, &token)
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    /// The current bearer (SIWS: refreshed first when it expires within a minute).
    async fn bearer(&self) -> ApiResult<String> {
        match &self.cred {
            Credential::Static(t) => Ok(t.clone()),
            Credential::Session(s) => s.access_token().await.map_err(auth_failure),
        }
    }

    fn headers(&self, token: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        if let Ok(v) = HeaderValue::from_str(&format!("Bearer {token}")) {
            h.insert(AUTHORIZATION, v);
        }
        h.insert(ACCEPT, HeaderValue::from_static("application/json"));
        h.insert("Accept-Language", HeaderValue::from_static("id"));
        h
    }

    /// One request → (status, headers, JSON body). Non-2xx → [`ApiFailure`] (with `Retry-After`).
    pub async fn raw(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
        extra: &[(&str, String)],
    ) -> ApiResult<(StatusCode, HeaderMap, Value)> {
        if self.ws().is_empty() {
            return Err(auth_failure(crate::auth::AuthError::SignedOut));
        }
        let mut token = self.bearer().await?;
        let mut refreshed = false;
        let mut attempt = 0;
        while attempt < 2 {
            let mut rb = self
                .client
                .request(method.clone(), format!("{}{path}", self.base))
                .headers(self.headers(&token))
                .timeout(Duration::from_secs(15));
            for (k, v) in extra {
                rb = rb.header(*k, v);
            }
            if let Some(b) = body {
                rb = rb
                    .header(CONTENT_TYPE, "application/json")
                    .body(serde_json::to_vec(b).expect("json"));
            }
            let resp = rb
                .send()
                .await
                .map_err(|e| ApiFailure::Network(redact(&e.to_string())))?;
            let status = resp.status();
            let headers = resp.headers().clone();
            let bytes = resp
                .bytes()
                .await
                .map_err(|e| ApiFailure::Network(redact(&e.to_string())))?;
            if bytes.len() > MAX_BODY {
                return Err(ApiFailure::Network("response too large".into()));
            }
            let v: Value = if bytes.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice(&bytes)
                    .map_err(|e| ApiFailure::Network(format!("bad JSON ({status}): {e}")))?
            };
            capture(
                format!(
                    "{method} {} → {}",
                    path.split('?').next().unwrap_or(path),
                    status.as_u16()
                ),
                &v,
            );
            if status.is_success() {
                return Ok((status, headers, v));
            }
            // SIWS: one forced refresh (single flight; skipped if someone else already refreshed), then retry.
            if let (StatusCode::UNAUTHORIZED, false, Credential::Session(s)) =
                (status, refreshed, &self.cred)
            {
                refreshed = true;
                token = s.on_unauthorized(&token).await.map_err(auth_failure)?;
                continue;
            }
            let retry_after = headers
                .get("retry-after")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.trim().parse::<u64>().ok());
            if status == StatusCode::SERVICE_UNAVAILABLE
                && attempt == 0
                && retry_after.is_some_and(|s| s <= 2)
            {
                tokio::time::sleep(Duration::from_secs(retry_after.unwrap_or(1))).await;
                attempt += 1;
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
        Err(ApiFailure::Network("retry budget exhausted".into()))
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> ApiResult<(T, HeaderMap)> {
        let (_, h, v) = self.raw(Method::GET, path, None, &[]).await?;
        Ok((decode(v)?, h))
    }

    async fn write<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        idem: &str,
        if_match: Option<u64>,
        body: &Value,
    ) -> ApiResult<T> {
        let mut h = vec![("Idempotency-Key", idem.to_owned())];
        if let Some(r) = if_match {
            h.push(("If-Match", format!("\"{r}\"")));
        }
        let (_, _, v) = self.raw(method, path, Some(body), &h).await?;
        decode(v)
    }

    /// Raw status + headers + body without error mapping (smoke tests: 429 Retry-After header).
    #[cfg(test)]
    pub async fn client_raw_status(
        &self,
        path: &str,
        idem: &str,
    ) -> Result<(u16, HeaderMap, Value), String> {
        let r = self
            .client
            .post(format!("{}{path}", self.base))
            .headers(self.headers(&self.bearer().await.map_err(|e| e.code().to_owned())?))
            .header("Idempotency-Key", idem)
            .json(&json!({}))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let (st, h) = (r.status().as_u16(), r.headers().clone());
        Ok((st, h, r.json().await.unwrap_or(Value::Null)))
    }

    fn p(&self, rest: &str) -> String {
        ws_path(self.ws(), rest)
    }

    /// Open the SSE stream. `last_event_id` wins over `after_seq` on the server (both are sent on a resume).
    pub async fn open_stream(
        &self,
        after_seq: i64,
        last_event_id: Option<i64>,
    ) -> ApiResult<mpsc::Receiver<Inbound>> {
        if self.ws().is_empty() {
            return Err(auth_failure(crate::auth::AuthError::SignedOut));
        }
        let token = self.bearer().await?;
        let mut rb = self
            .client
            .get(format!("{}{}", self.base, sse_path(self.ws(), after_seq)))
            .headers(self.headers(&token))
            .header(ACCEPT, "text/event-stream");
        if let Some(id) = last_event_id {
            rb = rb.header("Last-Event-ID", id.to_string());
        }
        let mut resp = rb
            .send()
            .await
            .map_err(|e| ApiFailure::Network(redact(&e.to_string())))?;
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
                let chunk = match tokio::time::timeout(Duration::from_secs(45), resp.chunk()).await
                {
                    Ok(Ok(Some(c))) => c,
                    _ => break, // EOF, error, or no heartbeat for 45 s
                };
                buf.extend_from_slice(&chunk);
                while let Some(nl) = buf.iter().position(|b| *b == b'\n') {
                    let line: Vec<u8> = buf.drain(..=nl).collect();
                    let line = String::from_utf8_lossy(&line[..line.len() - 1])
                        .trim_end_matches('\r')
                        .to_string();
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
    s.split_whitespace()
        .map(|w| {
            if w.len() > 40 && w.matches('.').count() == 2 {
                "<redacted>"
            } else {
                w
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn decode<T: DeserializeOwned>(v: Value) -> ApiResult<T> {
    serde_json::from_value(v).map_err(|e| ApiFailure::Network(format!("contract decode: {e}")))
}

/// `{items, server_now}` list → the trait's `ApiItem<Vec<T>>`.
fn list<T: DeserializeOwned>(v: Value) -> ApiResult<ApiItem<Vec<T>>> {
    let server_now = decode(v["server_now"].clone())?;
    Ok(ApiItem {
        data: decode(v.get("items").cloned().unwrap_or(Value::Array(vec![])))?,
        server_now,
    })
}

/// Most pages one list read follows (100 items each); a longer list is truncated rather than looping forever.
const MAX_PAGES: usize = 20;

/// `path` + `cursor=` (opaque, percent-encoded).
fn with_cursor(path: &str, cursor: Option<&str>) -> String {
    match cursor {
        None => path.to_owned(),
        Some(c) => {
            let enc: String = c
                .bytes()
                .map(|b| {
                    if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                        (b as char).to_string()
                    } else {
                        format!("%{b:02X}")
                    }
                })
                .collect();
            format!(
                "{path}{}cursor={enc}",
                if path.contains('?') { '&' } else { '?' }
            )
        }
    }
}

/// Keyset paging (contracts §1): follow `next_cursor` until null. `400 CURSOR_INVALID` (malformed, or
/// from another list) restarts once from the first page with an empty accumulator; a second one fails.
/// `server_now` is the last page's.
pub(crate) async fn paginate<T, F, Fut>(path: &str, fetch: F) -> ApiResult<ApiItem<Vec<T>>>
where
    T: DeserializeOwned,
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = ApiResult<Value>>,
{
    let (mut items, mut cursor, mut restarted) = (Vec::new(), None::<String>, false);
    let mut pages = 0;
    loop {
        let v = match fetch(with_cursor(path, cursor.as_deref())).await {
            Ok(v) => v,
            Err(e) if e.code() == "CURSOR_INVALID" && cursor.is_some() && !restarted => {
                restarted = true;
                (items, cursor, pages) = (Vec::new(), None, 0);
                continue;
            }
            Err(e) => return Err(e),
        };
        let page: ApiItem<Vec<T>> = list(v.clone())?;
        items.extend(page.data);
        pages += 1;
        cursor = v
            .get("next_cursor")
            .and_then(|c| c.as_str())
            .filter(|c| !c.is_empty())
            .map(str::to_owned);
        if cursor.is_none() || pages >= MAX_PAGES {
            return Ok(ApiItem {
                data: items,
                server_now: page.server_now,
            });
        }
    }
}

/// `ETag: "<rev>"` (weak or strong) → rev.
pub fn etag_rev(h: &HeaderMap) -> Option<u64> {
    h.get("etag")?
        .to_str()
        .ok()?
        .trim()
        .trim_start_matches("W/")
        .trim_matches('"')
        .parse()
        .ok()
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
        let (k, v) = line
            .split_once(':')
            .map(|(k, v)| (k, v.strip_prefix(' ').unwrap_or(v)))
            .unwrap_or((line, ""));
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
            capture(
                format!("SSE {}", self.event.as_deref().unwrap_or("message")),
                &v,
            );
        }
        let parsed = match self.event.as_deref() {
            Some("mark") => serde_json::from_str::<MarkMessage>(&self.data).map(Inbound::Mark),
            Some("clock") => serde_json::from_str::<ClockMessage>(&self.data).map(Inbound::Clock),
            _ => serde_json::from_str::<EventEnvelope>(&self.data)
                .map(|e| Inbound::Event(Box::new(e))),
        };
        match parsed {
            Ok(m) => Some(m),
            Err(e) => {
                log::warn!(
                    "sse: undecodable {:?} frame (id {:?}): {e}",
                    self.event,
                    self.id
                );
                None
            }
        }
    }
}

impl Transport for HttpTransport {
    fn workspace_id(&self) -> &str {
        self.ws()
    }

    async fn subscribe(&self, after_seq: i64) -> ApiResult<mpsc::Receiver<Inbound>> {
        self.open_stream(after_seq, (after_seq > 0).then_some(after_seq))
            .await
    }

    async fn list_events(&self, after_seq: i64, limit: u32) -> ApiResult<EventPage> {
        let limit = limit.clamp(1, 500);
        let (_, _, mut v) = self
            .raw(
                Method::GET,
                &self.p(&format!(
                    "/events?mode=practice&after_seq={after_seq}&limit={limit}"
                )),
                None,
                &[],
            )
            .await?;
        // contracts: `{items, next_after_seq, next_before_seq, safe_seq, next_cursor, server_now}` — no
        // `has_more`; a full page means there may be more.
        if v.get("has_more").is_none() {
            let full = v["items"]
                .as_array()
                .is_some_and(|a| a.len() as u32 >= limit);
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
        let (_, _, v) = self
            .raw(
                Method::GET,
                &self.p("/portfolio/overview?mode=practice"),
                None,
                &[],
            )
            .await?;
        let mut d = v["data"].clone();
        if d.is_null() {
            return Err(ApiFailure::Api {
                http: 404,
                code: "NOT_FOUND".into(),
                message: "no portfolio snapshot yet".into(),
                details: None,
            });
        }
        // `PortfolioWire` = `portfolio_latest` (no `drawdown_pct`; that is the event payload only).
        if d.get("drawdown_pct").is_none() {
            let bps = d["drawdown_bps"].as_i64().unwrap_or(0);
            d["drawdown_pct"] = json!(bps as f64 / 100.0);
        }
        Ok(ApiItem {
            data: decode(d)?,
            server_now: decode(v["server_now"].clone())?,
        })
    }

    async fn list_strategies(&self) -> ApiResult<ApiItem<Vec<StrategySummary>>> {
        let path = self.p("/strategies?mode=practice&limit=100");
        paginate(&path, |p| async move {
            self.raw(Method::GET, &p, None, &[])
                .await
                .map(|(_, _, v)| v)
        })
        .await
    }

    async fn get_approval(&self, proposal_id: &str) -> ApiResult<ApiItem<ApprovalDetail>> {
        if !is_uuid(proposal_id) {
            return Err(ApiFailure::Api {
                http: 404,
                code: "NOT_FOUND".into(),
                message: "bad id".into(),
                details: None,
            });
        }
        let (r, h): (ApiItem<ApprovalDetail>, _) = self
            .get(&self.p(&format!("/approvals/{proposal_id}")))
            .await?;
        if let Some(e) = etag_rev(&h).filter(|e| *e != u64::from(r.data.version)) {
            log::warn!("approval ETag rev {e} != body rev {}", r.data.version);
        }
        Ok(r)
    }

    async fn decide(
        &self,
        proposal_id: &str,
        idem_key: &str,
        req: ApprovalDecisionRequest,
    ) -> ApiResult<ApiItem<ApprovalDecisionResponse>> {
        let rev = u64::from(req.expected_rev);
        let body = serde_json::to_value(&req).expect("json");
        self.write(
            Method::POST,
            &self.p(&format!("/approvals/{proposal_id}/decision")),
            idem_key,
            Some(rev),
            &body,
        )
        .await
    }

    async fn close(
        &self,
        position_id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        fraction_bps: u16,
    ) -> ApiResult<CloseResponse> {
        self.write(
            Method::POST,
            &self.p(&format!("/positions/{position_id}/close")),
            idem_key,
            if_match,
            &json!({ "fraction_bps": fraction_bps }),
        )
        .await
    }

    async fn set_strategy_paused(
        &self,
        id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        paused: bool,
    ) -> ApiResult<ApiItem<StrategySummary>> {
        let verb = if paused { "pause" } else { "resume" };
        self.write(
            Method::POST,
            &self.p(&format!("/strategies/{id}/{verb}")),
            idem_key,
            if_match,
            &json!({}),
        )
        .await
    }

    async fn patch_strategy(
        &self,
        id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        settings_patch: Value,
    ) -> ApiResult<StrategyPatch> {
        let mut h = vec![("Idempotency-Key", idem_key.to_owned())];
        if let Some(r) = if_match {
            h.push(("If-Match", format!("\"{r}\"")));
        }
        let (status, _, v) = self
            .raw(
                Method::PATCH,
                &self.p(&format!("/strategies/{id}")),
                Some(&json!({ "settings_patch": settings_patch })),
                &h,
            )
            .await?;
        patch_outcome(status.as_u16(), v)
    }

    async fn reset_practice(
        &self,
        idem_key: &str,
        if_match: Option<u64>,
    ) -> ApiResult<ApiItem<PracticeResetResponse>> {
        // contracts: body `{}` + Idempotency-Key, flat `200 {epoch, …, server_now}`. If-Match is sent when
        // known (the server ignores it; the mock requires it).
        let v: Value = self
            .write(
                Method::POST,
                &self.p("/practice/reset"),
                idem_key,
                if_match,
                &json!({}),
            )
            .await?;
        let server_now = decode(v["server_now"].clone())?;
        let data = if v.get("data").is_some() {
            v["data"].clone()
        } else {
            v
        };
        Ok(ApiItem {
            data: decode(data)?,
            server_now,
        })
    }

    async fn coin_timeline(&self, mint: &str) -> ApiResult<CoinTimeline> {
        if !crate::util::is_valid_mint(mint) {
            return Err(ApiFailure::Api {
                http: 422,
                code: "VALIDATION_FAILED".into(),
                message: "mint".into(),
                details: None,
            });
        }
        Ok(self
            .get(&self.p(&format!("/coins/{mint}/timeline?mode=practice")))
            .await?
            .0)
    }

    async fn exit_reason_stats(&self, window: &str) -> ApiResult<ApiItem<Vec<ExitReasonStat>>> {
        let w = if ["1h", "24h", "7d", "30d", "all"].contains(&window) {
            window
        } else {
            "24h"
        };
        let (_, _, v) = self
            .raw(
                Method::GET,
                &self.p(&format!("/stats/exit-reasons?mode=practice&window={w}")),
                None,
                &[],
            )
            .await?;
        list(v)
    }

    async fn pnl_summary(&self, window: &str) -> ApiResult<PnlSummary> {
        let w = if ["1h", "24h", "7d", "30d", "all"].contains(&window) {
            window
        } else {
            "7d"
        };
        let (_, _, v) = self
            .raw(
                Method::GET,
                &self.p(&format!("/stats/pnl?mode=practice&window={w}")),
                None,
                &[],
            )
            .await?;
        decode(v["data"].clone())
    }

    async fn closed_positions(&self, window: &str) -> ApiResult<Vec<ClosedPositionRow>> {
        let w = if ["1h", "24h", "7d", "30d", "all"].contains(&window) {
            window
        } else {
            "7d"
        };
        // One page is the report's ledger (100 rows); the report never sums these rows for realized.
        let (_, _, v) = self
            .raw(
                Method::GET,
                &self.p(&format!(
                    "/positions?mode=practice&state=closed&window={w}&limit=100"
                )),
                None,
                &[],
            )
            .await?;
        decode(v.get("items").cloned().unwrap_or(Value::Array(vec![])))
    }
}

/// 200 → applied strategy; 202 → `{data: {proposal: ApprovalWire, guard_change}}` (nothing applied).
pub(crate) fn patch_outcome(status: u16, v: Value) -> ApiResult<StrategyPatch> {
    let server_now: IsoTs = decode(v["server_now"].clone())?;
    if status == 202 {
        let d = &v["data"];
        return Ok(StrategyPatch::PendingApproval {
            proposal: Box::new(decode(d["proposal"].clone())?),
            guard_change: d["guard_change"].clone(),
            server_now,
        });
    }
    Ok(StrategyPatch::Applied(ApiItem {
        data: decode(v["data"].clone())?,
        server_now,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cursor_paging_follows_next_cursor_and_resets_on_cursor_invalid() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let now = "2026-10-29T08:42:00.000Z";
        let page = |ids: &[i64], next: Option<&str>| json!({"items": ids, "next_cursor": next, "server_now": now});
        // a → b → end
        let calls = std::sync::Mutex::new(Vec::<String>::new());
        let r: ApiItem<Vec<i64>> = paginate("/x?limit=2", |p| {
            calls.lock().unwrap().push(p.clone());
            async move {
                Ok(if p.contains("cursor=b%2B") {
                    page(&[3], None)
                } else if p.contains("cursor=a") {
                    page(&[2], Some("b+"))
                } else {
                    page(&[1], Some("a"))
                })
            }
        })
        .await
        .unwrap();
        assert_eq!(r.data, vec![1, 2, 3]);
        assert_eq!(
            calls.lock().unwrap().as_slice(),
            [
                "/x?limit=2",
                "/x?limit=2&cursor=a",
                "/x?limit=2&cursor=b%2B"
            ]
        );
        // CURSOR_INVALID on page 2 → restart from page 1 once (no duplicates), then succeed
        let n = AtomicUsize::new(0);
        let r: ApiItem<Vec<i64>> = paginate("/y", |p| {
            let k = n.fetch_add(1, Ordering::SeqCst);
            async move {
                if p.contains("cursor=") && k == 1 {
                    return Err(ApiFailure::Api {
                        http: 400,
                        code: "CURSOR_INVALID".into(),
                        message: "bad".into(),
                        details: None,
                    });
                }
                Ok(if p.contains("cursor=") {
                    page(&[2], None)
                } else {
                    page(&[1], Some("c"))
                })
            }
        })
        .await
        .unwrap();
        assert_eq!(r.data, vec![1, 2]);
        assert_eq!(n.load(Ordering::SeqCst), 4, "p1, p2(invalid), p1 again, p2");
        // a second CURSOR_INVALID is an error, not a loop
        let r: ApiResult<ApiItem<Vec<i64>>> = paginate("/z", |p| async move {
            if p.contains("cursor=") {
                Err(ApiFailure::Api {
                    http: 400,
                    code: "CURSOR_INVALID".into(),
                    message: "bad".into(),
                    details: None,
                })
            } else {
                Ok(page(&[1], Some("c")))
            }
        })
        .await;
        assert_eq!(r.unwrap_err().code(), "CURSOR_INVALID");
    }

    #[test]
    fn guard_weakening_patch_is_pending_approval_not_success() {
        let body = json!({"data": {"proposal": crate::backend::mock::sample_approval_wire("guard_change"), "guard_change": {"fields": ["score_threshold"]}}, "server_now": "2026-10-29T08:42:00.000Z"});
        match patch_outcome(202, body).unwrap() {
            StrategyPatch::PendingApproval {
                proposal,
                guard_change,
                ..
            } => {
                assert!(proposal.weakening);
                assert_eq!(guard_change["fields"][0], "score_threshold");
            }
            other => panic!("expected pending approval, got {other:?}"),
        }
    }

    #[test]
    fn base_url_rules_and_redaction() {
        assert_eq!(
            validate_base("http://127.0.0.1:18080/").unwrap(),
            "http://127.0.0.1:18080"
        );
        assert!(validate_base("https://api.centurion.example").is_ok());
        assert!(
            validate_base("http://api.centurion.example").is_err(),
            "plain http only to loopback"
        );
        assert!(validate_base("http://127.0.0.1.evil.example").is_err());
        assert!(validate_base("http://user@127.0.0.1").is_err());
        assert!(validate_base("file:///etc/passwd").is_err());
        assert!(validate_base("http://127.0.0.1:1/v1").is_err());
        assert!(HttpTransport::new("http://127.0.0.1:1", "not-a-uuid", "a.b.c").is_err());
        assert!(HttpTransport::new(
            "http://127.0.0.1:1",
            "10000000-0000-0000-0000-0000000000a1",
            "bad token with spaces"
        )
        .is_err());
        let t = HttpTransport::new(
            "http://127.0.0.1:1",
            "10000000-0000-0000-0000-0000000000a1",
            "aaa.bbb.ccc",
        )
        .unwrap();
        assert!(
            !format!("{t:?}").contains("aaa.bbb.ccc"),
            "token never in Debug"
        );
        assert_eq!(
            redact("Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bb.cc x"),
            "Bearer <redacted> x"
        );
    }

    #[test]
    fn sse_frames_parse_events_marks_clock_and_comments() {
        let mut f = Frame::default();
        for l in [
            ": hb",
            "id: 42",
            "event: system.notice",
            r#"data: {"id":"a:1:system.notice","seq":"42","type":"system.notice","version":1,"workspace_id":"w","strategy_id":null,"ck":null,"mint":null,"ts":"2026-10-29T10:00:00.000Z","actor":"system","mode":"practice","payload":{},"untrusted":{},"server_now":"2026-10-29T10:00:00.000Z"}"#,
        ] {
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

    /// SIWS mode: a 401 on an API call triggers one (single-flight) refresh and one retry with the new
    /// bearer; a second 401 is returned to the caller (no refresh loop).
    #[tokio::test]
    async fn siws_session_401_refreshes_once_and_retries() {
        use crate::auth::tests::*;
        use std::sync::atomic::{AtomicUsize, Ordering};
        let refreshes = std::sync::Arc::new(AtomicUsize::new(0));
        let r2 = refreshes.clone();
        let base = stub(std::sync::Arc::new(move |_, path, auth, _| {
            if path == "/v1/auth/session/refresh" {
                r2.fetch_add(1, Ordering::SeqCst);
                return (200, session_json(2));
            }
            if auth == "Bearer at2.x.y" {
                (
                    200,
                    json!({"data": {"ok": true}, "server_now": "2026-10-29T12:00:00.000Z"}),
                )
            } else {
                (
                    401,
                    json!({"error": {"code": "UNAUTHENTICATED", "message": "expired"}}),
                )
            }
        }))
        .await;
        let store = crate::auth::MemoryStore::default();
        crate::auth::TokenStore::save(&store, &session(1, 600_000)).unwrap(); // looks valid locally, server says expired
        let sm = crate::auth::SessionManager::new(
            crate::auth::AuthClient::new(&base).unwrap(),
            Box::new(store),
        );
        let t = HttpTransport::with_session(&base, None, sm).unwrap();
        assert_eq!(t.workspace_id(), "10000000-0000-0000-0000-0000000000a1");
        let (st, _, v) = t
            .raw(Method::GET, "/v1/workspaces/x/ping", None, &[])
            .await
            .unwrap();
        assert_eq!((st.as_u16(), v["data"]["ok"].as_bool()), (200, Some(true)));
        assert_eq!(refreshes.load(Ordering::SeqCst), 1);

        // signed out → no request at all, a wire-shaped 401
        let sm = crate::auth::SessionManager::new(
            crate::auth::AuthClient::new(&base).unwrap(),
            Box::new(crate::auth::MemoryStore::default()),
        );
        let t = HttpTransport::with_session(&base, None, sm).unwrap();
        assert_eq!(
            t.raw(Method::GET, "/v1/x", None, &[])
                .await
                .unwrap_err()
                .code(),
            "UNAUTHENTICATED"
        );
    }
}
