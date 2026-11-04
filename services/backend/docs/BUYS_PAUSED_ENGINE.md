# `agent_settings.buys_paused` in the Rust engine — design (not implemented)

Status: **design only**. The paper buy path is intentionally unchanged. This note records the exact
place and shape of the change so it can be implemented without guessing.

## Why this is not implemented yet

1. **No settings read path exists in the engine.** `crates/engine` reads strategy JSON from disk via
   `engine::strategy::StrategyStore`; its `Cargo.toml` has no `db`/`tokio-postgres` dependency and
   `EngineConfig::from_env()` reads only environment variables. It cannot see
   `public.agent_settings`.
2. **The Rust buy path is a P1 demo with an in-memory repo.** `crates/ingest/src/main.rs:157` uses
   `db::MemoryRepo` (`db/src/lib.rs` documents `PgRepo` as week-2 work) and builds
   `PaperExecutor` at `:165`. The only Postgres connections in the ingest binary are the marks
   publisher (`src/marks.rs`) and the bytes/day meter (`src/meter.rs`), neither of which reads
   `agent_settings`.
3. **The enforced buy path today is the approval flow.** `POST .../approvals/{id}/decision` is
   guarded by the SQL trigger `approvals_buys_paused_guard`
   (`supabase/migrations/0020_agent_mcp.sql:133-145`), so app and MCP buys already return
   `409 BUYS_PAUSED`. The Rust `demo_buy_sol` path is not the production approval path.
4. **No event/stage vocabulary for "skipped because paused".** `BUYS_PAUSED` is an API error code
   (`common/src/error_codes.rs`), not an event kind or a `PickStage`. Choosing one affects
   contracts/SSE consumers.

Implementing a flag inside the in-memory pipeline would look like a fix while leaving the real
approval path as the only enforced one. That is why the change stops at a design.

## Exact design

### 1. Settings reader (new module `crates/ingest/src/settings.rs`)

```rust
/// Polls the workspace Stop flag. Missing row = false (the API creates it on first read).
pub fn spawn_buys_paused_watch(
    database_url: common::Secret, // already held by ingest config
    workspace_id: String,         // Pipeline.workspace_id
    interval: std::time::Duration, // 1 s
) -> tokio::sync::watch::Receiver<bool>
```

Query (single row, no join):

```sql
select coalesce(
         (select buys_paused
            from public.agent_settings
           where workspace_id = $1::uuid),
         false) as buys_paused;
```

- Poll every **1 s**; `agent_settings` writes do not emit `NOTIFY`, so polling is the only option
  without adding a `pg_notify` in the API.
- Keep the last successfully read value on a query error and log `warn!`; never stop the engine.
- Paper policy on the very first read: `false` (preserve current paper behaviour). **Phase 7 must
  fail closed** (treat unknown as paused); that is a separate gate decision.

### 2. Call point (`crates/ingest/src/pipeline.rs`)

Add `pub buys_paused: Option<tokio::sync::watch::Receiver<bool>>` to `Pipeline` (`None` keeps today's
behaviour). In `Pipeline::process`, after the screener/guard pass and after `decimals` is known
(currently `pipeline.rs:310`), before the `c.pool` branch:

```rust
if self.buys_paused.as_ref().is_some_and(|r| *r.borrow()) {
    let p = papersim::order_failed(
        &order_id,
        None,
        &c.mint.to_string(),
        &order,
        decimals,
        common::ErrorCode::BuysPaused,
        "buys are paused for this workspace".into(),
        None,                 // no pool needed: the order never reached execution
        c.quote_mint.as_deref(),
        server_now(),
    );
    self.order_failed(&ck, &c, p).await?;
    // Keep PickStage::Passed: the pick is valid; only the buy is suppressed.
    self.repo.upsert_pick(&pick).await?;
    return Ok(());
}
```

Why this point: `order` and `decimals` already exist, `c.pool` has not been validated, and no RPC or
executor call has happened. The emitted `order.failed` payload is the existing wire shape
(`reason_code: "BUYS_PAUSED"`, `mode: "practice"`), so no contract change is needed. Resuming is
automatic on the next poll.

Alternative if Product prefers a visible "skipped" state: add `PickStage::Paused` plus a
`pick.paused` event. That is a contracts + SQL + mobile change; do not do it inside this fix.

### 3. Tests

- Unit (`crates/ingest/src/pipeline.rs` tests, `MemoryRepo` + `PaperExecutor`):
  1. set the watch to `true`, process one `NewCoin`, assert `stats.bought == 0`, exactly one
     `order.failed` event, `reason_code == "BUYS_PAUSED"`, no `position.opened`, pick remains
     `passed`;
  2. set the watch to `false`, process the same fixture, assert the paper fill still happens.
- Query test: a pure unit test for the row→bool mapping; the live `select` is covered by the
  existing Postgres API tests (Rust CI has no Postgres service).
- No live path: `PaperExecutor` and `Mode::Practice` stay unchanged; `live-execution` stays off.

## Decisions needed before implementation

1. Event vocabulary: reuse `order.failed` + `BUYS_PAUSED` (smallest change, recommended) or add a
   new pick stage/event (contracts + mobile + SQL).
2. Unknown/DB-error policy: paper `false` (recommended now) vs fail-closed (required for Phase 7).
3. Owner of the `PgRepo`/settings client: `db::Repo` is still trait-only; a direct
   `tokio_postgres` poller in `ingest` avoids blocking week-2 `PgRepo` work but adds a second
   settings reader alongside the API.
