//! Wallet-only login (Boss decision 2026-10-29): Sign-In With Solana through the **system browser**.
//!
//! The desktop never sees a private key and never asks a wallet to sign inside its webview:
//!
//! 1. [`Loopback::bind`] listens on `127.0.0.1:<random port>` with a fresh 128-bit `state`.
//! 2. [`open_system_browser`] opens `CENTURION_LOGIN_URL` (the web app's `/auth/desktop` page) with
//!    `redirect_uri=http://127.0.0.1:<port>/siws/callback&state=<state>`.
//! 3. In the browser the user connects Phantom; the page calls `POST /v1/auth/siws/nonce` (its own
//!    origin = the SIWS domain), the wallet signs the server-built message, and the page redirects to
//!    the loopback URL with `state`, `address`, `message`, `signature` (one-time, nonce-bound, 5 min).
//! 4. Rust checks `state` (constant time), pre-checks the message ([`check_message`]: our domain, the
//!    same address, not expired) and calls `POST /v1/auth/siws/verify {client: "desktop"}` itself.
//! 5. The [`Session`] (access 15 min, rotating refresh token) is stored only in the OS keychain
//!    ([`KeychainStore`]); the webview only ever learns the state and the wallet address.
//!
//! Refresh tokens rotate and a reused one revokes the whole session, so every refresh goes through one
//! async mutex ([`SessionManager::access_token`]): concurrent callers wait, then reuse the new token.
use crate::backend::ApiFailure;
use crate::model::IsoTs;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// Refresh this long before `expires_at` (access tokens live 15 min).
const REFRESH_MARGIN_MS: i64 = 60_000;
/// How long the loopback waits for the browser.
pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_REQUEST: usize = 16 * 1024;

// ---------------------------------------------------------------------------------------------
// wire
// ---------------------------------------------------------------------------------------------

/// `Session` (API_ENDPOINTS §4.1). `workspace_id` comes with verify only.
#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub struct Session {
    pub access_token: String,
    pub expires_at: IsoTs,
    pub refresh_token: String,
    pub session_id: String,
    pub user_id: String,
    pub address: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
}
impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Session")
            .field("address", &self.address)
            .field("session_id", &self.session_id)
            .field("expires_at", &self.expires_at)
            .field("tokens", &"<redacted>")
            .finish()
    }
}
impl Session {
    fn expires_ms(&self) -> i64 {
        self.expires_at.ms().unwrap_or(0)
    }
    fn valid(&self) -> bool {
        self.access_token.len() <= 4096
            && self
                .access_token
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
            && self.refresh_token.len() <= 512
            && self
                .refresh_token
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
            && is_address(&self.address)
    }
}

/// What the UI may know (no tokens).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AuthState {
    /// `reason`: why the session ended (`refresh_reused`, `refresh_expired`, `signed_out`, …).
    SignedOut {
        reason: Option<String>,
    },
    WaitingForBrowser,
    SignedIn {
        address: String,
        workspace_id: Option<String>,
    },
    /// `403 FORBIDDEN_ROLE {reason: "wallet_not_allowed"}`: the app is private to its owner wallet.
    WalletNotAllowed {
        address: Option<String>,
    },
    /// The login could not complete (bad callback, expired message, network…); `code` is a wire or local code.
    Failed {
        code: String,
    },
    /// Deep-link hand-off (API 4.1.1): the one-time code was refused (`code_invalid`: unknown/used/expired, or
    /// `code_verifier_mismatch`). The code is burned server-side; never retried. The user signs in again.
    SignInAgain {
        reason: String,
    },
}

/// Base58 Solana address (32-44 chars of the bitcoin alphabet; the server checks the 32 bytes).
pub fn is_address(a: &str) -> bool {
    (32..=44).contains(&a.len())
        && a.bytes()
            .all(|b| b.is_ascii_alphanumeric() && !b"0OIl".contains(&b))
}

/// SIWS statement line versions (contracts 1.1.6, API_ENDPOINTS 4.1 "SIWS statement versions (B-7)"); the
/// server stores the version with the nonce and verify accepts only that one.
pub const SIWS_STATEMENTS: [(u8, &str); 2] = [
    // v1, legacy (transition only): accepted until AUTH_SIWS_LEGACY_STATEMENT_UNTIL.
    (1, "Sign in to Centurion (practice). This request does not trigger a transaction or cost any fees."),
    // v2, current (default; UX key auth.siws.statement).
    (2, "Sign in to Centurion Trade"),
];
pub const SIWS_STATEMENT_CURRENT: u8 = 2;
/// Default end of the v1 transition: `2026-11-05T12:00:00Z` = Thu 5 Nov 2026 19:00 WIB. The server's
/// `AUTH_SIWS_LEGACY_STATEMENT_UNTIL` is authoritative (it may end earlier, `AUTH_SIWS_LEGACY_STATEMENT=false`);
/// the desktop only refuses v1 itself after this instant, so it works before and after the cutoff.
pub const SIWS_LEGACY_UNTIL_MS: i64 = 1_793_880_000_000;

/// Statement version of a statement line, if it is one we accept at `now_ms`.
pub fn statement_version(line: &str, now_ms: i64) -> Option<u8> {
    let (v, _) = SIWS_STATEMENTS.iter().find(|(_, s)| *s == line)?;
    (*v == SIWS_STATEMENT_CURRENT || now_ms < SIWS_LEGACY_UNTIL_MS).then_some(*v)
}

fn iso_ok(v: &str) -> bool {
    (20..=30).contains(&v.len())
        && v.bytes()
            .all(|b| b.is_ascii_digit() || b"TZ:.-".contains(&b))
        && IsoTs(v.to_owned()).ms().is_some()
}

