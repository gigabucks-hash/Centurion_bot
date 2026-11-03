//! Skip chip → wire `reject_reason` (+ `reason` detail) and `reject_reason` → copy key, from
//! `@centurion/i18n` 0.4.5 `reject_reasons.map.json` (UX-owned, read-only, embedded at build time).
//! It replaces the desktop's former hand mapping in `commands::skip_reason`.
use crate::model::ApprovalRejectReason;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const REJECT_REASONS_MAP_JSON: &str = include_str!("../../../../packages/i18n/reject_reasons.map.json");

#[derive(Debug, Clone, Deserialize)]
pub struct SkipChip {
    #[allow(dead_code)] // the UI reads the label from the same JSON; checked by the test
    pub label_key: String,
    pub reject_reason: ApprovalRejectReason,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RejectMap {
    /// wire code → catalog key (`reject_reason.*`).
    pub wire: HashMap<String, String>,
    pub skip_chips: HashMap<String, SkipChip>,
    pub default: ApprovalRejectReason,
}

pub fn map() -> &'static RejectMap {
    static M: OnceLock<RejectMap> = OnceLock::new();
    M.get_or_init(|| serde_json::from_str(REJECT_REASONS_MAP_JSON).expect("packages/i18n/reject_reasons.map.json is valid"))
}

/// Wire spelling of a reject reason (`user_declined`, …).
pub fn wire_code(r: ApprovalRejectReason) -> String {
    serde_json::to_value(r).ok().and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default()
}

/// Catalog key for a reject reason received on the wire (activity / audit).
pub fn copy_key(r: ApprovalRejectReason) -> Option<&'static str> {
    map().wire.get(&wire_code(r)).map(String::as_str)
}

/// The skip chip the desktop preselects: `not_tradeable` for a WF-20 card. A plain Skip (no chip)
/// sends the map's `default`.
pub fn skip(tradeable: bool) -> (ApprovalRejectReason, Option<String>) {
    if tradeable {
        return (map().default, None);
    }
    let c = &map().skip_chips["not_tradeable"];
    (c.reject_reason, c.reason.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::APPROVAL_REJECT_REASONS;

    #[test]
    fn reject_map_matches_contracts_enum_and_catalog() {
        let m = map();
        let mut wire: Vec<_> = m.wire.keys().cloned().collect();
        wire.sort();
        let mut enm: Vec<_> = APPROVAL_REJECT_REASONS.iter().map(|r| wire_code(*r)).collect();
        enm.sort();
        assert_eq!(wire, enm, "map.wire == contracts ApprovalRejectReason");
        let cat: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/i18n/id.json")).unwrap();
        let has = |k: &str| k.split('.').try_fold(&cat, |v, p| v.get(p)).is_some_and(|v| v.is_string());
        for (code, key) in &m.wire {
            assert!(has(key), "{code} → {key} in id.json");
        }
        for (name, c) in &m.skip_chips {
            assert!(has(&c.label_key), "chip {name} label {}", c.label_key);
        }
        assert_eq!(skip(false), (ApprovalRejectReason::NotTradeable, None));
        assert_eq!(skip(true), (ApprovalRejectReason::UserDeclined, None));
        assert_eq!(copy_key(ApprovalRejectReason::PriceMoved), Some("reject_reason.price_moved"));
    }
}
