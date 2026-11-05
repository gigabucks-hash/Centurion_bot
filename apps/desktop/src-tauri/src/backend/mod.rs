//! Backend client boundary. The desktop talks to the Centurion API only through [`Transport`].
//!
//! Real transport (Week 2, not built yet): `HttpTransport` over
//! - SSE `GET /v1/workspaces/{ws}/events/stream?mode=practice&include=marks,clock&after_seq=`
//!   (contracts 1.1.2: desktop primary feed incl. `mark` + `clock`; `id:` = seq as an int64
//!   string, resume with `Last-Event-ID`),
//! - Supabase Realtime Broadcast `marks:<ws>:<mode>` (web/mobile; desktop fallback only),
//! - REST `/v1/workspaces/{ws}/...` for pages, approvals, sells, strategies, practice reset,
//!   coin timeline, exit-reason stats.
//!
//! Today: [`mock::MockTransport`] is an in-process simulated server that speaks the same
//! v1.1 envelopes (monotonic, non-gapless seq; `server_now`; lossy live feed to exercise resync).
//!
//! Scopes: the desktop requests **`read` + `trade` (practice only)** and never `trade:real`.

// The HTTP-facing surface (paths, headers, scopes, Network/Disconnected, patch_strategy) is the
// Week-2 transport API; the mock does not need all of it yet.
#![allow(dead_code)]

pub mod http;
pub mod mock;
#[cfg(test)]
mod smoke_real;

use crate::model::*;
use std::future::Future;
use tokio::sync::mpsc;

/// OAuth/JWT scopes the desktop may ever ask for. `trade:real` is deliberately absent.
pub const REQUESTED_SCOPES: &[&str] = &["read", "trade"];
/// Mode sent on every read/write. Real SOL on desktop = Phase 7.
pub const CLIENT_MODE: Mode = Mode::Practice;
pub const API_PREFIX: &str = "/v1";

/// `/v1/workspaces/{ws}{rest}` — every endpoint is workspace-scoped.
pub fn ws_path(ws: &str, rest: &str) -> String {
    debug_assert!(rest.is_empty() || rest.starts_with('/'));
    format!("{API_PREFIX}/workspaces/{ws}{rest}")
}

/// SSE URL with the resume cursor (also sent as `Last-Event-ID` on reconnect). 1.1.2: marks and
/// clock ride the same stream (`include=marks,clock`), so the desktop needs no Broadcast client.
pub fn sse_path(ws: &str, after_seq: i64) -> String {
    ws_path(
        ws,
        &format!("/events/stream?mode=practice&include=marks,clock&after_seq={after_seq}"),
    )
}
/// `Last-Event-ID` header value: seq as an int64 string (1.1.2).
pub fn last_event_id(seq: i64) -> (&'static str, String) {
    ("Last-Event-ID", seq.to_string())
}

/// Broadcast channel name for mark prices + clock heartbeat.
pub fn marks_channel(ws: &str, mode: Mode) -> String {
    format!(
        "marks:{ws}:{}",
        if mode == Mode::Practice {
            "practice"
        } else {
            "real"
        }
    )
}

/// Headers for a mutating request: `Idempotency-Key` always; `If-Match: "<rev>"` naming the
/// revision the write is based on (v1.1: required, else 428).
pub fn write_headers(
    idempotency_key: &str,
    if_match_rev: Option<u64>,
) -> Vec<(&'static str, String)> {
    let mut h = vec![("Idempotency-Key", idempotency_key.to_owned())];
    if let Some(r) = if_match_rev {
        h.push(("If-Match", format!("\"{r}\"")));
    }
    h
}

/// Live message from the stream layer.
#[derive(Debug, Clone)]
pub enum Inbound {
    Event(Box<EventEnvelope>),
    Mark(MarkMessage),
    Clock(ClockMessage),
    /// Stream dropped; the sync loop reconnects from its watermark.
    Disconnected,
}

/// Merge data of a 409 (API_ENDPOINTS 2.1): what changed since the caller's `base_rev`, who changed
/// it, and the server's current resource so the UI can refresh and let the user re-apply.
#[derive(Debug, Clone, PartialEq)]
pub struct Conflict {
    pub code: String,
    pub message: String,
    pub current_rev: Option<u64>,
    pub base_rev: Option<u64>,
    pub changed_fields: Vec<String>,
    pub changed_by: Option<ChangedBy>,
    pub changed_at: Option<IsoTs>,
    pub current: Option<serde_json::Value>,
}