/// Pre-check of the SIWS message the browser had signed (the server's strict parse is authoritative):
/// exactly the 11-line layout of the backend's `buildMessage()`, our login `domain`, the callback
/// `address`, a known statement version (v1 legacy only before [`SIWS_LEGACY_UNTIL_MS`]), `Version: 1`,
/// `solana:mainnet`, a 16–64 alnum nonce, ISO timestamps, and an `Expiration Time` still in the future.
pub fn check_message(
    message: &str,
    domain: &str,
    address: &str,
    now_ms: i64,
) -> Result<(), &'static str> {
    if message.len() > 4096 {
        return Err("message_too_long");
    }
    let l: Vec<&str> = message.split('\n').collect();
    if l.len() != 11 || !l[2].is_empty() || !l[4].is_empty() {
        return Err("message_layout");
    }
    if l[0] != format!("{domain} wants you to sign in with your Solana account:") {
        return Err("message_domain");
    }
    if l[1] != address || !is_address(address) {
        return Err("message_address");
    }
    match SIWS_STATEMENTS.iter().find(|(_, st)| *st == l[3]) {
        None => return Err("message_statement"),
        Some(_) if statement_version(l[3], now_ms).is_none() => return Err("statement_retired"),
        Some(_) => {}
    }
    let field = |i: usize, k: &str| l[i].strip_prefix(k).filter(|v| !v.is_empty());
    let (Some(uri), Some("1"), Some("solana:mainnet"), Some(nonce), Some(_), Some(exp)) = (
        field(5, "URI: "),
        field(6, "Version: "),
        field(7, "Chain ID: "),
        field(8, "Nonce: "),
        field(9, "Issued At: "),
        field(10, "Expiration Time: "),
    ) else {
        return Err("message_fields");
    };
    if !uri.starts_with(&format!("https://{domain}"))
        || !(16..=64).contains(&nonce.len())
        || !nonce.bytes().all(|b| b.is_ascii_alphanumeric())
    {
        return Err("message_fields");
    }
    if !iso_ok(l[9].trim_start_matches("Issued At: ")) || !iso_ok(exp) {
        return Err("message_fields");
    }
    match IsoTs(exp.to_owned()).ms() {
        Some(t) if t > now_ms => Ok(()),
        _ => Err("message_expired"),
    }
}

// ---------------------------------------------------------------------------------------------
// token storage
// ---------------------------------------------------------------------------------------------

/// Where the session lives. Production: OS keychain only. Tests: memory.
pub trait TokenStore: Send + Sync {
    fn load(&self) -> Option<Session>;
    fn save(&self, s: &Session) -> Result<(), String>;
    fn clear(&self);
}

/// Process memory only (tests; or a build without the `keychain` feature: nothing touches disk and the
/// user signs in again after a restart).
#[cfg(any(test, not(feature = "keychain")))]
#[derive(Default)]
pub struct MemoryStore(std::sync::Mutex<Option<Session>>);
#[cfg(any(test, not(feature = "keychain")))]
impl TokenStore for MemoryStore {
    fn load(&self) -> Option<Session> {
        self.0.lock().unwrap().clone()
    }
    fn save(&self, s: &Session) -> Result<(), String> {
        *self.0.lock().unwrap() = Some(s.clone());
        Ok(())
    }
    fn clear(&self) {
        *self.0.lock().unwrap() = None;
    }
}

/// OS keychain (Windows Credential Manager, Linux Secret Service), service `com.centuriontrade.app`,
/// account `siws-session`, value = the session JSON.
#[cfg(feature = "keychain")]
pub struct KeychainStore;
#[cfg(feature = "keychain")]
impl TokenStore for KeychainStore {
    fn load(&self) -> Option<Session> {
        let raw = crate::keychain::get_token(KEYCHAIN_ACCOUNT)
            .ok()
            .flatten()?;
        serde_json::from_str::<Session>(&raw)
            .ok()
            .filter(Session::valid)
    }
    fn save(&self, s: &Session) -> Result<(), String> {
        crate::keychain::set_token(
            KEYCHAIN_ACCOUNT,
            &serde_json::to_string(s).map_err(|e| e.to_string())?,
        )
    }
    fn clear(&self) {
        let _ = crate::keychain::delete_token(KEYCHAIN_ACCOUNT);
    }
}
#[cfg(feature = "keychain")]
const KEYCHAIN_ACCOUNT: &str = "siws-session";

/// The store for this build: keychain when compiled with it, else memory.
pub fn default_store() -> Box<dyn TokenStore> {
    #[cfg(feature = "keychain")]
    {
        Box::new(KeychainStore)
    }
    #[cfg(not(feature = "keychain"))]
    {
        Box::new(MemoryStore::default())
    }
}

// ---------------------------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------------------------

