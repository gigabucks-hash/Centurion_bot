use serde::{Deserialize, Serialize};

/// Trading mode (wire: `practice` | `real`). `Real` exists so schemas line up with Phase 7, but
/// nothing in Phases 1–6 can execute it: the DB rejects `real` rows, no JWT carries `trade:real`,
/// and the only Real executor is an unimplemented stub behind an off-by-default cargo feature.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    Practice,
    Real,
}
