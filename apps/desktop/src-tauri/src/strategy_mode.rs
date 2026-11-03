//! Per-strategy Paper/Real mode (contracts 1.1.6, 0a2d1b2). Wire mode stays `practice | real`; the UI says
//! "Paper" for `practice`. Real is gated off in this phase: strategy reads carry `real_locked`,
//! `real_locked_reason` and `paper_progress`, and the desktop never switches a strategy to Real:
//! - locked → `MODE_NOT_ALLOWED` locally, nothing is sent;
//! - not locked (a future server) → the 2.5 s Real hold is still required, then `MODE_NOT_ALLOWED` anyway:
//!   this build has no Real path and never requests the `trade:real` scope (backend/mod.rs `REQUESTED_SCOPES`);
//! - to Paper on a Paper strategy → no change.
//!
//! Hold rules (UX SPEC, unchanged): 1.2 s in Paper, 2.5 s in Real.
use crate::model::Mode;
use crate::view::StrategyView;

#[cfg_attr(not(test), allow(dead_code))] // the UI holds; Rust checks only the Real minimum
pub const HOLD_PAPER_MS: u32 = 1_200;
pub const HOLD_REAL_MS: u32 = 2_500;

#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
    /// Already in that mode.
    NoChange,
}

/// `Err((code, detail))`: an errors.json code shown through errors.map.json (MODE_NOT_ALLOWED = notice copy
/// "This strategy isn't approved for Real…").
pub fn decide(view: Option<&StrategyView>, to: Mode, hold_ms: u32) -> Result<Decision, (&'static str, &'static str)> {
    let Some(v) = view else { return Err(("NOT_FOUND", "strategy")) };
    match to {
        Mode::Practice if v.mode == Mode::Practice => Ok(Decision::NoChange),
        // A Real strategy cannot exist in this phase and the contract has no mode-change endpoint yet.
        Mode::Practice => Err(("UNAVAILABLE", "no_mode_endpoint")),
        Mode::Real if v.real_locked => Err(("MODE_NOT_ALLOWED", "real_locked")),
        Mode::Real if hold_ms < HOLD_REAL_MS => Err(("HOLD_TOO_SHORT", "real_hold_2500ms")),
        Mode::Real => Err(("MODE_NOT_ALLOWED", "no_real_path")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{PaperProgress, RealLockedReason, StrategySummary};

    fn summary(id: &str, locked: Option<bool>, reason: Option<RealLockedReason>) -> StrategySummary {
        StrategySummary {
            id: id.into(), name: "S".into(), rev: 1, status: Some("active".into()), mode: Some(Mode::Practice), settings: serde_json::json!({}),
            real_locked: locked, real_locked_reason: reason, paper_progress: Some(PaperProgress { days_done: 2, days_required: None, trades_done: 5, trades_required: Some(30) }),
        }
    }

    #[test]
    fn real_is_never_reached_and_locked_strategies_send_nothing() {
        let locked = StrategyView::from_summary(&summary("a", Some(true), Some(RealLockedReason::NeedsOwnerApproval)));
        assert_eq!(decide(Some(&locked), Mode::Real, 10_000), Err(("MODE_NOT_ALLOWED", "real_locked")));
        assert_eq!(decide(Some(&locked), Mode::Practice, 0), Ok(Decision::NoChange));
        // missing gate fields (older server) = locked, reason other (fail safe)
        let old = StrategyView::from_summary(&summary("b", None, None));
        assert!(old.real_locked);
        assert_eq!(old.real_locked_reason, Some(RealLockedReason::Other));
        assert_eq!(decide(Some(&old), Mode::Real, 10_000), Err(("MODE_NOT_ALLOWED", "real_locked")));
        // a future unlocked strategy: 2.5 s hold still enforced, and still no Real path in this build
        let open = StrategyView::from_summary(&summary("c", Some(false), None));
        assert_eq!(open.real_locked_reason, None);
        assert_eq!(decide(Some(&open), Mode::Real, HOLD_PAPER_MS), Err(("HOLD_TOO_SHORT", "real_hold_2500ms")));
        assert_eq!(decide(Some(&open), Mode::Real, HOLD_REAL_MS), Err(("MODE_NOT_ALLOWED", "no_real_path")));
        assert_eq!(decide(None, Mode::Real, HOLD_REAL_MS), Err(("NOT_FOUND", "strategy")));
        assert!(!crate::backend::REQUESTED_SCOPES.contains(&"trade:real"));
    }

    #[test]
    fn gate_fields_decode_from_the_1_1_6_wire_and_unknown_reasons_are_other() {
        let v: StrategySummary = serde_json::from_value(serde_json::json!({
            "id": "s", "name": "n", "rev": 3, "status": "active", "mode": "practice", "settings": {},
            "real_locked": true, "real_locked_reason": "gate_not_met",
            "paper_progress": {"days_done": 3, "days_required": 7, "trades_done": 12, "trades_required": null}
        }))
        .unwrap();
        let view = StrategyView::from_summary(&v);
        assert_eq!((view.real_locked, view.real_locked_reason), (true, Some(RealLockedReason::GateNotMet)));
        assert_eq!(view.paper_progress, PaperProgress { days_done: 3, days_required: Some(7), trades_done: 12, trades_required: None });
        let r: RealLockedReason = serde_json::from_str("\"brand_new_reason\"").unwrap();
        assert_eq!(r, RealLockedReason::Other);
        // the enum = contracts REAL_LOCKED_REASONS (committed events.ts)
        let ts = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../packages/contracts/src/wire/events.ts")).unwrap();
        let line = ts.lines().find(|l| l.starts_with("export type RealLockedReason")).unwrap();
        let theirs: Vec<&str> = line.split('"').skip(1).step_by(2).collect();
        let ours: Vec<String> = crate::model::REAL_LOCKED_REASONS.iter().map(|r| serde_json::to_value(r).unwrap().as_str().unwrap().to_owned()).collect();
        assert_eq!(ours, theirs);
    }

    #[test]
    fn mock_covers_every_gate_state() {
        use crate::backend::mock::mock_real_gate;
        let ids = ["20000000-0000-0000-0000-00000000000a", "20000000-0000-0000-0000-00000000000b", "20000000-0000-0000-0000-00000000000c"];
        let g: Vec<_> = ids.iter().map(|i| mock_real_gate(i)).collect();
        assert_eq!(g[0].0, RealLockedReason::NeedsOwnerApproval);
        assert_eq!((g[0].1.days_required, g[0].1.trades_required), (None, None), "rules not set (backend default)");
        assert_eq!(g[1].0, RealLockedReason::GateNotMet);
        assert!(g[1].1.days_done < g[1].1.days_required.unwrap());
        assert_eq!(g[2].0, RealLockedReason::Policy);
        assert!(g[2].1.trades_done >= g[2].1.trades_required.unwrap(), "progress met but still locked");
    }
}