/// Structured API failure (HTTP status + `ApiError` / `ConflictBody`).
#[derive(Debug, Clone, PartialEq)]
pub enum ApiFailure {
    /// 409 `VERSION_CONFLICT` / `STRATEGY_REV_CONFLICT` / `CONFIRMATION_RESTART_REQUIRED`.
    Conflict(Box<Conflict>),
    /// 428 `PRECONDITION_REQUIRED`: the write named no revision (client bug — never retried blindly).
    PreconditionRequired,
    Api {
        http: u16,
        code: String,
        message: String,
        details: Option<serde_json::Value>,
    },
    Network(String),
}

pub const CONFLICT_CODES: &[&str] = &[
    "VERSION_CONFLICT",
    "STRATEGY_REV_CONFLICT",
    "CONFIRMATION_RESTART_REQUIRED",
];
/// Rev conflicts: `current` (the server's current resource) is required.
pub const REV_CONFLICT_CODES: &[&str] = &["VERSION_CONFLICT", "STRATEGY_REV_CONFLICT"];

impl ApiFailure {
    /// Parse an error response body. Accepted shapes:
    /// - v1.1 `{"error": {code, message, details, request_id}, ...merge data, server_now}`;
    /// - **1.1.2** `{"error": {code, message, ...details, server_now}, server_now}` (details and 409
    ///   merge data inside `error`; Backend WIP) — and a fully flat `{code, message, ...}` as well;
    /// - SQL `{"error": "CONFIRMATION_RESTART_REQUIRED", ...}` (string `error`).
    ///
    /// Conflict merge data is read from inside `error` (or the top level). `current` is **required** on
    /// a 409 rev conflict (`VERSION_CONFLICT`, `STRATEGY_REV_CONFLICT`): a body without it is a contract
    /// violation and is surfaced as a plain `Api` failure (logged), never as a conflict to merge.
    pub fn from_body(http: u16, body: &serde_json::Value) -> Self {
        let err = &body["error"];
        let (code, message, details) = match err {
            serde_json::Value::String(c) => (c.clone(), String::new(), None),
            serde_json::Value::Object(m) => {
                // v1.1: `details` object; 1.1.2: details spread inside `error` itself.
                let details = err
                    .get("details")
                    .cloned()
                    .filter(|d| !d.is_null())
                    .or_else(|| {
                        let mut d = m.clone();
                        for k in ["code", "message", "request_id", "server_now", "details"] {
                            d.remove(k);
                        }
                        (!d.is_empty()).then_some(serde_json::Value::Object(d))
                    });
                (
                    err["code"].as_str().unwrap_or("UNKNOWN").to_owned(),
                    err["message"].as_str().unwrap_or_default().to_owned(),
                    details,
                )
            }
            _ => {
                let mut d = body.as_object().cloned().unwrap_or_default();
                let code = d
                    .remove("code")
                    .and_then(|v| v.as_str().map(str::to_owned))
                    .unwrap_or_else(|| "UNKNOWN".into());
                let message = d
                    .remove("message")
                    .and_then(|v| v.as_str().map(str::to_owned))
                    .unwrap_or_default();
                d.remove("server_now");
                d.remove("request_id");
                (
                    code,
                    message,
                    (!d.is_empty()).then_some(serde_json::Value::Object(d)),
                )
            }
        };
        let code = crate::keys::error_code(&code).to_owned();
        if http == 428 || code == "PRECONDITION_REQUIRED" {
            return ApiFailure::PreconditionRequired;
        }
        if http == 409 && CONFLICT_CODES.contains(&code.as_str()) {
            let d = details.clone().unwrap_or_default();
            let get = |k: &str| body.get(k).or_else(|| d.get(k)).filter(|v| !v.is_null());
            if REV_CONFLICT_CODES.contains(&code.as_str()) && get("current").is_none() {
                log::warn!("contract violation: 409 {code} without required `current`");
                return ApiFailure::Api {
                    http,
                    code,
                    message: format!("{message} (409 without required `current`)"),
                    details,
                };
            }
            let u64_of = |k: &str| get(k).and_then(|v| v.as_u64());
            let changed_fields = get("changed_fields")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            return ApiFailure::Conflict(Box::new(Conflict {
                code,
                message,
                current_rev: u64_of("current_rev"),
                base_rev: u64_of("base_rev"),
                changed_fields,
                changed_by: get("changed_by").and_then(|v| serde_json::from_value(v.clone()).ok()),
                changed_at: get("changed_at").and_then(|v| serde_json::from_value(v.clone()).ok()),
                current: get("current").cloned(),
            }));
        }
        ApiFailure::Api {
            http,
            code,
            message,
            details,
        }
    }
    pub fn code(&self) -> &str {
        match self {
            Self::Conflict(c) => &c.code,
            Self::PreconditionRequired => "PRECONDITION_REQUIRED",
            Self::Api { code, .. } => code,
            Self::Network(_) => "NETWORK",
        }
    }
    pub fn conflict(&self) -> Option<&Conflict> {
        match self {
            Self::Conflict(c) => Some(c),
            _ => None,
        }
    }
    /// Real SOL confirmation burned by a stale write: the whole confirmation must be redone.
    pub fn restart_confirmation(&self) -> bool {
        self.code() == "CONFIRMATION_RESTART_REQUIRED"
    }
}