/// `POST /v1/auth/*` (public routes; no bearer).
#[derive(Clone)]
pub struct AuthClient {
    http: reqwest::Client,
    base: String,
}
impl AuthClient {
    pub fn new(base: &str) -> Result<Self, String> {
        let base = crate::backend::http::validate_base(base)?;
        let http = reqwest::Client::builder()
            .user_agent(concat!("centurion-desktop/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { http, base })
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value, ApiFailure> {
        let r = self
            .http
            .post(format!("{}/v1/auth{path}", self.base))
            .json(&body)
            .send()
            .await
            .map_err(|e| ApiFailure::Network(e.without_url().to_string()))?;
        let status = r.status().as_u16();
        let retry_after = r
            .headers()
            .get("retry-after")
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.trim().parse::<u64>().ok());
        let bytes = r
            .bytes()
            .await
            .map_err(|e| ApiFailure::Network(e.without_url().to_string()))?;
        if bytes.len() > 64 * 1024 {
            return Err(ApiFailure::Network("auth response too large".into()));
        }
        let v: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        if (200..300).contains(&status) {
            return Ok(v);
        }
        let mut f = ApiFailure::from_body(status, &v);
        if let (Some(s), ApiFailure::Api { details, .. }) = (retry_after, &mut f) {
            details.get_or_insert_with(|| json!({}))["retry_after_s"] = json!(s);
        }
        Err(f)
    }

    fn session(v: Value) -> Result<Session, ApiFailure> {
        let s: Session = serde_json::from_value(v["data"].clone())
            .map_err(|e| ApiFailure::Network(format!("bad session body: {e}")))?;
        if !s.valid() {
            return Err(ApiFailure::Network("malformed session".into()));
        }
        Ok(s)
    }

    /// Only used by the smoke test (the browser page requests the nonce in production).
    #[cfg(test)]
    pub async fn nonce(&self, address: &str, domain: &str) -> Result<Value, ApiFailure> {
        self.nonce_v(address, domain, SIWS_STATEMENT_CURRENT).await
    }
    #[cfg(test)]
    #[allow(dead_code)]
    pub async fn nonce_v(
        &self,
        address: &str,
        domain: &str,
        statement_version: u8,
    ) -> Result<Value, ApiFailure> {
        self.post("/siws/nonce", json!({"address": address, "domain": domain, "chain_id": "solana:mainnet", "statement_version": statement_version})).await
    }
    /// The web page's half of the deep-link hand-off (API 4.1.1 step 1); only the smoke test plays the page.
    #[cfg(test)]
    #[allow(dead_code)] // used by backend::smoke_real (ignored test)
    pub async fn verify_handoff(
        &self,
        address: &str,
        message: &str,
        signature: &str,
        code_challenge: &str,
        state: &str,
    ) -> Result<HandoffCode, ApiFailure> {
        let v = self
            .post("/siws/verify", json!({"address": address, "message": message, "signature": signature, "client": "desktop",
                "code_challenge": code_challenge, "code_challenge_method": "S256", "state": state, "redirect_uri": crate::deeplink::REDIRECT_URI}))
            .await?;
        serde_json::from_value(v["data"].clone())
            .map_err(|e| ApiFailure::Network(format!("bad hand-off body: {e}")))
    }
    /// API 4.1.1 step 2: `POST /v1/auth/desktop/exchange {code, code_verifier, client: "desktop"}` → Session + workspace_id.
    pub async fn exchange(&self, code: &str, code_verifier: &str) -> Result<Session, ApiFailure> {
        Self::session(
            self.post(
                "/desktop/exchange",
                json!({"code": code, "code_verifier": code_verifier, "client": "desktop"}),
            )
            .await?,
        )
    }
    pub async fn verify(
        &self,
        address: &str,
        message: &str,
        signature: &str,
    ) -> Result<Session, ApiFailure> {
        Self::session(self.post("/siws/verify", json!({"address": address, "message": message, "signature": signature, "client": "desktop"})).await?)
    }
    pub async fn refresh(&self, refresh_token: &str) -> Result<Session, ApiFailure> {
        Self::session(
            self.post("/session/refresh", json!({"refresh_token": refresh_token}))
                .await?,
        )
    }
    pub async fn logout(&self, refresh_token: &str) -> Result<(), ApiFailure> {
        self.post("/session/logout", json!({"refresh_token": refresh_token}))
            .await
            .map(|_| ())
    }
}

/// `reason` detail of an auth error (`refresh_reused`, `wallet_not_allowed`, …).
fn reason(e: &ApiFailure) -> Option<String> {
    match e {
        ApiFailure::Api {
            details: Some(d), ..
        } => d.get("reason").and_then(|r| r.as_str()).map(str::to_owned),
        _ => None,
    }
}

// ---------------------------------------------------------------------------------------------
// session manager
// ---------------------------------------------------------------------------------------------

/// Why no token could be produced.
#[derive(Debug, Clone, PartialEq)]
pub enum AuthError {
    /// Not signed in (or the session ended: reused / revoked / expired refresh token).
    SignedOut,
    WalletNotAllowed,
    /// Transient (network, 429, 5xx): the session is kept, try again later.
    Unavailable(String),
}

pub struct SessionManager {
    client: AuthClient,
    store: Box<dyn TokenStore>,
    /// The single-flight lock: held across a refresh so only one refresh token is ever presented.
    cur: tokio::sync::Mutex<Option<Session>>,
    state: std::sync::Mutex<AuthState>,
    /// Workspace of the signed-in owner (set once; the app is single-owner).
    pub workspace: std::sync::OnceLock<String>,
    now: fn() -> i64,
}

impl SessionManager {
    pub fn new(client: AuthClient, store: Box<dyn TokenStore>) -> Arc<Self> {
        Self::with_clock(client, store, || crate::util::now_ms() as i64)
    }
    pub fn with_clock(
        client: AuthClient,
        store: Box<dyn TokenStore>,
        now: fn() -> i64,
    ) -> Arc<Self> {
        let loaded = store.load();
        let state = match &loaded {
            Some(s) => AuthState::SignedIn {
                address: s.address.clone(),
                workspace_id: s.workspace_id.clone(),
            },
            None => AuthState::SignedOut { reason: None },
        };
        let workspace = std::sync::OnceLock::new();
        if let Some(ws) = loaded.as_ref().and_then(|s| s.workspace_id.clone()) {
            let _ = workspace.set(ws);
        }
        Arc::new(Self {
            client,
            store,
            cur: tokio::sync::Mutex::new(loaded),
            state: std::sync::Mutex::new(state),
            workspace,
            now,
        })
    }

    pub fn state(&self) -> AuthState {
        self.state.lock().unwrap().clone()
    }
    pub fn set_state(&self, s: AuthState) {
        *self.state.lock().unwrap() = s;
    }

    /// End the session locally (store + memory) with a reason for the UI.
    fn end(&self, cur: &mut Option<Session>, why: AuthState) {
        *cur = None;
        self.store.clear();
        self.set_state(why);
    }

    /// A valid access token, refreshing (single flight) when it expires within a minute.
    pub async fn access_token(&self) -> Result<String, AuthError> {
        let mut cur = self.cur.lock().await;
        let Some(s) = cur.clone() else {
            return Err(AuthError::SignedOut);
        };
        if s.expires_ms() - (self.now)() > REFRESH_MARGIN_MS {
            return Ok(s.access_token);
        }
        self.refresh_locked(&mut cur, &s).await
    }

    /// The API answered 401 to `used_token`: refresh unless another caller already did.
    pub async fn on_unauthorized(&self, used_token: &str) -> Result<String, AuthError> {
        let mut cur = self.cur.lock().await;
        let Some(s) = cur.clone() else {
            return Err(AuthError::SignedOut);
        };
        if s.access_token != used_token {
            return Ok(s.access_token); // someone refreshed while we were waiting
        }
        self.refresh_locked(&mut cur, &s).await
    }

    async fn refresh_locked(
        &self,
        cur: &mut Option<Session>,
        s: &Session,
    ) -> Result<String, AuthError> {
        match self.client.refresh(&s.refresh_token).await {
            Ok(mut n) => {
                n.workspace_id = n.workspace_id.or_else(|| s.workspace_id.clone());
                // Persist the rotated token before anyone can use it: the old one is now poison.
                if let Err(e) = self.store.save(&n) {
                    log::warn!("keychain save failed: {e}");
                }
                let token = n.access_token.clone();
                *cur = Some(n);
                Ok(token)
            }
            Err(e) if e.code() == "FORBIDDEN_ROLE" => {
                self.end(
                    cur,
                    AuthState::WalletNotAllowed {
                        address: Some(s.address.clone()),
                    },
                );
                Err(AuthError::WalletNotAllowed)
            }
            Err(e)
                if e.code() == "UNAUTHENTICATED"
                    || matches!(&e, ApiFailure::Api { http: 401, .. }) =>
            {
                self.end(
                    cur,
                    AuthState::SignedOut {
                        reason: reason(&e).or(Some("session_ended".into())),
                    },
                );
                Err(AuthError::SignedOut)
            }
            Err(e) => Err(AuthError::Unavailable(e.code().to_owned())),
        }
    }

    /// Finish a browser login: verify the signed message and store the session.
    pub async fn complete(&self, cb: &Callback, domain: &str) -> AuthState {
        if let Err(why) = check_message(&cb.message, domain, &cb.address, (self.now)()) {
            let st = AuthState::Failed { code: why.into() };
            self.set_state(st.clone());
            return st;
        }
        let st = match self
            .client
            .verify(&cb.address, &cb.message, &cb.signature)
            .await
        {
            Ok(s) => self.adopt(s).await,
            Err(e) if e.code() == "FORBIDDEN_ROLE" => AuthState::WalletNotAllowed {
                address: Some(cb.address.clone()),
            },
            Err(e) => AuthState::Failed {
                code: e.code().to_owned(),
            },
        };
        self.set_state(st.clone());
        st
    }

    /// Store a fresh session (keychain only) and remember its workspace.
    async fn adopt(&self, s: Session) -> AuthState {
        let mut cur = self.cur.lock().await;
        if let Err(e) = self.store.save(&s) {
            log::warn!("keychain save failed: {e}");
        }
        if let Some(ws) = &s.workspace_id {
            if self.workspace.get().is_some_and(|w| w != ws) {
                log::warn!("signed in to a different workspace; restart to switch");
            }
            let _ = self.workspace.set(ws.clone());
        }
        let st = AuthState::SignedIn {
            address: s.address.clone(),
            workspace_id: s.workspace_id.clone(),
        };
        *cur = Some(s);
        st
    }

    /// Deep-link hand-off (API 4.1.1 step 2): exchange the one-time code + PKCE verifier for the session.
    /// Called once per accepted callback; the same code is never retried (the server burns it on the first
    /// attempt, even with a wrong verifier).
    pub async fn complete_exchange(&self, code: &crate::deeplink::AcceptedCode) -> AuthState {
        let st = if code.expired() {
            AuthState::SignInAgain {
                reason: "code_expired".into(),
            } // 60 s TTL checked locally too; no request
        } else {
            match self.client.exchange(&code.code, &code.verifier).await {
                Ok(s) => self.adopt(s).await,
                Err(e) if e.code() == "FORBIDDEN_ROLE" => {
                    AuthState::WalletNotAllowed { address: None }
                }
                Err(e)
                    if e.code() == "UNAUTHENTICATED"
                        || matches!(&e, ApiFailure::Api { http: 401, .. }) =>
                {
                    let r = reason(&e).unwrap_or_default();
                    AuthState::SignInAgain {
                        reason: if r == "code_verifier_mismatch" {
                            r
                        } else {
                            "code_invalid".into()
                        },
                    }
                }
                Err(e) => AuthState::Failed {
                    code: e.code().to_owned(),
                },
            }
        };
        self.set_state(st.clone());
        st
    }

    /// Revoke on the server (best effort) and forget locally.
    pub async fn logout(&self) {
        let mut cur = self.cur.lock().await;
        if let Some(s) = cur.clone() {
            let _ = self.client.logout(&s.refresh_token).await;
        }
        self.end(
            &mut cur,
            AuthState::SignedOut {
                reason: Some("signed_out".into()),
            },
        );
    }
}

// ---------------------------------------------------------------------------------------------
// loopback callback + system browser
// ---------------------------------------------------------------------------------------------

/// `POST /siws/verify` answer for `client: "desktop"` + PKCE (API 4.1.1): no session, no cookies. The web page
/// receives it in production; only the smoke test plays the page here.
#[cfg(test)]
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct HandoffCode {
    pub code: String,
    pub expires_in: u32,
    pub expires_at: IsoTs,
    pub state: String,
    pub redirect_uri: String,
}

/// What the browser page hands back.
#[derive(Debug, Clone, PartialEq)]
pub struct Callback {
    pub address: String,
    pub message: String,
    pub signature: String,
}

pub struct Loopback {
    listener: TcpListener,
    state: String,
}

/// 128 random bits as 32 hex chars (OS CSPRNG).
fn random_state() -> Result<String, String> {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).map_err(|e| e.to_string())?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn pct_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' => {
                let h = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
                out.push(u8::from_str_radix(h, 16).ok()?);
                i += 2;
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8(out).ok()
}

/// Parse `GET /siws/callback?…` → params, checking `state`.
pub fn parse_callback(request_head: &str, state: &str) -> Result<Callback, &'static str> {
    let line = request_head.lines().next().ok_or("empty")?;
    let mut parts = line.split(' ');
    let (Some("GET"), Some(target), Some(v)) = (parts.next(), parts.next(), parts.next()) else {
        return Err("method");
    };
    if !v.starts_with("HTTP/1.") {
        return Err("method");
    }
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != "/siws/callback" {
        return Err("path");
    }
    let mut got = std::collections::HashMap::new();
    for kv in query.split('&').filter(|s| !s.is_empty()) {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        if got
            .insert(k.to_owned(), pct_decode(v).ok_or("encoding")?)
            .is_some()
        {
            return Err("duplicate");
        }
    }
    if !got
        .get("state")
        .is_some_and(|s| ct_eq(s.as_bytes(), state.as_bytes()))
    {
        return Err("state");
    }
    if let Some(e) = got.get("error") {
        return Err(if e == "user_rejected" {
            "user_rejected"
        } else {
            "browser_error"
        });
    }
    let (Some(address), Some(message), Some(signature)) = (
        got.remove("address"),
        got.remove("message"),
        got.remove("signature"),
    ) else {
        return Err("params");
    };
    if !is_address(&address)
        || message.len() > 4096
        || !(64..=100).contains(&signature.len())
        || !signature.bytes().all(|b| b.is_ascii_alphanumeric())
    {
        return Err("params");
    }
    Ok(Callback {
        address,
        message,
        signature,
    })
}

