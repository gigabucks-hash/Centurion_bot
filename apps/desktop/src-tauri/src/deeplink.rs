//! `centurion://auth` return path (API_ENDPOINTS 4.1.1, contracts 1.1.6 ca52707, implemented by Backend 781e84a).
//! Tokens never appear in a URL:
//!
//! 1. [`PendingLogins::start`] makes `state` + a PKCE pair (S256); the app opens the web page
//!    `/auth/desktop?state=&code_challenge=&code_challenge_method=S256` (`auth::handoff_url`).
//! 2. The page signs in (nonce + wallet signature) and calls `POST /v1/auth/siws/verify {client: "desktop",
//!    code_challenge, code_challenge_method: "S256", state, redirect_uri}` → a one-time `code` (43 chars, 60 s,
//!    single use); no session, no cookies. It then navigates to `centurion://auth?code=&state=`.
//! 3. The OS hands that URL to the app (Linux: `.desktop` `x-scheme-handler/centurion` + `%u`; the second
//!    launch's argv reaches the running instance through tauri-plugin-single-instance). [`PendingLogins::accept`]
//!    checks it strictly and once; `auth::SessionManager::complete_exchange` posts `{code, code_verifier}` to
//!    `/v1/auth/desktop/exchange` and stores the session in the OS keychain only.
//!
//! Windows scheme registration needs `tauri-plugin-deep-link` (not in the offline cache, needs review);
//! until then the loopback flow (`auth::Loopback`) stays the default (`CENTURION_AUTH_RETURN`).
//! macOS is not a supported target.
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const SCHEME: &str = "centurion";
/// The only return target the backend allows (no open redirect).
#[cfg_attr(not(test), allow(dead_code))]
pub const REDIRECT_URI: &str = "centurion://auth";
/// A pending login is valid this long (matches the 5-min SIWS nonce).
pub const PENDING_TTL: Duration = Duration::from_secs(300);
/// One-time code TTL (server: 60 s from verify). Checked locally from the callback's arrival too.
pub const CODE_TTL: Duration = Duration::from_secs(60);
/// Server codes are 43-char base64url (32 random bytes).
pub const CODE_LEN: usize = 43;