impl std::fmt::Display for ApiFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Conflict(c) if c.code == "CONFIRMATION_RESTART_REQUIRED" => {
                write!(f, "{}: data berubah — ulangi konfirmasi dari awal", c.code)
            }
            Self::Conflict(c) => {
                let via = c
                    .changed_by
                    .as_ref()
                    .and_then(|b| b.via.clone())
                    .unwrap_or_else(|| "tempat lain".into());
                write!(
                    f,
                    "{}: diubah di {via} ({})",
                    c.code,
                    c.changed_fields.join(", ")
                )
            }
            Self::PreconditionRequired => {
                write!(f, "PRECONDITION_REQUIRED: penulisan tanpa If-Match/rev")
            }
            Self::Api {
                code,
                message,
                details,
                ..
            } => {
                write!(f, "{code}: {message}")?;
                // Copy placeholders the UI needs (e.g. RESET_COOLDOWN "Next: {next_allowed_at}"), as
                // `[k=v]` tags parsed by `errorText()`; values are server timestamps / integers only.
                for k in ["next_allowed_at", "retry_after_s", "cooldown_until"] {
                    if let Some(v) = details.as_ref().and_then(|d| d.get(k)).and_then(|v| {
                        v.as_str()
                            .map(str::to_owned)
                            .or_else(|| v.as_i64().map(|n| n.to_string()))
                    }) {
                        if v.chars()
                            .all(|c| c.is_ascii_alphanumeric() || "-:.+TZ".contains(c))
                        {
                            write!(f, " [{k}={v}]")?;
                        }
                    }
                }
                Ok(())
            }
            Self::Network(m) => write!(f, "network: {m}"),
        }
    }
}

pub type ApiResult<T> = Result<T, ApiFailure>;

/// Result of `PATCH /strategies/{id}` (1.1.4): applied (200) or a guard-loosening proposal waiting for
/// approval (202). The UI shows the second as "waiting for approval", never as success.
#[derive(Debug, Clone, PartialEq)]
pub enum StrategyPatch {
    Applied(ApiItem<StrategySummary>),
    PendingApproval {
        proposal: Box<crate::model::ApprovalWire>,
        guard_change: serde_json::Value,
        server_now: IsoTs,
    },
}

