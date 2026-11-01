//! Error-code → copy mapping from `@sentra/i18n` 0.4.6 `errors.map.json` (v6) (UX-owned, read-only,
//! embedded at build time). It replaces the desktop's former hand mapping: each of the 58
//! `errors.json` v4 codes maps to `{key, source: copy|fallback, kind, http, retryable}`, and an
//! unknown code maps to `unknown` (`error.code.internal`). The UI resolves the key in the
//! catalog and falls back to `errors.json` `messages.id|en` (frontend `src/i18n/index.ts`).
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const ERRORS_MAP_JSON: &str = include_str!("../../../../packages/i18n/errors.map.json");

/// Full row as published (`source`/`http`/`retryable` are checked by the contract test).
#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct ErrorMapEntry {
    pub key: String,
    pub source: String,
    pub kind: String,
    pub http: u16,
    pub retryable: bool,
    /// 0.4.6 (additive): `pending` / `warning` (default error), plus optional CTA / inline / title keys.
    #[serde(default)]
    pub tone: Option<String>,
    #[serde(default)]
    pub cta_key: Option<String>,
    #[serde(default)]
    pub inline_key: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct ErrorMap {
    pub errors_json_version: u32,
    pub unknown: String,
    pub codes: HashMap<String, ErrorMapEntry>,
}

pub fn map() -> &'static ErrorMap {
    static M: OnceLock<ErrorMap> = OnceLock::new();
    M.get_or_init(|| serde_json::from_str(ERRORS_MAP_JSON).expect("packages/i18n/errors.map.json is valid"))
}

/// Legacy spellings still accepted on input (a pre-1.1.2 producer). Output is always canonical.
const LEGACY: &[(&str, &str)] = &[("PAPER_CASH_INSUFFICIENT", "PRACTICE_CASH_INSUFFICIENT")];

/// Canonical (1.1.2) spelling of an error / notice code.
pub fn canonical(code: &str) -> &str {
    LEGACY.iter().find(|(o, _)| *o == code).map(|(_, n)| *n).unwrap_or(code)
}

pub fn entry(code: &str) -> Option<&'static ErrorMapEntry> {
    map().codes.get(canonical(code))
}

/// i18n key for an error / notice code (`error.code.*` or a fallback such as `order.fail_reason.*`).
pub fn i18n_key(code: &str) -> &'static str {
    entry(code).map(|e| e.key.as_str()).unwrap_or(map().unknown.as_str())
}

/// The full `order.failed` `reason_code` set in contracts 1.1.2 (i18n 0.4.3 has a copy for each).
pub const ORDER_FAIL_REASONS: [&str; 8] = [
    "SLIPPAGE_EXCEEDED",
    "INSUFFICIENT_PRACTICE_BALANCE",
    "GUARD_FAILED",
    "UNSUPPORTED_QUOTE_MINT",
    "POOL_STALE",
    "POSITION_ALREADY_CLOSED",
    "VALIDATION_FAILED",
    "MODE_NOT_ALLOWED",
];

/// i18n key for an `order.failed` reason: `order.fail_reason.<code>` for the 8 known codes, else `…unknown`.
pub fn order_fail_key(code: &str) -> String {
    let c = canonical(code);
    if ORDER_FAIL_REASONS.contains(&c) {
        format!("order.fail_reason.{}", c.to_ascii_lowercase())
    } else {
        "order.fail_reason.unknown".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_map_covers_and_resolves() {
        let m = map();
        // i18n 0.4.6: errors.json v6 (58 codes, + QUOTE_MISSING_OR_STALE); GUARD_WEAKEN is a pending state.
        assert_eq!(m.errors_json_version, 6);
        assert_eq!(m.codes.len(), 58);
        assert_eq!(i18n_key("QUOTE_MISSING_OR_STALE"), "error.code.quote_missing_or_stale");
        assert_eq!(entry("QUOTE_MISSING_OR_STALE").unwrap().cta_key.as_deref(), Some("review.quote.refresh"));
        assert_eq!(entry("GUARD_WEAKEN_REQUIRES_APPROVAL").unwrap().tone.as_deref(), Some("pending"));
        assert_eq!(i18n_key("GUARD_WEAKEN_REQUIRES_APPROVAL"), "error.code.guard_weaken_requires_approval");
        assert_eq!(i18n_key("VERSION_CONFLICT"), "error.code.version_conflict");
        assert_eq!(i18n_key("IDEMPOTENCY_KEY_REUSED"), "error.code.internal");
        assert_eq!(i18n_key("PRECONDITION_REQUIRED"), "error.code.version_conflict");
        assert_eq!(i18n_key("UNSUPPORTED_QUOTE_MINT"), "order.fail_reason.unsupported_quote_mint");
        assert_eq!(i18n_key("PAPER_CASH_INSUFFICIENT"), "error.code.practice_cash_insufficient");
        assert_eq!(i18n_key("NOPE_NOT_A_CODE"), "error.code.internal");
        assert_eq!(order_fail_key("MODE_NOT_ALLOWED"), "order.fail_reason.mode_not_allowed");
        assert_eq!(order_fail_key("SOMETHING_NEW"), "order.fail_reason.unknown");
    }
}
