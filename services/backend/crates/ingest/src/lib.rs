//! Ingest library: sources, config and the screening pipeline. The `ingest` binary
//! (src/main.rs) wires them together. Split as a lib so Phase 2/8 (entry engine,
//! replay/backtest) can reuse the pipeline.
pub mod backfill;
pub mod config;
pub mod curve;
pub mod marks;
pub mod meter;
pub mod pipeline;
pub mod settings;
pub mod source;
