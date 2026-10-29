//! `db` — persistence boundary.
//!
//! Phase 1 ships the trait ([`Repo`]), an in-memory implementation used by tests and
//! `ingest --replay`, and the SQL migration (embedded as [`MIGRATION_0001`]). The
//! Postgres implementation (sqlx, `PgRepo`) lands in week 2 behind the same trait.
//! Events are append-only in both implementations.

mod memory;
mod model;

pub use memory::MemoryRepo;
pub use model::{FillRecord, Job, JobStatus, PickRecord, PickStage};

use async_trait::async_trait;
use common::{CoinKey, CoinSnapshot, Event};

/// The initial schema, shared with Supabase (`supabase/migrations`).
pub const MIGRATION_0001: &str = include_str!("../../../supabase/migrations/0001_init.sql");

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("append-only violation: {0}")]
    AppendOnly(String),
    #[error("backend: {0}")]
    Backend(String),
}

/// Storage operations needed by Phase 1 (ingest/screener/guard/papersim).
#[async_trait]
pub trait Repo: Send + Sync {
    async fn upsert_coin(&self, coin: &CoinSnapshot) -> Result<(), DbError>;
    async fn upsert_pick(&self, pick: &PickRecord) -> Result<(), DbError>;
    async fn get_pick(&self, ck: &CoinKey) -> Result<PickRecord, DbError>;
    /// Returns `Ok(false)` when an event with the same id already exists (idempotent
    /// replays); never overwrites.
    async fn append_event(&self, ev: &Event) -> Result<bool, DbError>;
    async fn events_for(&self, ck: &CoinKey) -> Result<Vec<Event>, DbError>;
    async fn record_fill(&self, fill: &FillRecord) -> Result<(), DbError>;
}

/// Phase 2 job queue contract (Postgres `jobs` + `FOR UPDATE SKIP LOCKED`).
/// Declared now so Phase 1 code can enqueue; workers come in Phase 2.
#[async_trait]
pub trait JobQueue: Send + Sync {
    async fn enqueue(&self, job: Job) -> Result<i64, DbError>;
    async fn claim(&self, worker: &str, kinds: &[&str]) -> Result<Option<Job>, DbError>;
    async fn complete(&self, id: i64) -> Result<(), DbError>;
    async fn fail(&self, id: i64, error: &str) -> Result<(), DbError>;
}

#[cfg(test)]
mod tests {
    use super::MIGRATION_0001;

    #[test]
    fn migration_defines_all_phase1_tables() {
        for t in [
            "users",
            "workspaces",
            "workspace_members",
            "wallets",
            "strategies",
            "coins",
            "picks",
            "positions",
            "fills",
            "events",
            "approvals",
            "jobs",
        ] {
            let needle = format!("create table public.{t} (");
            assert!(MIGRATION_0001.contains(&needle), "missing table {t}");
        }
        assert!(MIGRATION_0001.contains("enable row level security"));
        assert!(MIGRATION_0001.contains("events_append_only"));
        assert!(
            !MIGRATION_0001.to_lowercase().contains("private_key"),
            "no key material columns"
        );
    }
}