fn done_html() -> String {
    let n = crate::brand::app_name();
    format!("<!doctype html><meta charset=utf-8><title>{n}</title><p>Selesai. Kembali ke {n}; jendela ini boleh ditutup. / Done. Return to {n}; you can close this tab.</p>")
}

impl Loopback {
    pub async fn bind() -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .map_err(|e| e.to_string())?;
        Ok(Self {
            listener,
            state: random_state()?,
        })
    }
    pub fn redirect_uri(&self) -> String {
        format!(
            "http://127.0.0.1:{}/siws/callback",
            self.listener.local_addr().map(|a| a.port()).unwrap_or(0)
        )
    }
    pub fn state(&self) -> &str {
        &self.state
    }

    /// Serve until one valid callback arrives (wrong state / path / junk → 400 and keep waiting, at
    /// most 20 requests), the browser reports an error, or `timeout`.
    pub async fn wait(self, timeout: Duration) -> Result<Callback, String> {
        tokio::time::timeout(timeout, async {
            for _ in 0..20 {
                let (mut sock, _) = self.listener.accept().await.map_err(|e| e.to_string())?;
                let mut buf = Vec::new();
                let mut chunk = [0u8; 2048];
                while !buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() < MAX_REQUEST {
                    match tokio::time::timeout(Duration::from_secs(5), sock.read(&mut chunk)).await {
                        Ok(Ok(n)) if n > 0 => buf.extend_from_slice(&chunk[..n]),
                        _ => break,
                    }
                }
                let head = String::from_utf8_lossy(&buf).to_string();
                let r = parse_callback(&head, &self.state);
                let (code, body) = if r.is_ok() || matches!(r, Err("user_rejected" | "browser_error")) { ("200 OK", done_html()) } else { ("400 Bad Request", "bad request".to_owned()) };
                let resp = format!("HTTP/1.1 {code}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len());
                let _ = sock.write_all(resp.as_bytes()).await;
                let _ = sock.shutdown().await;
                match r {
                    Ok(cb) => return Ok(cb),
                    Err(e @ ("user_rejected" | "browser_error")) => return Err(e.to_string()),
                    Err(_) => continue,
                }
            }
            Err("too_many_requests".to_string())
        })
        .await
        .map_err(|_| "timeout".to_string())?
    }
}

