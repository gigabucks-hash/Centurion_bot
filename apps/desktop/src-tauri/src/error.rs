use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("signal not found or not pending")]
    SignalNotPending,
    #[error("no open position")]
    NoPosition,
    #[error("sell quote expired or unknown — request a new one")]
    QuoteInvalid,
    /// WF-20: coin cannot be traded in Practice (e.g. no SOL quote pair). Approve and sell are
    /// refused locally before anything reaches the backend. Message starts with the registry code.
    #[error("{0}: coin tidak bisa ditradingkan (tanpa pair SOL) — approve/sell diblokir")]
    NotTradeable(String),
    #[error("invalid argument: {0}")]
    Invalid(String),
    #[error("{0}")]
    Api(String),
    #[error("shortcut error: {0}")]
    Shortcut(String),
    #[error("{0}")]
    Shell(String),
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        let raw = e.to_string();
        let scrubbed = raw
            .replace("Tauri", "Centurion Trade")
            .replace("tauri", "Centurion Trade");
        AppError::Shell(scrubbed)
    }
}

// Commands return errors to JS as plain strings (no internal details beyond the message).
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl From<crate::backend::ApiFailure> for AppError {
    fn from(e: crate::backend::ApiFailure) -> Self {
        AppError::Api(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
