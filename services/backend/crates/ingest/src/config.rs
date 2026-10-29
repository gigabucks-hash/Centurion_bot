use std::fmt;

/// A secret read from the environment. Never printed.
#[derive(Clone, Default)]
pub struct Secret(String);

impl Secret {
    pub fn expose(&self) -> &str {
        &self.0
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}
impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(if self.0.is_empty() {
            "Secret(<unset>)"
        } else {
            "Secret(***)"
        })
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("{0} must be 'paper' until Phase 7 is approved (got '{1}')")]
    LiveModeRefused(&'static str, String),
    #[error("invalid {0}: {1}")]
    Invalid(&'static str, String),
}

/// Runtime configuration, from environment variables only (see `.env.example`).
#[derive(Debug, Clone)]
pub struct Config {
    pub trading_mode: String,
    pub workspace_id: String,
    pub strategy_id: String,
    pub screener_rules_path: String,
    pub yellowstone_grpc_url: Option<String>,
    pub yellowstone_x_token: Secret,
    pub helius_api_key: Secret,
    pub pumpportal_ws_url: String,
    pub database_url: Secret,
    pub channel_capacity: usize,
    pub paper_demo_buy_sol: f64,
}

fn var(k: &str) -> Option<String> {
    std::env::var(k).ok().filter(|v| !v.trim().is_empty())
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(var)
    }

    /// Testable constructor.
    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        // Refuse to start unless TRADING_MODE is explicitly "paper" (= practice mode).
        let trading_mode = get("TRADING_MODE").unwrap_or_default();
        if trading_mode != "paper" {
            return Err(ConfigError::LiveModeRefused("TRADING_MODE", trading_mode));
        }
        let parse_num = |k: &'static str, d: &str| -> Result<f64, ConfigError> {
            let s = get(k).unwrap_or_else(|| d.into());
            s.parse::<f64>().map_err(|_| ConfigError::Invalid(k, s))
        };
        let cap = parse_num("INGEST_CHANNEL_CAPACITY", "10000")?;
        let demo = parse_num("PAPER_DEMO_BUY_SOL", "0")?;
        if !(0.0..=10.0).contains(&demo) {
            return Err(ConfigError::Invalid("PAPER_DEMO_BUY_SOL", demo.to_string()));
        }
        Ok(Self {
            trading_mode,
            workspace_id: get("WORKSPACE_ID").unwrap_or_else(|| "local-dev".into()),
            strategy_id: get("STRATEGY_ID").unwrap_or_else(|| "example".into()),
            screener_rules_path: get("SCREENER_RULES_PATH")
                .unwrap_or_else(|| "config/screener.example.json".into()),
            yellowstone_grpc_url: get("YELLOWSTONE_GRPC_URL"),
            yellowstone_x_token: Secret(get("YELLOWSTONE_X_TOKEN").unwrap_or_default()),
            helius_api_key: Secret(get("HELIUS_API_KEY").unwrap_or_default()),
            pumpportal_ws_url: get("PUMPPORTAL_WS_URL")
                .unwrap_or_else(|| "wss://pumpportal.fun/api/data".into()),
            database_url: Secret(get("DATABASE_URL").unwrap_or_default()),
            channel_capacity: cap.max(1.0) as usize,
            paper_demo_buy_sol: demo,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn lookup(m: HashMap<&'static str, &'static str>) -> impl Fn(&str) -> Option<String> {
        move |k| m.get(k).map(|v| v.to_string())
    }

    #[test]
    fn paper_mode_and_redacts_secrets() {
        let c = Config::from_lookup(lookup(HashMap::from([
            ("TRADING_MODE", "paper"),
            ("HELIUS_API_KEY", "abc123"),
        ])))
        .expect("cfg");
        assert_eq!(c.trading_mode, "paper");
        let dbg = format!("{c:?}");
        assert!(!dbg.contains("abc123"));
        assert!(dbg.contains("Secret(***)"));
    }

    #[test]
    fn refuses_live_or_missing_mode() {
        let r = Config::from_lookup(lookup(HashMap::from([("TRADING_MODE", "live")])));
        assert!(matches!(r, Err(ConfigError::LiveModeRefused(..))));
        let r = Config::from_lookup(lookup(HashMap::new()));
        assert!(
            matches!(r, Err(ConfigError::LiveModeRefused(..))),
            "unset TRADING_MODE must refuse"
        );
    }
}
