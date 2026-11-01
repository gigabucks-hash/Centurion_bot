# Centurion Trade backend (codename `sentra`) (Phase 1, paper trading only)

Rust worker plus Supabase schema for Centurion Trade. **Paper only:** no private keys, and only `PaperExecutor`
ships. `LiveExecutor` is a stub behind the `live-execution` feature (off), and the service refuses to
start unless `TRADING_MODE=paper`.

| Path | What |
|---|---|
| `crates/common` | wire units (lamport/decimal strings), event envelope, approvals, portfolio maths, generated error codes |
| `crates/screener` | rule engine (stream / hard / weighted) with tests |
| `crates/guard` | rug checks, static impact estimate, replay impact (+ 50k-sample budget test) |
| `crates/papersim` | constant-product fill model (125 bps fee, latency drift), `PaperExecutor`, live stub |
| `crates/db` | repository trait + in-memory impl |
| `crates/ingest` | source traits (PumpPortal, Yellowstone, replay stubs), pipeline, config |
| `supabase/migrations/0001_init.sql` | schema, RLS, mode gate, approvals/tokens, outbox, audit_log |
| `supabase/tests` | SQL smoke tests (`scripts/check_sql.sh`) |
| `config/` | `screener.example.json`, `strategy_settings.schema.json` |
| `docs/TECH_DESIGN.md` | design; contracts are in `packages/contracts` |

```bash
cp .env.example .env            # fill locally; never commit
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
cargo test -p guard --release -- --ignored --nocapture replay_budget   # replay latency
PGHOST=/tmp PGPORT=55432 PGUSER=postgres bash scripts/check_sql.sh   # any Postgres 15+ with pgcrypto
```
CI: `.github/workflows/backend.yml` at the repo root.
