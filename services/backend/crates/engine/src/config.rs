//! Engine configuration from the process environment. Secrets are never logged: the Helius key
//! is held in [`ingest::config::Secret`] and only its presence is reported.
use ingest::config::Secret;
use std::path::PathBuf;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum ConfigError {
    #[error("TRADING_MODE must be 'paper' for the P1 engine (got '{0}')")]
    NotPaper(String),
    #[error("REAL_TRADING_ENABLED must not be set to true in P1")]
    RealRequested,
    #[error("invalid {0}: {1}")]
    Invalid(&'static str, String),
}

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub trading_mode: String,
    pub pumpportal_ws_url: String,
    pub helius_ws_url: String,
    pub helius_rpc_url: String,
    pub helius_api_key: Secret,
    /// Seconds without a frame before a feed counts as stalled (alert + failover).
    pub stall_s: u64,
    /// Seconds the primary must be healthy before the fallback is stopped again.
    pub fallback_release_s: u64,
    pub helius_fallback: bool,
    pub rpc_daily_credit_cap: u64,
    pub http_addr: String,
    pub data_dir: PathBuf,
    pub strategies_dir: PathBuf,
    pub report_dir: PathBuf,
    pub channel_capacity: usize,
}

fn env_or(k: &str, d: &str) -> String {
    std::env::var(k)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| d.to_string())
}

fn env_num<T: std::str::FromStr>(k: &'static str, d: T) -> Result<T, ConfigError> {
    match std::env::var(k).ok().filter(|v| !v.trim().is_empty()) {
        None => Ok(d),
        Some(v) => v.trim().parse().map_err(|_| ConfigError::Invalid(k, v)),
    }
}

/// Paper-only gate, separated for unit tests.
pub fn check_paper(mode: &str, real_flag: Option<&str>) -> Result<(), ConfigError> {
    if mode != "paper" {
        return Err(ConfigError::NotPaper(mode.to_string()));
    }
    if matches!(real_flag.map(|s| s.trim().to_ascii_lowercase()), Some(ref v) if v == "true" || v == "1")
    {
        return Err(ConfigError::RealRequested);
    }
    Ok(())
}

impl EngineConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let trading_mode = env_or("TRADING_MODE", "paper");
        check_paper(
            &trading_mode,
            std::env::var("REAL_TRADING_ENABLED").ok().as_deref(),
        )?;
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        let http_addr = env_or("ENGINE_HTTP_ADDR", "127.0.0.1:8790");
        // the status view has an admin kill switch for the watchdog drill: loopback only
        if !(http_addr.starts_with("127.0.0.1:")
            || http_addr.starts_with("[::1]:")
            || http_addr.starts_with("localhost:"))
        {
            return Err(ConfigError::Invalid(
                "ENGINE_HTTP_ADDR",
                "must be a loopback address".into(),
            ));
        }
        Ok(Self {
            trading_mode,
            pumpportal_ws_url: env_or("PUMPPORTAL_WS_URL", "wss://pumpportal.fun/api/data"),
            helius_ws_url: env_or("HELIUS_WS_URL", "wss://mainnet.helius-rpc.com/"),
            helius_rpc_url: env_or("HELIUS_RPC_URL", "https://mainnet.helius-rpc.com/"),
            helius_api_key: Secret::from_env_value(
                std::env::var("HELIUS_API_KEY").unwrap_or_default(),
            ),
            stall_s: env_num("ENGINE_FEED_STALL_S", 60)?,
            fallback_release_s: env_num("ENGINE_FALLBACK_RELEASE_S", 120)?,
            helius_fallback: env_or("ENGINE_HELIUS_FALLBACK", "true") == "true",
            rpc_daily_credit_cap: env_num("ENGINE_RPC_DAILY_CREDIT_CAP", 25_000)?,
            http_addr,
            data_dir: PathBuf::from(env_or(
                "ENGINE_DATA_DIR",
                &format!("{home}/.local/state/centurion-engine"),
            )),
            strategies_dir: PathBuf::from(env_or("ENGINE_STRATEGIES_DIR", "config/strategies")),
            report_dir: PathBuf::from(env_or("ENGINE_REPORT_DIR", "/shared/centurion")),
            channel_capacity: env_num("ENGINE_CHANNEL_CAPACITY", 4096)?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paper_only() {
        assert!(check_paper("paper", None).is_ok());
        assert!(check_paper("paper", Some("false")).is_ok());
        assert_eq!(
            check_paper("real", None),
            Err(ConfigError::NotPaper("real".into()))
        );
        assert_eq!(
            check_paper("live", None),
            Err(ConfigError::NotPaper("live".into()))
        );
        assert_eq!(
            check_paper("paper", Some("TRUE")),
            Err(ConfigError::RealRequested)
        );
        assert_eq!(
            check_paper("paper", Some("1")),
            Err(ConfigError::RealRequested)
        );
    }
}