/// The only way the desktop reaches the backend. Static dispatch (`impl Future`) — the app holds
/// one concrete transport (`ActiveTransport`), swapped from mock to HTTP in Week 2.
///
/// Writes: every mutation carries an `Idempotency-Key` and names the revision it is based on —
/// `If-Match: "<rev>"` (`if_match`) or, for approvals, `expected_rev` in the body (1.1.2; `expected_version` removed). `None`
/// → server answers 428 `PRECONDITION_REQUIRED`.
pub trait Transport: Send + Sync + 'static {
    fn workspace_id(&self) -> &str;
    /// Open the live feed from `after_seq` (SSE semantics: strictly seq-ordered, resumable).
    fn subscribe(
        &self,
        after_seq: i64,
    ) -> impl Future<Output = ApiResult<mpsc::Receiver<Inbound>>> + Send;
    /// `GET /events?mode=practice&after_seq=&limit=` (catch-up / resync).
    fn list_events(
        &self,
        after_seq: i64,
        limit: u32,
    ) -> impl Future<Output = ApiResult<EventPage>> + Send;
    /// `GET /workspaces/{ws}` (name, `rev`, `modes_enabled`).
    fn get_workspace(&self) -> impl Future<Output = ApiResult<ApiItem<WorkspaceSummary>>> + Send;
    /// `GET /portfolio/overview?mode=practice` (refetch after `practice.reset`).
    fn get_portfolio(&self) -> impl Future<Output = ApiResult<ApiItem<PortfolioSnapshot>>> + Send;
    /// `GET /strategies?mode=practice` (names + `rev` + status).
    fn list_strategies(
        &self,
    ) -> impl Future<Output = ApiResult<ApiItem<Vec<StrategySummary>>>> + Send;
    /// `GET /approvals/{id}` → fresh single-use `decision_token` + approval `rev`.
    fn get_approval(
        &self,
        proposal_id: &str,
    ) -> impl Future<Output = ApiResult<ApiItem<ApprovalDetail>>> + Send;
    /// `POST /approvals/{id}/decision` with `Idempotency-Key` + `If-Match: "<rev>"` and
    /// `expected_rev` (1.1.2). Same key + different body = 422 `IDEMPOTENCY_KEY_REUSED`.
    fn decide(
        &self,
        proposal_id: &str,
        idem_key: &str,
        req: ApprovalDecisionRequest,
    ) -> impl Future<Output = ApiResult<ApiItem<ApprovalDecisionResponse>>> + Send;
    /// `POST /v1/workspaces/{ws}/positions/{id}/close {fraction_bps}` + `If-Match: "<position rev>"`
    /// + `Idempotency-Key` (contracts 1.1.2; `None` → 428). Returns `{position (new rev), order,
    /// order_id, fill|null, job_id, status, replayed, server_now}`; then `order.*` + `position.*` events.
    fn close(
        &self,
        position_id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        fraction_bps: u16,
    ) -> impl Future<Output = ApiResult<CloseResponse>> + Send;
    /// `POST /strategies/{id}/pause|resume` with `If-Match` (status changes bump `rev`).
    fn set_strategy_paused(
        &self,
        id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        paused: bool,
    ) -> impl Future<Output = ApiResult<ApiItem<StrategySummary>>> + Send;
    /// `PATCH /strategies/{id}` `{settings_patch}` + `If-Match`. Stale → 409 [`Conflict`]. A patch that
    /// loosens any guard → `202 {data: {proposal, guard_change}}`, nothing applied ([`StrategyPatch::PendingApproval`]).
    fn patch_strategy(
        &self,
        id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        settings_patch: serde_json::Value,
    ) -> impl Future<Output = ApiResult<StrategyPatch>> + Send;
    /// `POST /workspaces/{ws}/practice/reset` `{}` + `If-Match` workspace rev. 429 `RESET_COOLDOWN`.
    fn reset_practice(
        &self,
        idem_key: &str,
        if_match: Option<u64>,
    ) -> impl Future<Output = ApiResult<ApiItem<PracticeResetResponse>>> + Send;
    /// `GET /coins/{mint}/timeline?mode=practice` (v1.0 `/trail`).
    fn coin_timeline(&self, mint: &str) -> impl Future<Output = ApiResult<CoinTimeline>> + Send;
    /// `GET /stats/exit-reasons?mode=practice&window=` (v1.0 `/stats/exits`).
    fn exit_reason_stats(
        &self,
        window: &str,
    ) -> impl Future<Output = ApiResult<ApiItem<Vec<ExitReasonStat>>>> + Send;
    /// `GET /stats/pnl?mode=practice&window=` (0022): the PnL card/report summary.
    fn pnl_summary(&self, window: &str) -> impl Future<Output = ApiResult<PnlSummary>> + Send;
    /// `GET /positions?state=closed&window=` (0022): closed-trade ledger, newest close first.
    fn closed_positions(
        &self,
        window: &str,
    ) -> impl Future<Output = ApiResult<Vec<ClosedPositionRow>>> + Send;
}

/// Endpoint paths (Week-2 HTTP transport; asserted in tests so renames are caught).
pub mod paths {
    /// 1.1.2: by server position **id** (not position_key).
    pub const POSITION_CLOSE: &str = "/positions/{id}/close";
    pub const COIN_TIMELINE: &str = "/coins/{mint}/timeline";
    pub const EXIT_REASON_STATS: &str = "/stats/exit-reasons";
    pub const PNL_SUMMARY: &str = "/stats/pnl";
    pub const POSITIONS: &str = "/positions";
    pub const PRACTICE_RESET: &str = "/practice/reset";
    pub const STRATEGY_PAUSE: &str = "/strategies/{id}/pause";
    pub const STRATEGY_RESUME: &str = "/strategies/{id}/resume";
}