fn b64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 2);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16
            | (*c.get(1).unwrap_or(&0) as u32) << 8
            | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..=c.len() {
            out.push(A[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

/// RFC 7636 PKCE pair: 32 random bytes → 43-char verifier; challenge = BASE64URL(SHA256(verifier)).
pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}
impl Pkce {
    pub fn new() -> Result<Self, String> {
        let mut b = [0u8; 32];
        getrandom::getrandom(&mut b).map_err(|e| e.to_string())?;
        Ok(Self::from_verifier(b64url(&b)))
    }
    pub fn from_verifier(verifier: String) -> Self {
        let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
        Self {
            verifier,
            challenge,
        }
    }
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Strict parse of `centurion://auth?code=…&state=…`: exact scheme/host, empty path, no fragment, no
/// userinfo/port, exactly the two params (anything token-like is refused), `state` in constant time.
pub fn parse_auth_url(url: &str, expected_state: &str) -> Result<String, &'static str> {
    if url.len() > 1024 {
        return Err("too_long");
    }
    let rest = url
        .strip_prefix(SCHEME)
        .and_then(|r| r.strip_prefix("://"))
        .ok_or("scheme")?;
    if rest.contains('#') {
        return Err("fragment");
    }
    let (authority_path, query) = rest.split_once('?').ok_or("query")?;
    if authority_path != "auth" && authority_path != "auth/" {
        return Err("host_path");
    }
    let (mut code, mut state) = (None, None);
    for kv in query.split('&') {
        let (k, v) = kv.split_once('=').ok_or("param")?;
        let slot = match k {
            "code" => &mut code,
            "state" => &mut state,
            _ => return Err("unexpected_param"), // e.g. access_token / refresh_token: never accepted
        };
        if slot.replace(v).is_some() {
            return Err("duplicate");
        }
    }
    let (Some(code), Some(state)) = (code, state) else {
        return Err("missing");
    };
    if !ct_eq(state.as_bytes(), expected_state.as_bytes()) {
        return Err("state");
    }
    if code.len() != CODE_LEN
        || !code
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("code");
    }
    Ok(code.to_owned())
}

/// A callback that passed every local check: exchange it once, within [`CODE_TTL`].
#[derive(Debug, Clone)]
pub struct AcceptedCode {
    pub code: String,
    pub verifier: String,
    pub received: Instant,
}
impl AcceptedCode {
    pub fn expired(&self) -> bool {
        self.received.elapsed() > CODE_TTL
    }
}

fn code_fingerprint(code: &str) -> [u8; 32] {
    Sha256::digest(code.as_bytes()).into()
}

/// One login in flight; a callback is accepted **once** (the pending entry is taken), then every later
/// callback (replay, second tab) is refused. Codes already seen are remembered (SHA-256, last 32), so a code
/// is never presented twice even across logins.
#[derive(Default)]
pub struct PendingLogins(
    Mutex<Option<(String, Pkce, Instant)>>,
    Mutex<std::collections::VecDeque<[u8; 32]>>,
);
impl PendingLogins {
    /// Start a login: fresh `state` + PKCE; returns (state, challenge) for the browser URL.
    pub fn start(&self) -> Result<(String, String), String> {
        let mut b = [0u8; 16];
        getrandom::getrandom(&mut b).map_err(|e| e.to_string())?;
        let state = b64url(&b);
        let pkce = Pkce::new()?;
        let ch = pkce.challenge.clone();
        *self.0.lock().unwrap() = Some((state.clone(), pkce, Instant::now()));
        Ok((state, ch))
    }
    pub fn cancel(&self) {
        *self.0.lock().unwrap() = None;
    }
    /// Validate a deep link against the pending login → the code + verifier to exchange. Single use.
    pub fn accept(&self, url: &str) -> Result<AcceptedCode, &'static str> {
        let mut g = self.0.lock().unwrap();
        let Some((state, _, at)) = g.as_ref() else {
            return Err("no_pending_login");
        };
        if at.elapsed() > PENDING_TTL {
            *g = None;
            return Err("expired");
        }
        let code = parse_auth_url(url, state)?; // wrong state etc. leaves the real login pending
        let fp = code_fingerprint(&code);
        let mut seen = self.1.lock().unwrap();
        if seen.contains(&fp) {
            return Err("code_reused");
        }
        seen.push_back(fp);
        while seen.len() > 32 {
            seen.pop_front();
        }
        let (_, pkce, _) = g.take().expect("checked");
        Ok(AcceptedCode {
            code,
            verifier: pkce.verifier,
            received: Instant::now(),
        })
    }
}

/// Login return path: `CENTURION_AUTH_RETURN=deeplink|loopback`. Default: deep link on Linux (the .deb registers
/// `x-scheme-handler/centurion`), loopback elsewhere until tauri-plugin-deep-link is approved.
pub fn handoff_enabled() -> bool {
    match std::env::var("CENTURION_AUTH_RETURN").as_deref() {
        Ok("deeplink") => true,
        Ok("loopback") => false,
        _ => cfg!(target_os = "linux"),
    }
}

