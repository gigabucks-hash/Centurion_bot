//! `centurion://auth` return path (Boss decision 2026-10-29, rebrand): the browser hands back only a
//! **one-time code** + `state`; Rust exchanges `code` + the PKCE `code_verifier` for the session.
//! Tokens never appear in a URL.
//!
//! Status: the parser / PKCE / single-use logic is implemented and unit-tested here. Registering the
//! scheme needs `tauri-plugin-deep-link`, which is **not** in the offline crate cache (not installed:
//! needs review), and the exchange endpoint is **not in the API contract yet** (proposed below). Until both
//! land, `auth_login` keeps the documented loopback flow (`auth::Loopback`).
//!
//! Proposed endpoint (for Backend): `POST /v1/auth/desktop/exchange {code, code_verifier, client:"desktop"}`
//! → `{data: Session}`; the web page obtains `code` from `/v1/auth/siws/verify` when it sends
//! `{code_challenge, code_challenge_method:"S256", state}` instead of `client:"desktop"` tokens.
#![allow(dead_code)] // wired when tauri-plugin-deep-link is approved and the exchange endpoint exists
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const SCHEME: &str = "centurion";
/// A pending login is valid this long (matches the 5-min SIWS nonce).
pub const PENDING_TTL: Duration = Duration::from_secs(300);

fn b64url(bytes: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 2);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
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
        Self { verifier, challenge }
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
    let rest = url.strip_prefix("centurion://").ok_or("scheme")?;
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
    let (Some(code), Some(state)) = (code, state) else { return Err("missing") };
    if !ct_eq(state.as_bytes(), expected_state.as_bytes()) {
        return Err("state");
    }
    if !(16..=128).contains(&code.len()) || !code.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("code");
    }
    Ok(code.to_owned())
}

/// One login in flight; a callback is accepted **once** (the pending entry is taken), then every later
/// callback (replay, second tab) is refused.
#[derive(Default)]
pub struct PendingLogins(Mutex<Option<(String, Pkce, Instant)>>);
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
    /// Validate a deep link against the pending login → (code, verifier). Single use.
    pub fn accept(&self, url: &str) -> Result<(String, String), &'static str> {
        let mut g = self.0.lock().unwrap();
        let Some((state, _, at)) = g.as_ref() else { return Err("no_pending_login") };
        if at.elapsed() > PENDING_TTL {
            *g = None;
            return Err("expired");
        }
        let code = parse_auth_url(url, state)?; // wrong state etc. leaves the real login pending
        let (_, pkce, _) = g.take().expect("checked");
        Ok((code, pkce.verifier))
    }
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
        assert_eq!(Pkce::from_verifier(r.verifier.clone()).challenge, r.challenge);
    }

    #[test]
    fn auth_url_is_parsed_strictly() {
        let code = "AbCdEf0123456789_-xy";
        assert_eq!(parse_auth_url(&format!("centurion://auth?code={code}&state=s1"), "s1"), Ok(code.into()));
        assert_eq!(parse_auth_url(&format!("centurion://auth/?state=s1&code={code}"), "s1"), Ok(code.into()));
        for (url, why) in [
            (format!("centurion://auth?code={code}&state=s2"), "state"),
            (format!("centurion://evil?code={code}&state=s1"), "host_path"),
            (format!("centurion://auth/x?code={code}&state=s1"), "host_path"),
            (format!("centurion://auth@evil?code={code}&state=s1"), "host_path"),
            (format!("centurion://auth?code={code}&state=s1"), "scheme"),
            (format!("centurion://auth?code={code}&state=s1#frag"), "fragment"),
            (format!("centurion://auth?code={code}&state=s1&access_token=x"), "unexpected_param"),
            (format!("centurion://auth?code={code}&code={code}&state=s1"), "duplicate"),
            ("centurion://auth?code=short&state=s1".to_string(), "code"),
            ("centurion://auth?state=s1".to_string(), "missing"),
        ] {
            assert_eq!(parse_auth_url(&url, "s1"), Err(why), "{url}");
        }
    }

    #[test]
    fn callback_is_single_use_and_forgeries_do_not_burn_the_login() {
        let p = PendingLogins::default();
        assert_eq!(p.accept("centurion://auth?code=AbCdEf0123456789&state=x"), Err("no_pending_login"));
        let (state, challenge) = p.start().unwrap();
        assert_eq!(challenge.len(), 43);
        assert_eq!(p.accept("centurion://auth?code=AbCdEf0123456789&state=forged"), Err("state"));
        let ok = format!("centurion://auth?code=AbCdEf0123456789&state={state}");
        let (code, verifier) = p.accept(&ok).unwrap();
        assert_eq!((code.as_str(), Pkce::from_verifier(verifier).challenge), ("AbCdEf0123456789", challenge));
        assert_eq!(p.accept(&ok), Err("no_pending_login")); // replay refused
    }
}