/// Transport used by the app: the in-process mock (default) or the real REST/SSE client when
/// `CENTURION_BACKEND=<base url>` is set (dev: plus `CENTURION_WORKSPACE_ID`, `CENTURION_BACKEND_TOKEN`).
pub enum ActiveTransport {
    Mock(mock::MockTransport),
    Http(http::HttpTransport),
}

macro_rules! delegate {
    ($self:ident, $t:ident => $e:expr) => {
        match $self {
            ActiveTransport::Mock($t) => $e,
            ActiveTransport::Http($t) => $e,
        }
    };
}

impl ActiveTransport {
    /// `CENTURION_BACKEND` unset → mock. Set but invalid → refuse to fall back silently (panic with the reason).
    pub fn from_env(mock_skew_ms: i64) -> Self {
        match std::env::var("CENTURION_BACKEND") {
            // No dev token → wallet login (SIWS via the system browser); tokens live in the OS keychain.
            Ok(v)
                if !v.trim().is_empty()
                    && v.trim() != "mock"
                    && std::env::var("CENTURION_BACKEND_TOKEN").is_err() =>
            {
                let ws = std::env::var("CENTURION_WORKSPACE_ID").ok();
                match crate::auth::AuthClient::new(&v).and_then(|c| {
                    http::HttpTransport::with_session(
                        &v,
                        ws.as_deref(),
                        crate::auth::SessionManager::new(c, crate::auth::default_store()),
                    )
                }) {
                    Ok(t) => {
                        log::info!("transport: http {} (SIWS session)", t.base());
                        Self::Http(t)
                    }
                    Err(e) => panic!("CENTURION_BACKEND set but unusable: {e}"),
                }
            }
            Ok(v) if !v.trim().is_empty() && v.trim() != "mock" => {
                match http::HttpTransport::from_env() {
                    Ok(t) => {
                        log::info!("transport: http {}", t.base());
                        Self::Http(t)
                    }
                    Err(e) => panic!("CENTURION_BACKEND set but unusable: {e}"),
                }
            }
            _ => Self::Mock(mock::MockTransport::new(mock_skew_ms)),
        }
    }
    /// Origin of the coin-logo image proxy (COIN_LOGO §2): the backend base, or the mock's bundled files.
    pub fn logo_origin(&self) -> String {
        match self {
            Self::Mock(_) => crate::logo::MOCK_ORIGIN.to_owned(),
            Self::Http(t) => t.base().to_owned(),
        }
    }
    pub fn label(&self) -> &'static str {
        match self {
            Self::Mock(_) => "mock",
            Self::Http(_) => "http",
        }
    }
    /// The SIWS session manager (HTTP transport in wallet-login mode only).
    pub fn session(&self) -> Option<&std::sync::Arc<crate::auth::SessionManager>> {
        match self {
            Self::Http(t) => t.session(),
            Self::Mock(_) => None,
        }
    }
    /// Mock: start the simulated server. HTTP: nothing to start.
    pub fn start(&self) {
        if let Self::Mock(m) = self {
            m.start();
        }
    }
}

