# Centurion API (Phase 2, REST + SSE)

Node 22.18+/24 TypeScript (run directly with Node's type stripping, no build step; `tsc` is typecheck only).
Implements `packages/contracts/API_ENDPOINTS.md` / `EVENTS_SCHEMA.md` (contracts **1.1.2**). Practice mode only.

- **Refuses to start unless `TRADING_MODE=paper`** (exit 78); also refuses `REAL_TRADING_ENABLED=true`.
- No private keys, no signing, no transactions. Secrets only from env (`DATABASE_URL`, `SUPABASE_JWT_SECRET`), never logged.
- Every user request is one transaction as role `authenticated` with the verified JWT claims in
  `request.jwt.claims` (like PostgREST): RLS, `auth.uid()` (actor) and `request_client()` (via, from the
  `centurion_client` claim) are the caller's. Bodies can never set actor/via.

| Endpoint | Notes |
|---|---|
| `GET /healthz`, `/readyz` | `{mode:"practice", real_enabled:false, modes_enabled, live_executor:"disabled", contracts_version, server_now}` |
| `GET /v1/workspaces/{ws}` | `WorkspaceWire` (`rev`, `practice_epoch`), `ETag` |
| `GET /v1/workspaces/{ws}/positions[?state&strategy_id&window|from&to&epoch&limit&cursor]`, `/positions/{id}` | `position_wire()`; keyset cursor. Closed rows carry `pnl_lamports`, `pnl_pct`, `hold_seconds`; with `state=closed` a `window`/`from`/`to` filters and orders by `closed_at` |
| `POST /v1/workspaces/{ws}/positions/{id}/close` | `If-Match`/`expected_rev`, `Idempotency-Key`, `{fraction_bps}` -> `close_position()` |
| `GET /v1/workspaces/{ws}/approvals[?status&kind]`, `/approvals/{id}` | detail mints a `decision_token` for members with `trade` |
| `POST /v1/workspaces/{ws}/approvals/{id}/decision` | `If-Match`/`expected_rev`, `Idempotency-Key` -> `decide_approval()` |
| `GET /v1/workspaces/{ws}/portfolio/overview` | `portfolio_latest` |
| `GET /v1/workspaces/{ws}/stats/exit-reasons[?strategy_id&window|from&to]` | `exit_stats()` rows |
| `GET /v1/workspaces/{ws}/stats/pnl[?strategy_id&window|from&to]` | PnL card/report: unrealized, realized, total, windowed realized + closed count / win rate / avg hold / fees (default `window=7d`) |
| `GET /v1/workspaces/{ws}/events[?after_seq|before_seq&types&limit]` | seq strings, `next_after_seq`, `safe_seq` |
| `GET /v1/workspaces/{ws}/events/stream[?after_seq&include=marks,clock]` | SSE; `id:` = seq string; `Last-Event-ID` resume |
| `POST /v1/workspaces/{ws}/practice/reset`, `GET .../practice/resets` | `Idempotency-Key`; `reset_practice()`; `429 RESET_COOLDOWN {next_allowed_at}` + `Retry-After` |
| `GET/POST /v1/workspaces/{ws}/strategies[?status]`, `GET .../{id}` | create via `create_strategy()` (draft/paused), `201` + `ETag` + `Location`, `Idempotency-Key` |
| `PATCH .../strategies/{id}` | `{settings_patch?, name?, status?}`, `If-Match`/`expected_rev`, `Idempotency-Key` -> `update_strategy()` |
| `POST .../strategies/{id}/pause`, `/resume`, `/archive`; `DELETE .../strategies/{id}` | rev required; archive/delete via `retire_strategy_by_user()` |
| `GET .../strategies/{id}/revisions`, `/revisions/{rev}` | history (light) and the merge base (with settings) for the 3-way review |
| `GET .../coins[?strategy_id&window]`, `/coins/{mint}`, `/coins/{mint}/timeline` | coins seen in the workspace's picks; name/symbol stay in `untrusted` |
| `GET .../picks[?strategy_id&stage]`, `/picks/{id}`; `GET .../fills[?position_id&window]` | `fill_wire()` + `position_id` |
| `GET .../orders/{id}`, `GET .../jobs/{job_id}` | poll targets (`order_wire()`; job payload stays internal) |
| `GET .../guard-changes[?strategy_id]`; `GET .../audit-log[?action&window&before_id]` | audit is owner/admin only; ip, user agent and proof hashes never leave the server |
| `GET /v1/me`; `GET /v1/devices`, `PUT/DELETE /v1/devices/{device_id}` | push token is write-only; MCP clients refused |
| `GET/POST/DELETE /v1/me/deletion` | request needs `reauth_at` (≤ 5 min) + `Idempotency-Key`, grace = `ACCOUNT_DELETION_GRACE_DAYS` (7-30, default 7), `202`; MCP refused |

Common rules: every body has `server_now` and every response `X-Server-Now`; errors are always
`{error:{code, message (en|id by Accept-Language), ...details, request_id, server_now}, server_now}` with HTTP
status from `errors.json`; SQL raises (`P0<http>`, message = code, detail = JSON) map 1:1. Missing rev ->
`428 PRECONDITION_REQUIRED`, stale -> `409 VERSION_CONFLICT|STRATEGY_REV_CONFLICT {current_rev, base_rev, current}` (`current` is always present: SQL sends it and `withCurrent()` fills it for any path that does not); same
`Idempotency-Key` + same body -> stored response with `replayed:true` and `Idempotent-Replayed: true`, different
body -> `422 IDEMPOTENCY_KEY_REUSED`. `mode=real` -> `403 REAL_SOL_DISABLED`.

Marks for `include=marks` arrive by `pg_notify('<SSE_MARKS_CHANNEL default centurion_marks>',
'{"workspace_id","mode","mark":{MarkMessage}}')`; only `MarkMessage` fields are forwarded.

SSE streams share one service-role poller per (workspace, mode) (`feed.ts`): a new stream registers, catches up
from the database as the user (RLS), then drains the shared queue de-duplicated by seq; membership is re-checked
every `SSE_MEMBER_CHECK_MS` and the stream closes when it is revoked or the token expires.

Env: `TRADING_MODE=paper` (required), `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_AUD` (default
`authenticated`), `API_HOST`, `API_PORT` (8080), `SSE_POLL_MS` (500), `SSE_CLOCK_MS` (5000), `SSE_HEARTBEAT_MS` (15000),
`SSE_MEMBER_CHECK_MS` (30000), `SSE_MARKS_CHANNEL` (`centurion_marks`), `ACCOUNT_DELETION_GRACE_DAYS` (7, allowed 7-30).

Tests (local Postgres superuser; creates/drops database `centurion_api_test`):
```
npm ci
PGHOST=/tmp PGPORT=55432 PGUSER=postgres npm test
npm run typecheck
```
