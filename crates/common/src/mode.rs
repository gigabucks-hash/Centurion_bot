use serde::{Deserialize, Serialize};

/// Trading mode. `Live` exists in the type system so schemas line up with Phase 7,
/// but nothing in Phase 1–6 can construct an executor for it (see `papersim`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    #[default]
    Paper,
    Live,
}