impl Transport for ActiveTransport {
    fn workspace_id(&self) -> &str {
        delegate!(self, t => t.workspace_id())
    }
    async fn subscribe(&self, after_seq: i64) -> ApiResult<mpsc::Receiver<Inbound>> {
        delegate!(self, t => t.subscribe(after_seq).await)
    }
    async fn list_events(&self, after_seq: i64, limit: u32) -> ApiResult<EventPage> {
        delegate!(self, t => t.list_events(after_seq, limit).await)
    }
    async fn get_workspace(&self) -> ApiResult<ApiItem<WorkspaceSummary>> {
        delegate!(self, t => t.get_workspace().await)
    }
    async fn get_portfolio(&self) -> ApiResult<ApiItem<PortfolioSnapshot>> {
        delegate!(self, t => t.get_portfolio().await)
    }
    async fn list_strategies(&self) -> ApiResult<ApiItem<Vec<StrategySummary>>> {
        delegate!(self, t => t.list_strategies().await)
    }
    async fn get_approval(&self, proposal_id: &str) -> ApiResult<ApiItem<ApprovalDetail>> {
        delegate!(self, t => t.get_approval(proposal_id).await)
    }
    async fn decide(
        &self,
        proposal_id: &str,
        idem_key: &str,
        req: ApprovalDecisionRequest,
    ) -> ApiResult<ApiItem<ApprovalDecisionResponse>> {
        delegate!(self, t => t.decide(proposal_id, idem_key, req).await)
    }
    async fn close(
        &self,
        position_id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        fraction_bps: u16,
    ) -> ApiResult<CloseResponse> {
        delegate!(self, t => t.close(position_id, idem_key, if_match, fraction_bps).await)
    }
    async fn set_strategy_paused(
        &self,
        id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        paused: bool,
    ) -> ApiResult<ApiItem<StrategySummary>> {
        delegate!(self, t => t.set_strategy_paused(id, idem_key, if_match, paused).await)
    }
    async fn patch_strategy(
        &self,
        id: &str,
        idem_key: &str,
        if_match: Option<u64>,
        settings_patch: serde_json::Value,
    ) -> ApiResult<StrategyPatch> {
        delegate!(self, t => t.patch_strategy(id, idem_key, if_match, settings_patch).await)
    }
    async fn reset_practice(
        &self,
        idem_key: &str,
        if_match: Option<u64>,
    ) -> ApiResult<ApiItem<PracticeResetResponse>> {
        delegate!(self, t => t.reset_practice(idem_key, if_match).await)
    }
    async fn coin_timeline(&self, mint: &str) -> ApiResult<CoinTimeline> {
        delegate!(self, t => t.coin_timeline(mint).await)
    }
    async fn exit_reason_stats(&self, window: &str) -> ApiResult<ApiItem<Vec<ExitReasonStat>>> {
        delegate!(self, t => t.exit_reason_stats(window).await)
    }

    async fn pnl_summary(&self, window: &str) -> ApiResult<PnlSummary> {
        delegate!(self, t => t.pnl_summary(window).await)
    }

