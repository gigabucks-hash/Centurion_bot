use std::fmt;

/// A secret read from the environment. Never printed.
#[derive(Clone, Default)]
pub struct Secret(String);

impl Secret {
    #[cfg(test)]
    pub fn from_test(s: &str) -> Self {
        Self(s.to_string())
    }
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
    /// Helius WebSocket / RPC base URLs (no key; the key is appended from `HELIUS_API_KEY`).
    pub helius_ws_url: String,
    pub helius_rpc_url: String,
    /// `INGEST_SOURCES`, comma separated: `helius`, `pumpportal`, `yellowstone`.
    pub sources: Vec<String>,
    pub pumpportal_ws_url: String,
    pub database_url: Secret,
    pub channel_capacity: usize,
    pub paper_demo_buy_sol: f64,
    /// Marks to the API SSE (pg_notify): SOL/USD reference (`MARKS_SOL_USD`; unset = marks off),
    /// per-mint throttle (`MARKS_MIN_INTERVAL_MS`, default 1000) and channel (`SSE_MARKS_CHANNEL`).
    pub marks_sol_usd: Option<f64>,
    pub marks_min_interval_ms: i64,
    pub marks_channel: String,
    /// Gap/reconnect JSON-RPC backfill (`BACKFILL_ENABLED`, `BACKFILL_MAX_SLOTS`, `BACKFILL_MAX_SIGNATURES`,
    /// `BACKFILL_MAX_PAGES`, `BACKFILL_RPS`, `BACKFILL_BURST`).
    pub backfill: crate::backfill::BackfillConfig,
    /// Bytes/day meter: DB flush and log interval (`INGEST_METER_FLUSH_S`, default 60; summary log every 15 min).
    pub meter_flush_s: u64,
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
        let helius_api_key = Secret(get("HELIUS_API_KEY").unwrap_or_default());
        let sources: Vec<String> = match get("INGEST_SOURCES") {
            Some(s) => s
                .split(',')
                .map(|x| x.trim().to_lowercase())
                .filter(|x| !x.is_empty())
                .collect(),
            None if !helius_api_key.is_empty() => vec!["helius".into()],
            None => vec!["pumpportal".into()],
        };
        for s in &sources {
            if !matches!(s.as_str(), "helius" | "pumpportal" | "yellowstone") {
                return Err(ConfigError::Invalid("INGEST_SOURCES", s.clone()));
            }
        }
        for (k, v) in [
            ("HELIUS_WS_URL", get("HELIUS_WS_URL")),
            ("HELIUS_RPC_URL", get("HELIUS_RPC_URL")),
        ] {
            if v.as_deref().is_some_and(|u| u.contains("api-key")) {
                return Err(ConfigError::Invalid(
                    k,
                    "must not contain the key; set HELIUS_API_KEY".into(),
                ));
            }
        }
        let marks_sol_usd = match get("MARKS_SOL_USD") {
            None => None,
            Some(s) => match s.parse::<f64>() {
                Ok(v) if v.is_finite() && v > 0.0 && v < 1_000_000.0 => Some(v),
                _ => return Err(ConfigError::Invalid("MARKS_SOL_USD", s)),
            },
        };
        let marks_min_interval_ms = parse_num("MARKS_MIN_INTERVAL_MS", "1000")?;
        if !(0.0..=60_000.0).contains(&marks_min_interval_ms) {
            return Err(ConfigError::Invalid(
                "MARKS_MIN_INTERVAL_MS",
                marks_min_interval_ms.to_string(),
            ));
        }
        let marks_channel = get("SSE_MARKS_CHANNEL").unwrap_or_else(|| "sentra_marks".into());
        if !crate::marks::valid_channel(&marks_channel) {
            return Err(ConfigError::Invalid("SSE_MARKS_CHANNEL", marks_channel));
        }
        let bounded = |k: &'static str, d: &str, lo: f64, hi: f64| -> Result<f64, ConfigError> {
            let v = parse_num(k, d)?;
            if !(lo..=hi).contains(&v) || !v.is_finite() {
                return Err(ConfigError::Invalid(k, v.to_string()));
            }
            Ok(v)
        };
        let backfill = crate::backfill::BackfillConfig {
            enabled: get("BACKFILL_ENABLED").is_none_or(|v| v.trim() != "false"),
            max_slots: bounded("BACKFILL_MAX_SLOTS", "1500", 1.0, 216_000.0)? as u64,
            max_signatures: bounded("BACKFILL_MAX_SIGNATURES", "2000", 1.0, 50_000.0)? as usize,
            max_pages: bounded("BACKFILL_MAX_PAGES", "5", 1.0, 100.0)? as usize,
            page_limit: 1000,
            rps: bounded("BACKFILL_RPS", "5", 0.1, 100.0)?,
            burst: bounded("BACKFILL_BURST", "10", 1.0, 1000.0)?,
        };
        let meter_flush_s = bounded("INGEST_METER_FLUSH_S", "60", 5.0, 3600.0)? as u64;
        Ok(Self {
            backfill,
            meter_flush_s,
            trading_mode,
            workspace_id: get("WORKSPACE_ID").unwrap_or_else(|| "local-dev".into()),
            strategy_id: get("STRATEGY_ID").unwrap_or_else(|| "example".into()),
            screener_rules_path: get("SCREENER_RULES_PATH")
                .unwrap_or_else(|| "config/screener.example.json".into()),
            yellowstone_grpc_url: get("YELLOWSTONE_GRPC_URL"),
            yellowstone_x_token: Secret(get("YELLOWSTONE_X_TOKEN").unwrap_or_default()),
            helius_api_key,
            helius_ws_url: get("HELIUS_WS_URL")
                .unwrap_or_else(|| crate::source::helius::DEFAULT_WS_BASE.into()),
            helius_rpc_url: get("HELIUS_RPC_URL")
                .unwrap_or_else(|| crate::source::helius::DEFAULT_RPC_BASE.into()),
            sources,
            pumpportal_ws_url: get("PUMPPORTAL_WS_URL")
                .unwrap_or_else(|| "wss://pumpportal.fun/api/data".into()),
            database_url: Secret(get("DATABASE_URL").unwrap_or_default()),
            channel_capacity: cap.max(1.0) as usize,
            paper_demo_buy_sol: demo,
            marks_sol_usd,
            marks_min_interval_ms: marks_min_interval_ms as i64,
            marks_channel,
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
    fn source_selection() {
        let c = Config::from_lookup(lookup(HashMap::from([
            ("TRADING_MODE", "paper"),
            ("HELIUS_API_KEY", "k"),
        ])))
        .expect("cfg");
        assert_eq!(c.sources, vec!["helius"]);
        let c =
            Config::from_lookup(lookup(HashMap::from([("TRADING_MODE", "paper")]))).expect("cfg");
        assert_eq!(c.sources, vec!["pumpportal"]);
        let r = Config::from_lookup(lookup(HashMap::from([
            ("TRADING_MODE", "paper"),
            ("INGEST_SOURCES", "helius,foo"),
        ])));
        assert!(matches!(r, Err(ConfigError::Invalid("INGEST_SOURCES", _))));
        let r = Config::from_lookup(lookup(HashMap::from([
            ("TRADING_MODE", "paper"),
            ("HELIUS_WS_URL", "wss://x/?api-key=leak"),
        ])));
        assert!(matches!(r, Err(ConfigError::Invalid("HELIUS_WS_URL", _))));
    }

    #[test]
    fn backfill_bounds_from_env() {
        let c =
            Config::from_lookup(lookup(HashMap::from([("TRADING_MODE", "paper")]))).expect("cfg");
        assert_eq!(c.backfill, crate::backfill::BackfillConfig::default());
        assert_eq!(c.meter_flush_s, 60);
        let c = Config::from_lookup(lookup(HashMap::from([
            ("TRADING_MODE", "paper"),
            ("BACKFILL_ENABLED", "false"),
            ("BACKFILL_RPS", "2.5"),
            ("BACKFILL_MAX_SLOTS", "300"),
        ])))
        .expect("cfg");
        assert!(!c.backfill.enabled);
        assert_eq!(c.backfill.rps, 2.5);
        assert_eq!(c.backfill.max_slots, 300);
        let r = Config::from_lookup(lookup(HashMap::from([
            ("TRADING_MODE", "paper"),
            ("BACKFILL_RPS", "0"),
        ])));
        assert!(matches!(r, Err(ConfigError::Invalid("BACKFILL_RPS", _))));
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
