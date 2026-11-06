# `buys_paused` decisions (paper-only; A/A/A chosen and implemented)

The existing approval trigger already rejects buys with `409 BUYS_PAUSED`. These are the three choices needed before extending the ingest/paper path. No trading gate is changed by this document.

**Chosen: A / A / A** (see the bottom of this file). Implemented for the paper ingest demo path in `crates/ingest/src/settings.rs` + `crates/ingest/src/pipeline.rs`; the API/approval path is unchanged.

## 1. Event vocabulary

| Option | Shape | Pros | Cons |
|---|---|---|---|
| **A — reuse `order.failed` + `reason_code=BUYS_PAUSED` (recommended)** | Keep `PickStage::Passed`; emit the existing order failure wire | Additive-free, existing clients/SSE understand it, clearly says the valid pick was suppressed before execution | Consumers must inspect reason code rather than a dedicated paused stage |
| B — `pick.paused` + `PickStage::Paused` | New event/stage and contract/mobile mappings | First-class UI state and analytics | Contract + SQL + all clients; larger migration and compatibility surface |
| C — no event | Log/metric only; do not expose suppression | Smallest wire change | Operator/user cannot distinguish paused from an ingest failure; poor auditability |

## 2. DB-error policy

| Option | Paper behavior | Phase-7/live implication |
|---|---|---|
| **A — keep last value; first read `false` (recommended for current paper path)** | A transient settings error does not stop paper; warn and retain the last value | Must not be carried into real-money execution without a separate fail-closed gate |
| B — fail closed | Treat unknown/error as paused; no buys until settings are readable | Safest, but can stop paper unexpectedly and requires explicit recovery/observability |
| C — fail open | Treat every error as unpaused | Smoothest demo, but unsafe and not acceptable for real money |

## 3. Settings-reader owner

| Option | Owner | Pros | Cons |
|---|---|---|---|
| **A — ingest-owned poller (recommended for current architecture)** | New small `crates/ingest` reader polls `agent_settings` | Avoids blocking the future `PgRepo`; easy watch-channel injection into `Pipeline` | Second settings reader and a 1-second polling path |
| B — `db::PgRepo` owns settings | Read through the repository abstraction | One backend data-access owner; easier to share later | `PgRepo` is not implemented yet; couples this change to week-2 persistence work |
| C — API owns cached state | API reads/writes and publishes a cache/NOTIFY; ingest consumes it | Centralized policy and no duplicate query | Requires a new NOTIFY/cache protocol and reconnect semantics |

**Chosen and implemented (paper path): A/A/A**, with a separate Phase-7 decision to fail closed before any real execution. See [`BUYS_PAUSED_ENGINE.md`](BUYS_PAUSED_ENGINE.md) for the implemented modules and tests.