/// The first `centurion://` argument of a launch (second-instance argv or the first launch), if any.
pub fn url_in_argv(argv: &[String]) -> Option<&str> {
    argv.iter()
        .skip(1)
        .map(String::as_str)
        .find(|a| a.strip_prefix(SCHEME).is_some_and(|r| r.starts_with("://")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_s256_matches_rfc7636_appendix_b() {
        let p = Pkce::from_verifier("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk".into());
        assert_eq!(p.challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        let r = Pkce::new().unwrap();
        assert_eq!(r.verifier.len(), 43);
        assert_eq!(
            Pkce::from_verifier(r.verifier.clone()).challenge,
            r.challenge
        );
    }

    #[test]
    fn auth_url_is_parsed_strictly() {
        let code = "AbCdEf0123456789_-xyAbCdEf0123456789_-xyAbC"; // 43
        assert_eq!(code.len(), CODE_LEN);
        assert_eq!(
            parse_auth_url(&format!("centurion://auth?code={code}&state=s1"), "s1"),
            Ok(code.into())
        );
        assert_eq!(
            parse_auth_url(&format!("centurion://auth/?state=s1&code={code}"), "s1"),
            Ok(code.into())
        );
        for (url, why) in [
            (format!("centurion://auth?code={code}&state=s2"), "state"),
            (
                format!("centurion://evil?code={code}&state=s1"),
                "host_path",
            ),
            (
                format!("centurion://auth/x?code={code}&state=s1"),
                "host_path",
            ),
            (
                format!("centurion://auth@evil?code={code}&state=s1"),
                "host_path",
            ),
            (format!("centurionx://auth?code={code}&state=s1"), "scheme"), // wrong scheme (was sentra:// before the rename)
            (format!("https://auth?code={code}&state=s1"), "scheme"),
            (
                format!("centurion://auth?code={code}&state=s1#frag"),
                "fragment",
            ),
            (
                format!("centurion://auth?code={code}&state=s1&access_token=x"),
                "unexpected_param",
            ),
            (
                format!("centurion://auth?code={code}&code={code}&state=s1"),
                "duplicate",
            ),
            ("centurion://auth?code=short&state=s1".to_string(), "code"),
            (format!("centurion://auth?code={code}A&state=s1"), "code"), // 44 chars
            (
                format!("centurion://auth?code={}+&state=s1", &code[..42]),
                "code",
            ), // 43 chars, '+' not base64url
            ("centurion://auth?state=s1".to_string(), "missing"),
        ] {
            assert_eq!(parse_auth_url(&url, "s1"), Err(why), "{url}");
        }
    }

    const C: &str = "AbCdEf0123456789_-xyAbCdEf0123456789_-xyAbC";

    #[test]
    fn callback_is_single_use_and_forgeries_do_not_burn_the_login() {
        let p = PendingLogins::default();
        assert_eq!(
            p.accept(&format!("centurion://auth?code={C}&state=x"))
                .unwrap_err(),
            "no_pending_login"
        );
        let (state, challenge) = p.start().unwrap();
        assert_eq!(challenge.len(), 43);
        assert_eq!(
            p.accept(&format!("centurion://auth?code={C}&state=forged"))
                .unwrap_err(),
            "state"
        );
        let ok = format!("centurion://auth?code={C}&state={state}");
        let a = p.accept(&ok).unwrap();
        assert_eq!(
            (
                a.code.as_str(),
                Pkce::from_verifier(a.verifier.clone()).challenge
            ),
            (C, challenge)
        );
        assert!(!a.expired());
        assert_eq!(p.accept(&ok).unwrap_err(), "no_pending_login"); // replay refused
                                                                    // same code again under a NEW login: still refused (codes are single use locally too)
        let (s2, _) = p.start().unwrap();
        assert_eq!(
            p.accept(&format!("centurion://auth?code={C}&state={s2}"))
                .unwrap_err(),
            "code_reused"
        );
        let stale = AcceptedCode {
            received: Instant::now() - CODE_TTL - Duration::from_secs(1),
            ..a
        };
        assert!(stale.expired(), "60 s TTL checked locally");
    }

    #[test]
    fn deep_link_is_found_in_argv() {
        let argv = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(url_in_argv(&argv(&["centurion", "--stop"])), None);
        assert_eq!(
            url_in_argv(&argv(&["centurion", "centurion://auth?code=x&state=y"])),
            Some("centurion://auth?code=x&state=y")
        );
        assert_eq!(
            url_in_argv(&argv(&["centurion://auth?code=x&state=y"])),
            None,
            "argv[0] is the program"
        );
    }
}
