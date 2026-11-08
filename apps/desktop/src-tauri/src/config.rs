//! Persisted connection settings for the **paper** API.
//!
//! The installed app reaches the HTTP backend through `CENTURION_BACKEND` in the environment today,
//! which a user who double-clicks the installer can never set. This module stores the same values in
//! `connection.json` under the OS config dir, so Settings can point the app at a paper API and a web
//! login page without a terminal.
//!
//! Precedence (unchanged for dev launchers): a non-empty `CENTURION_BACKEND` environment variable
//! still wins; otherwise the saved file; otherwise the in-process mock.
//!
//! Validation mirrors the transport (`backend::http::validate_base`) and the login page rule
//! (`auth::login_url`): https anywhere, plain http only to loopback, no path on the API base.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

/// Bundle identifier from `tauri.conf.json`; asserted by a test so the two never drift.
pub const APP_ID: &str = "com.centuriontrade.app";
pub const FILE: &str = "connection.json";
/// Dev-launcher overrides. A set backend env var always wins over the saved file.
pub const ENV_BACKEND: &str = "CENTURION_BACKEND";
pub const ENV_LOGIN_URL: &str = "CENTURION_LOGIN_URL";

/// Saved values. `None` = use the mock (no HTTP backend) / the built-in login page default.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Connection {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub login_url: Option<String>,
}

/// Managed state: the values in effect for this run, plus the reason a saved file was ignored.
pub struct ConnectionState {
    pub conn: Mutex<Connection>,
    pub error: Mutex<Option<String>>,
}

impl ConnectionState {
    pub fn new(conn: Connection, error: Option<String>) -> Self {
        Self {
            conn: Mutex::new(conn),
            error: Mutex::new(error),
        }
    }
}

fn is_loopback(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "[::1]")
}

fn scheme_and_rest(url: &str) -> Option<(bool, &str)> {
    if let Some(r) = url.strip_prefix("https://") {
        return Some((true, r));
    }
    url.strip_prefix("http://").map(|r| (false, r))
}

fn host_of(rest: &str) -> &str {
    let host_port = rest.split(['/', '?', '#']).next().unwrap_or("");
    host_port
        .rsplit_once(':')
        .map(|(h, p)| {
            if p.chars().all(|c| c.is_ascii_digit()) {
                h
            } else {
                host_port
            }
        })
        .unwrap_or(host_port)
}

/// Same rules as `backend::http::validate_base`; returns the normalised base (no trailing slash).
pub fn validate_backend(raw: &str) -> Result<Option<String>, String> {
    let v = raw.trim().trim_end_matches('/');
    if v.is_empty() {
        return Ok(None);
    }
    let Some((tls, rest)) = scheme_and_rest(v) else {
        return Err("backend_scheme".into());
    };
    let host = host_of(rest);
    if host.is_empty() || v.len() > 200 || rest.contains('@') || rest.contains(char::is_whitespace)
    {
        return Err("backend_url".into());
    }
    if !tls && !is_loopback(host) {
        return Err("backend_loopback".into());
    }
    if rest.contains('/') || rest.contains('?') || rest.contains('#') {
        return Err("backend_path".into());
    }
    Ok(Some(v.to_owned()))
}

/// Same rules as `auth::login_url`: https anywhere, plain http only to loopback, no fragment.
pub fn validate_login_url(raw: &str) -> Result<Option<String>, String> {
    let v = raw.trim();
    if v.is_empty() {
        return Ok(None);
    }
    let Some((tls, rest)) = scheme_and_rest(v) else {
        return Err("login_scheme".into());
    };
    let host = host_of(rest);
    if host.is_empty() || v.len() > 300 || v.contains(char::is_whitespace) || v.contains('#') {
        return Err("login_url".into());
    }
    if !tls && !is_loopback(host) {
        return Err("login_loopback".into());
    }
    Ok(Some(v.to_owned()))
}

impl Connection {
    /// Validate both fields, normalising them. An error key (not prose) so the UI can localise it.
    pub fn validated(self) -> Result<Self, String> {
        Ok(Self {
            backend: validate_backend(self.backend.as_deref().unwrap_or(""))?,
            login_url: validate_login_url(self.login_url.as_deref().unwrap_or(""))?,
        })
    }

    pub fn login_page(&self) -> Option<&str> {
        self.login_url.as_deref()
    }
}

/// `{config dir}/{APP_ID}/connection.json` — the same file `app.path().app_config_dir()` names.
pub fn path() -> Option<PathBuf> {
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    }?;
    Some(base.join(APP_ID).join(FILE))
}