    async fn closed_positions(&self, window: &str) -> ApiResult<Vec<ClosedPositionRow>> {
        delegate!(self, t => t.closed_positions(window).await)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn never_requests_trade_real_and_paths_are_workspace_scoped() {
        assert!(!REQUESTED_SCOPES.contains(&"trade:real"));
        assert_eq!(CLIENT_MODE, Mode::Practice);
        assert_eq!(
            ws_path("w1", "/approvals/p1/decision"),
            "/v1/workspaces/w1/approvals/p1/decision"
        );
        assert_eq!(
            sse_path("w1", 42),
            "/v1/workspaces/w1/events/stream?mode=practice&include=marks,clock&after_seq=42"
        );
        assert_eq!(last_event_id(42).1, "42");
        assert_eq!(marks_channel("w1", Mode::Practice), "marks:w1:practice");
        assert_eq!(
            write_headers("k", Some(7))[1],
            ("If-Match", "\"7\"".to_string())
        );
    }

    #[test]
    fn conflict_409_reads_top_level_merge_data() {
        // Body exactly as API_ENDPOINTS.md 2.1.
        let body = serde_json::json!({
            "error": {"code": "STRATEGY_REV_CONFLICT", "message": "Strategy changed since rev 7", "request_id": "req_01J"},
            "current_rev": 9, "base_rev": 7, "changed_fields": ["peak_trail_pct", "status"],
            "changed_by": {"actor": "0000-a", "via": "mobile", "device": "iPhone15,2"},
            "changed_at": "2026-10-29T08:40:12.004Z",
            "current": {"id": "2000", "rev": 9, "name": "Yumi · AMM", "status": "paused", "mode": "practice", "settings": {}},
            "server_now": "2026-10-29T08:42:00.151Z"});
        let f = ApiFailure::from_body(409, &body);
        let c = f.conflict().expect("conflict");
        assert_eq!((c.current_rev, c.base_rev), (Some(9), Some(7)));
        assert_eq!(c.changed_fields, vec!["peak_trail_pct", "status"]);
        assert_eq!(
            c.changed_by.as_ref().unwrap().via.as_deref(),
            Some("mobile")
        );
        assert_eq!(c.current.as_ref().unwrap()["status"], "paused");
        assert!(f.to_string().contains("mobile"));
        // `current` is required on a rev conflict: without it → not a mergeable conflict (contract violation)
        let v = ApiFailure::from_body(
            409,
            &serde_json::json!({"error": {"code": "VERSION_CONFLICT", "message": "", "current_rev": 3, "base_rev": 2, "server_now": "x"}, "server_now": "x"}),
        );
        assert!(
            v.conflict().is_none() && v.code() == "VERSION_CONFLICT",
            "{v:?}"
        );
        let v = ApiFailure::from_body(
            409,
            &serde_json::json!({"error": {"code": "VERSION_CONFLICT", "message": "", "current_rev": 3, "base_rev": 2, "current": {"id": "p", "rev": 3}, "server_now": "x"}, "server_now": "x"}),
        );
        assert_eq!(v.conflict().unwrap().current_rev, Some(3));
        assert!(serde_json::from_value::<crate::model::ConflictBody>(serde_json::json!({"error": {"code": "VERSION_CONFLICT", "message": "", "server_now": "2026-10-29T10:00:00Z",
            "current_rev": 3, "base_rev": 2}, "server_now": "2026-10-29T10:00:00Z"})).is_err(), "ConflictBody requires `current`");
        assert!(serde_json::from_value::<crate::model::ConflictBody>(serde_json::json!({"error": {"code": "VERSION_CONFLICT", "message": "", "server_now": "2026-10-29T10:00:00Z",
            "current_rev": 3, "base_rev": 2, "current": null}, "server_now": "2026-10-29T10:00:00Z"})).is_err(), "`current` must not be null");
        // SQL-style restart (string error) and 428
        let r = ApiFailure::from_body(
            409,
            &serde_json::json!({"error": "CONFIRMATION_RESTART_REQUIRED", "current_rev": 4}),
        );
        assert!(r.restart_confirmation());
        assert_eq!(
            ApiFailure::from_body(
                428,
                &serde_json::json!({"error": {"code": "PRECONDITION_REQUIRED"}})
            ),
            ApiFailure::PreconditionRequired
        );
        // 1.1.2 flat error object: details at the top level, legacy notice code aliased
        let f = ApiFailure::from_body(
            422,
            &serde_json::json!({"code": "UNSUPPORTED_QUOTE_MINT", "message": "no SOL pair", "quote_mint": "EPjF", "server_now": "x"}),
        );
        assert_eq!(f.code(), "UNSUPPORTED_QUOTE_MINT");
        assert!(
            matches!(&f, ApiFailure::Api { details: Some(d), .. } if d["quote_mint"] == "EPjF")
        );
        let c = ApiFailure::from_body(
            409,
            &serde_json::json!({"code": "STRATEGY_REV_CONFLICT", "message": "", "current_rev": 5, "base_rev": 4, "changed_fields": ["status"], "current": {"id": "s", "rev": 5}, "server_now": "x"}),
        );
        assert_eq!(c.conflict().unwrap().current_rev, Some(5));
        assert_eq!(
            ApiFailure::from_body(422, &serde_json::json!({"code": "PAPER_CASH_INSUFFICIENT"}))
                .code(),
            "PRACTICE_CASH_INSUFFICIENT"
        );
        // 1.1.2 (Backend WIP): details + merge data spread inside `error`
        let w = ApiFailure::from_body(
            409,
            &serde_json::json!({"error": {"code": "STRATEGY_REV_CONFLICT", "message": "m", "server_now": "x",
            "current_rev": 6, "base_rev": 5, "changed_fields": ["status"], "changed_by": {"actor": null, "via": "web", "device": null}, "current": {"id": "s", "rev": 6}}, "server_now": "x"}),
        );
        let wc = w.conflict().unwrap();
        assert_eq!(
            (wc.current_rev, wc.base_rev, wc.changed_fields.clone()),
            (Some(6), Some(5), vec!["status".to_string()])
        );
        assert_eq!(wc.current.as_ref().unwrap()["rev"], 6);
        let n = ApiFailure::from_body(
            422,
            &serde_json::json!({"error": {"code": "UNSUPPORTED_QUOTE_MINT", "message": "m", "quote_mint": "EPjF", "server_now": "x"}, "server_now": "x"}),
        );
        assert!(
            matches!(&n, ApiFailure::Api { details: Some(d), .. } if d["quote_mint"] == "EPjF")
        );
        assert_eq!(paths::COIN_TIMELINE, "/coins/{mint}/timeline");
        assert_eq!(paths::EXIT_REASON_STATS, "/stats/exit-reasons");
    }
}