/// The login page URL (`CENTURION_LOGIN_URL`, an https web-app page; plain http only to loopback for dev).
pub fn login_url(page: &str, redirect_uri: &str, state: &str) -> Result<String, String> {
    let ok = page.starts_with("https://")
        || page.starts_with("http://127.0.0.1")
        || page.starts_with("http://localhost");
    if !ok || page.len() > 300 || page.contains(char::is_whitespace) || page.contains('#') {
        return Err("CENTURION_LOGIN_URL must be an https URL".into());
    }
    let enc = |s: &str| -> String {
        s.bytes()
            .map(|b| {
                if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                    (b as char).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect()
    };
    Ok(format!(
        "{page}{}redirect_uri={}&state={}&client=desktop",
        if page.contains('?') { '&' } else { '?' },
        enc(redirect_uri),
        enc(state)
    ))
}

/// Deep-link hand-off login page URL (API 4.1.1): `/auth/desktop?state=&code_challenge=&code_challenge_method=S256`.
pub fn handoff_url(page: &str, state: &str, code_challenge: &str) -> Result<String, String> {
    let ok = page.starts_with("https://")
        || page.starts_with("http://127.0.0.1")
        || page.starts_with("http://localhost");
    if !ok || page.len() > 300 || page.contains(char::is_whitespace) || page.contains('#') {
        return Err("CENTURION_LOGIN_URL must be an https URL".into());
    }
    let b64 = |s: &str| {
        s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    };
    if !b64(state) || !b64(code_challenge) || code_challenge.len() != 43 {
        return Err("bad state/challenge".into());
    }
    Ok(format!(
        "{page}{}state={state}&code_challenge={code_challenge}&code_challenge_method=S256",
        if page.contains('?') { '&' } else { '?' }
    ))
}

/// SIWS `domain` = the host[:port] of the login page (what the page's origin will be).
pub fn login_domain(page: &str) -> String {
    page.split("://")
        .nth(1)
        .unwrap_or("")
        .split(['/', '?'])
        .next()
        .unwrap_or("")
        .to_owned()
}

/// Open the OS default browser. The URL is built by Rust from config (never from the webview).
pub fn open_system_browser(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://")
        || url.starts_with("http://127.0.0.1")
        || url.starts_with("http://localhost"))
        || url.contains(char::is_whitespace)
    {
        return Err("refusing to open a non-https URL".into());
    }
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("rundll32");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(url)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    pub const ADDR: &str = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
    pub type Handler = Arc<dyn Fn(&str, &str, &str, &Value) -> (u16, Value) + Send + Sync>;

    /// Minimal in-process HTTP/1.1 server: `handler(method, path, authorization, json body)`.
    /// A 60 ms delay per response widens the race window for the single-flight test.
    pub async fn stub(handler: Handler) -> String {
        let l = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let base = format!("http://127.0.0.1:{}", l.local_addr().unwrap().port());
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = l.accept().await else {
                    return;
                };
                let h = handler.clone();
                tokio::spawn(async move {
                    let mut buf = Vec::new();
                    let mut chunk = [0u8; 4096];
                    let (head_end, len) = loop {
                        let n = sock.read(&mut chunk).await.unwrap_or(0);
                        if n == 0 {
                            return;
                        }
                        buf.extend_from_slice(&chunk[..n]);
                        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            let head = String::from_utf8_lossy(&buf[..p]).to_lowercase();
                            let len = head
                                .lines()
                                .find_map(|l| {
                                    l.strip_prefix("content-length:")
                                        .map(|v| v.trim().parse::<usize>().unwrap_or(0))
                                })
                                .unwrap_or(0);
                            break (p + 4, len);
                        }
                    };
                    while buf.len() < head_end + len {
                        let n = sock.read(&mut chunk).await.unwrap_or(0);
                        if n == 0 {
                            break;
                        }
                        buf.extend_from_slice(&chunk[..n]);
                    }
                    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
                    let mut first = head.lines().next().unwrap_or("").split(' ');
                    let (m, path) = (
                        first.next().unwrap_or("").to_owned(),
                        first.next().unwrap_or("").to_owned(),
                    );
                    let auth = head
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .starts_with("authorization:")
                                .then(|| l[14..].trim().to_owned())
                        })
                        .unwrap_or_default();
                    let body: Value =
                        serde_json::from_slice(&buf[head_end..]).unwrap_or(Value::Null);
                    tokio::time::sleep(Duration::from_millis(60)).await;
                    let (st, v) = h(&m, &path, &auth, &body);
                    let b = v.to_string();
                    let _ = sock.write_all(format!("HTTP/1.1 {st} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{b}", b.len()).as_bytes()).await;
                });
            }
        });
        base
    }

    pub fn iso(ms: i64) -> IsoTs {
        IsoTs(
            chrono::DateTime::from_timestamp_millis(ms)
                .unwrap()
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        )
    }
    fn now() -> i64 {
        crate::util::now_ms() as i64
    }
    pub fn session(n: usize, expires_in_ms: i64) -> Session {
        Session {
            access_token: format!("at{n}.x.y"),
            expires_at: iso(now() + expires_in_ms),
            refresh_token: format!("srt_{n}"),
            session_id: "sid".into(),
            user_id: "u1".into(),
            address: ADDR.into(),
            workspace_id: Some("10000000-0000-0000-0000-0000000000a1".into()),
        }
    }
    pub fn session_json(n: usize) -> Value {
        let s = session(n, 900_000);
        json!({"data": {"access_token": s.access_token, "token_type": "Bearer", "expires_in": 900, "expires_at": s.expires_at.0, "refresh_token": s.refresh_token, "refresh_expires_in": 2592000, "session_id": "sid", "user_id": "u1", "address": ADDR}, "server_now": iso(now()).0})
    }
    fn err(http: u16, code: &str, reason: &str) -> (u16, Value) {
        (
            http,
            json!({"error": {"code": code, "message": "x", "details": {"reason": reason}}}),
        )
    }
    fn manager(base: &str, s: Option<Session>) -> (Arc<SessionManager>, Arc<MemoryStore>) {
        let store = Arc::new(MemoryStore::default());
        if let Some(s) = s {
            store.save(&s).unwrap();
        }
        struct Shared(Arc<MemoryStore>);
        impl TokenStore for Shared {
            fn load(&self) -> Option<Session> {
                self.0.load()
            }
            fn save(&self, s: &Session) -> Result<(), String> {
                self.0.save(s)
            }
            fn clear(&self) {
                self.0.clear()
            }
        }
        (
            SessionManager::new(
                AuthClient::new(base).unwrap(),
                Box::new(Shared(store.clone())),
            ),
            store,
        )
    }

    /// Rotating refresh tokens: N concurrent callers with an expiring token → exactly one refresh
    /// request, every caller gets the new token, and the rotated refresh token is in the store.
    #[tokio::test]
    async fn single_flight_refresh_presents_each_refresh_token_once() {
        let calls = Arc::new(AtomicUsize::new(0));
        let c = calls.clone();
        let base = stub(Arc::new(move |_, path, _, body| {
            assert_eq!(path, "/v1/auth/session/refresh");
            assert_eq!(
                body["refresh_token"], "srt_1",
                "a rotated (old) refresh token was presented again"
            );
            c.fetch_add(1, Ordering::SeqCst);
            (200, session_json(2))
        }))
        .await;
        let (sm, store) = manager(&base, Some(session(1, 10_000))); // inside the 60 s margin
        let mut hs = Vec::new();
        for _ in 0..8 {
            let sm = sm.clone();
            hs.push(tokio::spawn(async move { sm.access_token().await }));
        }
        for h in hs {
            assert_eq!(h.await.unwrap().unwrap(), "at2.x.y");
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(store.load().unwrap().refresh_token, "srt_2");
        // a 401 seen with the *old* access token must not refresh again
        assert_eq!(sm.on_unauthorized("at1.x.y").await.unwrap(), "at2.x.y");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        // a fresh token is served from memory
        assert_eq!(sm.access_token().await.unwrap(), "at2.x.y");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn refresh_reused_or_revoked_signs_out_and_clears_the_keychain() {
        for why in ["refresh_reused", "refresh_revoked", "refresh_expired"] {
            let base = stub(Arc::new(move |_, _, _, _| err(401, "UNAUTHENTICATED", why))).await;
            let (sm, store) = manager(&base, Some(session(1, 1_000)));
            assert_eq!(sm.access_token().await, Err(AuthError::SignedOut));
            assert_eq!(
                sm.state(),
                AuthState::SignedOut {
                    reason: Some(why.into())
                }
            );
            assert!(store.load().is_none(), "{why}: tokens must be gone");
            assert_eq!(sm.access_token().await, Err(AuthError::SignedOut));
        }
    }

    #[tokio::test]
    async fn wallet_not_allowed_on_refresh_and_on_verify_is_its_own_state() {
        let base = stub(Arc::new(|_, _, _, _| {
            err(403, "FORBIDDEN_ROLE", "wallet_not_allowed")
        }))
        .await;
        let (sm, store) = manager(&base, Some(session(1, 1_000)));
        assert_eq!(sm.access_token().await, Err(AuthError::WalletNotAllowed));
        assert_eq!(
            sm.state(),
            AuthState::WalletNotAllowed {
                address: Some(ADDR.into())
            }
        );
        assert!(store.load().is_none());

        let (sm, _) = manager(&base, None);
        let cb = Callback {
            address: ADDR.into(),
            message: message("app.centurion.local", ADDR, now() + 60_000),
            signature: "5".repeat(88),
        };
        assert_eq!(
            sm.complete(&cb, "app.centurion.local").await,
            AuthState::WalletNotAllowed {
                address: Some(ADDR.into())
            }
        );
    }

    #[tokio::test]
    async fn transient_refresh_failure_keeps_the_session() {
        let base = stub(Arc::new(|_, _, _, _| {
            (
                503,
                json!({"error": {"code": "UNAVAILABLE", "message": "x"}}),
            )
        }))
        .await;
        let (sm, store) = manager(&base, Some(session(1, 1_000)));
        assert!(matches!(
            sm.access_token().await,
            Err(AuthError::Unavailable(_))
        ));
        assert_eq!(store.load().unwrap().refresh_token, "srt_1");
    }

    #[tokio::test]
    async fn verify_stores_session_with_desktop_client_and_logout_revokes() {
        let seen = Arc::new(std::sync::Mutex::new(Vec::<(String, Value)>::new()));
        let s2 = seen.clone();
        let base = stub(Arc::new(move |_, path, _, body| {
            s2.lock().unwrap().push((path.to_owned(), body.clone()));
            match path {
                "/v1/auth/siws/verify" => {
                    let mut v = session_json(1);
                    v["data"]["workspace_id"] = json!("10000000-0000-0000-0000-0000000000a1");
                    (200, v)
                }
                _ => (200, json!({"data": {"revoked": true}})),
            }
        }))
        .await;
        let (sm, store) = manager(&base, None);
        let msg = message("app.centurion.local", ADDR, now() + 60_000);
        let cb = Callback {
            address: ADDR.into(),
            message: msg.clone(),
            signature: "5".repeat(88),
        };
        assert_eq!(
            sm.complete(&cb, "app.centurion.local").await,
            AuthState::SignedIn {
                address: ADDR.into(),
                workspace_id: Some("10000000-0000-0000-0000-0000000000a1".into())
            }
        );
        assert_eq!(
            sm.workspace.get().unwrap(),
            "10000000-0000-0000-0000-0000000000a1"
        );
        assert_eq!(store.load().unwrap().refresh_token, "srt_1");
        sm.logout().await;
        assert!(store.load().is_none());
        let seen = seen.lock().unwrap();
        assert_eq!(
            seen[0].1,
            json!({"address": ADDR, "message": msg, "signature": "5".repeat(88), "client": "desktop"})
        );
        assert_eq!(
            seen[1],
            (
                "/v1/auth/session/logout".into(),
                json!({"refresh_token": "srt_1"})
            )
        );
    }

    /// Same layout as the backend's `buildMessage()` (services/backend/api/src/siws.ts), current statement v2.
    pub fn message(domain: &str, addr: &str, exp_ms: i64) -> String {
        message_v(domain, addr, exp_ms, SIWS_STATEMENTS[1].1)
    }
    pub fn message_v(domain: &str, addr: &str, exp_ms: i64, statement: &str) -> String {
        format!("{domain} wants you to sign in with your Solana account:\n{addr}\n\n{statement}\n\nURI: https://{domain}/auth/desktop\nVersion: 1\nChain ID: solana:mainnet\nNonce: AbCdEfGh12345678AbCd\nIssued At: {}\nExpiration Time: {}", iso(exp_ms - 300_000).0, iso(exp_ms).0)
    }

    #[test]
    fn siws_statements_match_contract_1_1_6_and_the_nov_5_cutoff() {
        // contracts 1.1.6 API_ENDPOINTS 4.1 table, verbatim; v2 = i18n auth.siws.statement.
        assert_eq!(SIWS_STATEMENTS[0], (1, "Sign in to Centurion (practice). This request does not trigger a transaction or cost any fees."));
        assert_eq!(SIWS_STATEMENTS[1], (2, "Sign in to Centurion Trade"));
        let en: Value =
            serde_json::from_str(include_str!("../../../../packages/i18n/en.json")).unwrap();
        assert_eq!(en["auth"]["siws"]["statement"], SIWS_STATEMENTS[1].1);
        let api = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../packages/contracts/API_ENDPOINTS.md"
        ))
        .unwrap();
        for (v, st) in SIWS_STATEMENTS {
            assert!(
                api.contains(&format!("| {v} | `{st}` |")),
                "statement v{v} not in API_ENDPOINTS"
            );
        }
        assert!(api.contains("`2026-11-05T12:00:00Z`"), "default cutoff");
        assert_eq!(
            IsoTs("2026-11-05T12:00:00.000Z".into()).ms(),
            Some(SIWS_LEGACY_UNTIL_MS),
            "= Thu 5 Nov 19:00 WIB"
        );
        let cut = SIWS_LEGACY_UNTIL_MS;
        let (v1, v2) = (SIWS_STATEMENTS[0].1, SIWS_STATEMENTS[1].1);
        assert_eq!(statement_version(v1, cut - 1), Some(1));
        assert_eq!(statement_version(v1, cut), None);
        assert_eq!(statement_version(v2, cut - 1), Some(2));
        assert_eq!(statement_version(v2, cut + 86_400_000), Some(2));
        // full pre-check, before and after the cutoff (expiry relative to "now")
        let d = "app.centurion.local";
        assert_eq!(
            check_message(
                &message_v(d, ADDR, cut - 1_000 + 60_000, v1),
                d,
                ADDR,
                cut - 1_000
            ),
            Ok(())
        );
        assert_eq!(
            check_message(&message_v(d, ADDR, cut + 60_000, v1), d, ADDR, cut),
            Err("statement_retired")
        );
        assert_eq!(
            check_message(&message_v(d, ADDR, cut + 60_000, v2), d, ADDR, cut),
            Ok(())
        );
        assert_eq!(
            check_message(
                &message_v(d, ADDR, cut + 60_000, "Sign in to Sentra (practice)."),
                d,
                ADDR,
                cut
            ),
            Err("message_statement")
        );
        assert_eq!(
            check_message(
                &message_v(d, ADDR, cut + 60_000, &format!("{v2} ")),
                d,
                ADDR,
                cut
            ),
            Err("message_statement")
        );
        let bad_ts =
            message(d, ADDR, now() + 60_000).replace("Issued At: 20", "Issued At: yesterday 20");
        assert_eq!(
            check_message(&bad_ts, d, ADDR, now()),
            Err("message_fields")
        );
    }

    #[test]
    fn handoff_url_carries_exactly_state_and_s256_challenge() {
        let ch = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
        assert_eq!(handoff_url("https://app.centuriontrade.local/auth/desktop", "st_1-x", ch).unwrap(),
            format!("https://app.centuriontrade.local/auth/desktop?state=st_1-x&code_challenge={ch}&code_challenge_method=S256"));
        assert!(handoff_url("https://a/x", "bad state", ch).is_err());
        assert!(handoff_url("https://a/x", "s", "short").is_err());
        assert!(handoff_url("http://evil.example/x", "s", ch).is_err());
    }

    #[tokio::test]
    async fn deep_link_exchange_stores_session_and_refused_codes_mean_sign_in_again() {
        let seen = Arc::new(std::sync::Mutex::new(Vec::<(String, Value)>::new()));
        let s2 = seen.clone();
        let base = stub(Arc::new(move |_, path, _, body| {
            s2.lock().unwrap().push((path.to_owned(), body.clone()));
            match body["code"].as_str().unwrap_or("") {
                c if c.starts_with("ok") => {
                    let mut v = session_json(1);
                    v["data"]["workspace_id"] = json!("10000000-0000-0000-0000-0000000000a1");
                    (200, v)
                }
                c if c.starts_with("mismatch") => {
                    err(401, "UNAUTHENTICATED", "code_verifier_mismatch")
                }
                c if c.starts_with("used") => err(401, "UNAUTHENTICATED", "code_invalid"),
                c if c.starts_with("weird") => err(401, "UNAUTHENTICATED", "something_else"),
                c if c.starts_with("stranger") => err(403, "FORBIDDEN_ROLE", "wallet_not_allowed"),
                _ => (
                    503,
                    json!({"error": {"code": "UNAVAILABLE", "message": "x"}}),
                ),
            }
        }))
        .await;
        let code = |c: &str| crate::deeplink::AcceptedCode {
            code: c.into(),
            verifier: "v".repeat(43),
            received: std::time::Instant::now(),
        };
        let (sm, store) = manager(&base, None);
        assert_eq!(
            sm.complete_exchange(&code("mismatch")).await,
            AuthState::SignInAgain {
                reason: "code_verifier_mismatch".into()
            }
        );
        assert_eq!(
            sm.complete_exchange(&code("used")).await,
            AuthState::SignInAgain {
                reason: "code_invalid".into()
            }
        );
        assert_eq!(
            sm.complete_exchange(&code("weird")).await,
            AuthState::SignInAgain {
                reason: "code_invalid".into()
            }
        );
        assert_eq!(
            sm.complete_exchange(&code("stranger")).await,
            AuthState::WalletNotAllowed { address: None }
        );
        assert!(matches!(
            sm.complete_exchange(&code("down")).await,
            AuthState::Failed { .. }
        ));
        assert!(store.load().is_none(), "nothing stored on any refusal");
        let n = seen.lock().unwrap().len();
        let stale = crate::deeplink::AcceptedCode {
            received: std::time::Instant::now()
                - crate::deeplink::CODE_TTL
                - std::time::Duration::from_secs(1),
            ..code("ok-late")
        };
        assert_eq!(
            sm.complete_exchange(&stale).await,
            AuthState::SignInAgain {
                reason: "code_expired".into()
            }
        );
        assert_eq!(
            seen.lock().unwrap().len(),
            n,
            "expired locally → no request"
        );
        let st = sm.complete_exchange(&code("ok-1")).await;
        assert_eq!(
            st,
            AuthState::SignedIn {
                address: ADDR.into(),
                workspace_id: Some("10000000-0000-0000-0000-0000000000a1".into())
            }
        );
        assert_eq!(store.load().unwrap().refresh_token, "srt_1");
        let seen = seen.lock().unwrap();
        let (path, body) = seen.last().unwrap();
        assert_eq!(path, "/v1/auth/desktop/exchange");
        assert_eq!(
            body,
            &json!({"code": "ok-1", "code_verifier": "v".repeat(43), "client": "desktop"})
        );
        assert_eq!(
            seen.iter().filter(|(_, b)| b["code"] == "mismatch").count(),
            1,
            "a refused code is sent once, never retried"
        );
    }

    #[test]
    fn message_precheck_rejects_wrong_domain_address_and_expired() {
        let n = now();
        assert_eq!(
            check_message(
                &message("app.centurion.local", ADDR, n + 60_000),
                "app.centurion.local",
                ADDR,
                n
            ),
            Ok(())
        );
        assert_eq!(
            check_message(
                &message("evil.example", ADDR, n + 60_000),
                "app.centurion.local",
                ADDR,
                n
            ),
            Err("message_domain")
        );
        let other = "7xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
        assert_eq!(
            check_message(
                &message("app.centurion.local", other, n + 60_000),
                "app.centurion.local",
                ADDR,
                n
            ),
            Err("message_address")
        );
        assert_eq!(
            check_message(
                &message("app.centurion.local", ADDR, n - 1),
                "app.centurion.local",
                ADDR,
                n
            ),
            Err("message_expired")
        );
        assert_eq!(
            check_message("hello", "app.centurion.local", ADDR, n),
            Err("message_layout")
        );
    }

    fn req(q: &str) -> String {
        format!("GET /siws/callback?{q} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
    }

    #[test]
    fn callback_parse_checks_state_path_and_params() {
        let sig = "5".repeat(88);
        let msg = "a%20b%0Ac";
        let ok = parse_callback(
            &req(&format!(
                "state=s1&address={ADDR}&message={msg}&signature={sig}"
            )),
            "s1",
        )
        .unwrap();
        assert_eq!(ok.message, "a b\nc");
        assert_eq!(
            parse_callback(
                &req(&format!(
                    "state=s2&address={ADDR}&message=m&signature={sig}"
                )),
                "s1"
            ),
            Err("state")
        );
        assert_eq!(
            parse_callback(
                &req(&format!("address={ADDR}&message=m&signature={sig}")),
                "s1"
            ),
            Err("state")
        );
        assert_eq!(
            parse_callback(
                &req(&format!(
                    "state=s1&state=s1&address={ADDR}&message=m&signature={sig}"
                )),
                "s1"
            ),
            Err("duplicate")
        );
        assert_eq!(
            parse_callback(&req("state=s1&error=user_rejected"), "s1"),
            Err("user_rejected")
        );
        assert_eq!(
            parse_callback(&req("state=s1&address=0OIl&message=m&signature=x"), "s1"),
            Err("params")
        );
        assert_eq!(
            parse_callback("POST /siws/callback?state=s1 HTTP/1.1\r\n\r\n", "s1"),
            Err("method")
        );
        assert_eq!(
            parse_callback("GET /other?state=s1 HTTP/1.1\r\n\r\n", "s1"),
            Err("path")
        );
    }

    #[tokio::test]
    async fn loopback_ignores_forged_callbacks_and_accepts_the_real_one() {
        let lb = Loopback::bind().await.unwrap();
        let uri = lb.redirect_uri();
        assert!(uri.starts_with("http://127.0.0.1:") && uri.ends_with("/siws/callback"));
        let (state, port) = (
            lb.state().to_owned(),
            uri.split(':')
                .nth(2)
                .unwrap()
                .split('/')
                .next()
                .unwrap()
                .to_owned(),
        );
        assert_eq!(state.len(), 32);
        let task = tokio::spawn(lb.wait(Duration::from_secs(5)));
        let send = |q: String| {
            let port = port.clone();
            async move {
                let mut s = tokio::net::TcpStream::connect(format!("127.0.0.1:{port}"))
                    .await
                    .unwrap();
                s.write_all(req(&q).as_bytes()).await.unwrap();
                let mut out = String::new();
                s.read_to_string(&mut out).await.unwrap();
                out
            }
        };
        let sig = "5".repeat(88);
        assert!(send(format!(
            "state=forged&address={ADDR}&message=m&signature={sig}"
        ))
        .await
        .starts_with("HTTP/1.1 400"));
        let ok = send(format!(
            "state={state}&address={ADDR}&message=m&signature={sig}"
        ))
        .await;
        assert!(ok.starts_with("HTTP/1.1 200") && ok.contains("Cache-Control: no-store"));
        assert_eq!(task.await.unwrap().unwrap().address, ADDR);
    }

    #[test]
    fn login_url_encodes_and_refuses_plain_http() {
        let u = login_url(
            "https://app.centuriontrade.local/auth/desktop",
            "http://127.0.0.1:5000/siws/callback",
            "ab12",
        )
        .unwrap();
        assert_eq!(u, "https://app.centuriontrade.local/auth/desktop?redirect_uri=http%3A%2F%2F127.0.0.1%3A5000%2Fsiws%2Fcallback&state=ab12&client=desktop");
        assert!(login_url("http://evil.example/x", "r", "s").is_err());
        assert_eq!(
            login_domain("https://app.centuriontrade.local/auth/desktop"),
            "app.centuriontrade.local"
        );
        assert!(open_system_browser("file:///etc/passwd").is_err());
    }
}