/// Read the saved file. A missing file is the normal first-run state (mock). A malformed file is
/// reported, never fatal: the app still starts on the mock.
pub fn load() -> (Connection, Option<String>) {
    let Some(p) = path() else {
        return (Connection::default(), None);
    };
    let raw = match std::fs::read_to_string(&p) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return (Connection::default(), None),
        Err(e) => {
            return (
                Connection::default(),
                Some(format!("read {}: {e}", p.display())),
            )
        }
    };
    match serde_json::from_str::<Connection>(&raw) {
        Ok(c) => match c.validated() {
            Ok(c) => (c, None),
            Err(k) => (Connection::default(), Some(format!("{}: {k}", p.display()))),
        },
        Err(e) => (
            Connection::default(),
            Some(format!("parse {}: {e}", p.display())),
        ),
    }
}

/// Write the file atomically (temp + rename) so a crash never leaves a half-written config.
pub fn save(conn: &Connection) -> Result<(), String> {
    let p = path().ok_or_else(|| "no config directory".to_string())?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    }
    let body = serde_json::to_vec_pretty(conn).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, body).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| format!("replace {}: {e}", p.display()))?;
    }
    std::fs::rename(&tmp, &p).map_err(|e| format!("rename {}: {e}", p.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_id_matches_the_tauri_bundle_identifier() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"].as_str(), Some(APP_ID));
    }

    #[test]
    fn backend_accepts_https_and_loopback_http() {
        assert_eq!(
            validate_backend("https://paper.example.com/").unwrap(),
            Some("https://paper.example.com".into())
        );
        assert_eq!(
            validate_backend(" http://127.0.0.1:8080 ").unwrap(),
            Some("http://127.0.0.1:8080".into())
        );
        assert_eq!(
            validate_backend("http://localhost:8080").unwrap(),
            Some("http://localhost:8080".into())
        );
        assert_eq!(validate_backend("   ").unwrap(), None);
    }

    #[test]
    fn backend_rejects_plain_http_off_loopback_and_paths() {
        assert_eq!(
            validate_backend("http://paper.example.com").unwrap_err(),
            "backend_loopback"
        );
        assert_eq!(
            validate_backend("https://paper.example.com/v1").unwrap_err(),
            "backend_path"
        );
        assert_eq!(
            validate_backend("paper.example.com").unwrap_err(),
            "backend_scheme"
        );
        assert_eq!(
            validate_backend("http://user:pw@127.0.0.1").unwrap_err(),
            "backend_url"
        );
        assert_eq!(
            validate_backend(&format!("https://{}", "a".repeat(260))).unwrap_err(),
            "backend_url"
        );
    }

    #[test]
    fn login_url_accepts_https_and_loopback_http_with_path() {
        assert_eq!(
            validate_login_url("https://app.example.com/auth/desktop").unwrap(),
            Some("https://app.example.com/auth/desktop".into())
        );
        assert_eq!(
            validate_login_url("http://localhost:3100/auth/desktop").unwrap(),
            Some("http://localhost:3100/auth/desktop".into())
        );
        assert_eq!(validate_login_url("").unwrap(), None);
    }

    #[test]
    fn login_url_rejects_remote_http_and_fragments() {
        assert_eq!(
            validate_login_url("http://app.example.com/auth/desktop").unwrap_err(),
            "login_loopback"
        );
        assert_eq!(
            validate_login_url("https://app.example.com/auth#x").unwrap_err(),
            "login_url"
        );
        assert_eq!(validate_login_url("ftp://x").unwrap_err(), "login_scheme");
    }

    #[test]
    fn validated_normalises_both_fields() {
        let c = Connection {
            backend: Some(" http://localhost:8080/ ".into()),
            login_url: Some(" http://localhost:3100/auth/desktop ".into()),
        }
        .validated()
        .unwrap();
        assert_eq!(c.backend.as_deref(), Some("http://localhost:8080"));
        assert_eq!(c.login_page(), Some("http://localhost:3100/auth/desktop"));
        assert_eq!(
            Connection::default().validated().unwrap(),
            Connection::default()
        );
    }

    #[test]
    fn saved_file_round_trips_and_ignores_unknown_keys() {
        let c = Connection {
            backend: Some("https://paper.example.com".into()),
            login_url: None,
        };
        let s = serde_json::to_string(&c).unwrap();
        assert!(
            !s.contains("login_url"),
            "None fields stay out of the file: {s}"
        );
        assert_eq!(serde_json::from_str::<Connection>(&s).unwrap(), c);
        assert!(
            serde_json::from_str::<Connection>(r#"{"backend":"https://x","extra":1}"#).is_err()
        );
        assert_eq!(
            serde_json::from_str::<Connection>("{}").unwrap(),
            Connection::default()
        );
    }
}
