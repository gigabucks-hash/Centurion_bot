//! **Single place** for wire vocabulary the desktop depends on: strategy-settings keys, exit-preset
//! ids, exit-rule ids and their UI labels, plus the v1.0 → v1.1 rename tables (contracts
//! `CHANGELOG.md` 1.1.0). A future rename is a change to this file only.

use crate::model::ExitReason;

/// Strategy settings keys (v1.1, `services/backend/config/strategy_settings.schema.json`).
pub mod settings {
    pub const BANKROLL_LAMPORTS: &str = "bankroll_lamports";
    pub const TICKET_LAMPORTS: &str = "ticket_lamports";
    pub const APPROVAL_MODE: &str = "approval_mode";
    /// Desktop's old `passMark` / v1.0 `pass_mark`.
    pub const SCORE_THRESHOLD: &str = "score_threshold";
    pub const VENUES: &str = "venues";
    pub const EXIT_PRESET: &str = "exit_preset";
    pub const EXIT_RULES: &str = "exit_rules";
    pub const PROFIT_TARGETS: &str = "profit_targets";
    pub const LOSS_GUARDS: &str = "loss_guards";
    pub const AT_GAIN_PCT: &str = "at_gain_pct";
    pub const SELL_PORTION_PCT: &str = "sell_portion_pct";
    pub const PEAK_TRAIL_PCT: &str = "peak_trail_pct";
    pub const MAX_LOSS_PCT: &str = "max_loss_pct";
}

/// Exit preset ids (v1.1).
pub mod preset {
    pub const MOMENTUM_TRAIL: &str = "momentum_trail";
}

/// Keys inside `position.updated.plan_state` (payload is `unknown` in the contract — schema question).
pub mod plan_state {
    pub const RULES: &str = "rules";
    pub const RULE_ID: &str = "id";
    pub const RULE_STATUS: &str = "status";
    pub const NEXT_RULE: &str = "next_rule";
}

/// v1.0 → v1.1 **key** renames (subset the desktop touches + desktop-internal camelCase), applied
/// recursively to inbound settings / payload JSON so a legacy producer still decodes.
pub const RENAMES: &[(&str, &str)] = &[
    ("pass_mark", "score_threshold"),
    ("passMark", "score_threshold"),
    ("tradeLamports", "ticket_lamports"),
    ("budgetLamports", "bankroll_lamports"),
    ("approvalMode", "approval_mode"),
    ("streams", "venues"),
    ("stream", "venue"),
    ("exitPlan", "exit_preset"),
    ("exits", "exit_rules"),
    ("takeProfits", "profit_targets"),
    ("stopLosses", "loss_guards"),
    ("gainPct", "at_gain_pct"),
    ("sellPct", "sell_portion_pct"),
    ("pullbackPct", "giveback_pct"),
    ("stopLossPct", "peak_trail_pct"),
    ("maxLossPct", "max_loss_pct"),
    // exit.triggered payload
    ("sell_pct", "sell_portion_pct"),
];

/// v1.0 → v1.1 **value** renames, applied only under these keys.
const VALUE_KEYS: &[&str] = &["exit_reason", "rule", "venue", "exit_preset", "id"];
pub const VALUE_RENAMES: &[(&str, &str)] = &[
    // exit reasons
    ("take_profit", "profit_target"),
    ("stop_loss", "loss_guard"),
    ("trailing_stop", "peak_trail"),
    ("time_out", "max_hold"),
    ("inactivity", "idle"),
    ("drain", "sell_pressure"),
    ("stall", "no_new_high"),
    ("rug", "rug_detected"),
    ("loss_stop", "drawdown_halt"),
    // venues
    ("bonding", "curve"),
    ("graduated", "amm"),
    // exit presets
    ("clip", "momentum_trail"),
    ("stake", "principal_recovery"),
    ("flip", "double_out"),
    ("ladder", "three_step_ladder"),
    ("trailingTp", "peak_giveback"),
    ("trail", "trail_stop_only"),
    ("scaleOut", "incremental_trim"),
    ("scalp", "fast_half"),
    ("take30", "fixed_thirty"),
    ("stepLock", "ratchet"),
    ("tighten", "tightening_trail"),
    ("doubling", "geometric_ladder"),
];

/// Recursively apply [`RENAMES`] / [`VALUE_RENAMES`] (idempotent on v1.1 input).
pub fn normalize(v: &mut serde_json::Value) {
    normalize_with(v, RENAMES, VALUE_RENAMES)
}

pub fn normalize_with(v: &mut serde_json::Value, keys: &[(&str, &str)], values: &[(&str, &str)]) {
    match v {
        serde_json::Value::Object(map) => {
            for (old, new) in keys {
                if let Some(x) = map.remove(*old) {
                    map.entry((*new).to_string()).or_insert(x);
                }
            }
            for (k, x) in map.iter_mut() {
                if VALUE_KEYS.contains(&k.as_str()) {
                    if let Some(s) = x.as_str() {
                        if let Some((_, n)) = values.iter().find(|(o, _)| *o == s) {
                            *x = serde_json::Value::String((*n).to_string());
                        }
                    }
                }
                normalize_with(x, keys, values);
            }
        }
        serde_json::Value::Array(xs) => xs.iter_mut().for_each(|x| normalize_with(x, keys, values)),
        _ => {}
    }
}

/// Wire exit-rule id → short Indonesian UI label (activity feed, quick-look, positions).
pub fn exit_label(r: ExitReason) -> &'static str {
    match r {
        ExitReason::SellFloor => "Sell floor",
        ExitReason::ProfitTarget => "Target profit",
        ExitReason::LossGuard => "Batas rugi",
        ExitReason::PeakTrail => "Trail dari puncak",
        ExitReason::MaxHold => "Batas waktu tahan",
        ExitReason::Idle => "Tidak aktif",
        ExitReason::SellPressure => "Tekanan jual",
        ExitReason::NoNewHigh => "Tanpa high baru",
        ExitReason::RugDetected => "Rug terdeteksi",
        ExitReason::DrawdownHalt => "Henti drawdown",
        ExitReason::Manual => "Jual manual",
        ExitReason::StrategyRetired => "Strategi dihentikan",
        ExitReason::PracticeReset => "Reset practice",
    }
}

/// Wire id string of an exit rule (for plan_state lookups / logs).
pub fn exit_id(r: ExitReason) -> String {
    serde_json::to_value(r).ok().and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rename_tables_map_v10_to_v11_recursively() {
        let mut v = serde_json::json!({"passMark": 70, "exits": {"takeProfits": [{"gainPct": 100, "sellPct": 50}]},
            "exit_reason": "trailing_stop", "stream": "graduated", "exitPlan": "ladder", "keep": "take_profit"});
        normalize(&mut v);
        assert_eq!(v, serde_json::json!({"score_threshold": 70, "exit_rules": {"profit_targets": [{"at_gain_pct": 100, "sell_portion_pct": 50}]},
            "exit_reason": "peak_trail", "venue": "amm", "exit_preset": "three_step_ladder", "keep": "take_profit"}));
        let mut w = v.clone();
        normalize(&mut w);
        assert_eq!(w, v, "idempotent on v1.1 input");
        assert_eq!(exit_id(ExitReason::PeakTrail), "peak_trail");
    }
}
