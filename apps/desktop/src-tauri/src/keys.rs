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
    /// Trailing stop from the PEAK (0 = off, else 5–49).
    pub const PEAK_TRAIL_PCT: &str = "peak_trail_pct";
    /// Hard stop from ENTRY (1.1.2 restored; v1.0 `stopLossPct`; 0 = off, else 5–49).
    pub const STOP_LOSS_PCT: &str = "stop_loss_pct";
    /// `exit_rules.loss_guards[]` item: sell once price is `at_loss_pct` below entry.
    pub const AT_LOSS_PCT: &str = "at_loss_pct";
}

/// Exit preset ids (v1.1).
pub mod preset {
    pub const MOMENTUM_TRAIL: &str = "momentum_trail";
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
    // 1.1.2 fix: v1.0 stopLossPct was a stop from ENTRY → stop_loss_pct (not peak_trail_pct).
    ("stopLossPct", "stop_loss_pct"),
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

/// Canonical (1.1.2) spelling of an error / notice code (see [`crate::errmap`]).
pub fn error_code(code: &str) -> &str {
    crate::errmap::canonical(code)
}

/// `errors.json` v4 `kind`: how the desktop surfaces a code. `Skip` = product limitation, shown
/// neutral (never loss-red), e.g. a coin without a SOL pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodeKind {
    Error,
    Notice,
    Skip,
}
/// `kind` from i18n `errors.map.json` (no hand list). Unknown code → `Error`.
pub fn code_kind(code: &str) -> CodeKind {
    match crate::errmap::entry(code).map(|e| e.kind.as_str()) {
        Some("skip") => CodeKind::Skip,
        Some("notice") => CodeKind::Notice,
        _ => CodeKind::Error,
    }
}

/// Display label for a quote mint (WF-20 "Pair quote: USDC · bukan SOL"). Unknown → `None`
/// (UI shows the shortened mint). Static list, never derived from token metadata.
pub fn quote_symbol(mint: &str) -> Option<&'static str> {
    match mint {
        crate::model::WSOL_MINT => Some("SOL"),
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" => Some("USDC"),
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" => Some("USDT"),
        _ => None,
    }
}

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

/// Wire exit-rule id → short Indonesian UI label (activity feed, quick-look, positions). Same text as
/// @centurion/i18n 0.4.10 `exit_reason.<id>` (id) — checked by `exit_labels_match_i18n_package`.
pub fn exit_label(r: ExitReason) -> &'static str {
    match r {
        ExitReason::SellFloor => "Sell floor",
        ExitReason::ProfitTarget => "Take profit",
        ExitReason::LossGuard => "Stop loss",
        ExitReason::PeakTrail => "Trailing stop",
        ExitReason::MaxHold => "Time stop",
        ExitReason::Idle => "Exit tanpa trade",
        ExitReason::SellPressure => "Tekanan jual",
        ExitReason::NoNewHigh => "Tanpa high baru",
        ExitReason::RugDetected => "Rug terdeteksi",
        ExitReason::DrawdownHalt => "Henti drawdown",
        ExitReason::Manual => "Jual manual",
        ExitReason::StrategyRetired => "Strategi dihentikan",
        ExitReason::PracticeReset => "Paper di-reset",
        ExitReason::Stall => "Exit stagnan",
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
    fn exit_labels_match_i18n_package() {
        let id: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/i18n/id.json")).unwrap();
        for r in [ExitReason::SellFloor, ExitReason::ProfitTarget, ExitReason::LossGuard, ExitReason::PeakTrail, ExitReason::MaxHold, ExitReason::Idle, ExitReason::SellPressure, ExitReason::NoNewHigh, ExitReason::RugDetected, ExitReason::DrawdownHalt, ExitReason::Manual, ExitReason::StrategyRetired, ExitReason::PracticeReset, ExitReason::Stall] {
            assert_eq!(id["exit_reason"][exit_id(r)].as_str(), Some(exit_label(r)), "{}", exit_id(r));
        }
        assert_eq!(exit_label(ExitReason::Stall), "Exit stagnan");
        assert_eq!(exit_label(ExitReason::MaxHold), "Time stop");
    }
    #[test]
    fn error_codes_and_quote_labels() {
        assert_eq!(error_code("PAPER_CASH_INSUFFICIENT"), "PRACTICE_CASH_INSUFFICIENT");
        assert_eq!(error_code("VERSION_CONFLICT"), "VERSION_CONFLICT");
        assert_eq!(code_kind("UNSUPPORTED_QUOTE_MINT"), CodeKind::Skip);
        assert_eq!(code_kind("PAPER_CASH_INSUFFICIENT"), CodeKind::Notice);
        assert_eq!(quote_symbol("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), Some("USDC"));
    }

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
