//! `screener` — ResearchBot-equivalent rule engine.
//!
//! A [`RuleSet`] (loaded from JSON) contains:
//! * **hard** rules: every one must pass, otherwise the coin is rejected;
//! * **weighted** rules: each awards points (optionally partial, optionally a penalty
//!   on failure); the coin passes when `score >= passMark`.
//!
//! Evaluation is a pure function of a [`CoinSnapshot`] so it is trivially testable and
//! replayable. Missing data is never treated as zero: each rule declares what happens
//! via `onMissing`.

mod eval;
mod rules;

pub use eval::{evaluate, CheckResult, RuleClass, ScreenResult};
pub use rules::{Metric, MissingPolicy, Op, Rule, RuleSet, RuleSetError, Threshold};
