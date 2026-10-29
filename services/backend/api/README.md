# Sentra API (Phase 2, REST + SSE)

Node 22.18+/24 TypeScript (run directly with Node's type stripping, no build step; `tsc` is typecheck only).
Implements `packages/contracts/API_ENDPOINTS.md` / `EVENTS_SCHEMA.md` (contracts **1.1.2**). Practice mode only.

- **Refuses to start unless `TRADING_MODE=paper`** (exit 78); also refuses `REAL_TRADING_ENABLED=true`.
- No private keys, no signing, no transactions. Secrets only from env (`DATABASE_URL`, `SUPABASE_JWT_SECRET`), never logged.
- Every user request is one transaction as role `authenticated` with the verified JWT claims in
  `request.jwt.claims` (like PostgREST): RLS, `auth.uid()` (actor) and `request_client()` (via, from the
  `sentra_client` claim) are the caller's. Bodies can never set actor/via.

| Endpoint | Notes |
|---|---|
| `GET /healthz`, `/readyz` | `{mode:"practice", real_enabled:false, modes_enabled, live_executor:"disabled", contracts_version, server_now}` |
| `GET /v1/workspaces/{ws}` | `WorkspaceWire` (`rev`, `practice_epoch`), `ETag` |
| `GET /v1/workspaces/{ws}/positions[?state&strategy_id&epoch&limit&cursor]`, `/positions/{id}` | `position_wire()`; keyset cursor |
| `POST /v1/workspaces/{ws}/positions/{id}/close` | `If-Match`/`expected_rev`, `Idempotency-Key`, `{fraction_bps}` -> `close_position()` |
| `GET /v1/workspaces/{ws}/approvals[?status&kind]`, `/approvals/{id}` | detail mints a `decision_token` for members with `trade` |
| `POST /v1/workspaces/{ws}/approvals/{id}/decision` | `If-Match`/`expected_rev`, `Idempotency-Key` -> `decide_approval()` |
| `GET /v1/workspaces/{ws}/portfolio/overview` | `portfolio_latest` |
| `GET /v1/workspaces/{ws}/stats/exit-reasons[?strategy_id&window|from&to]` | `exit_stats()` rows |
| `GET /v1/workspaces/{ws}/events[?after_seq|before_seq&types&limit]` | seq strings, `next_after_seq`, `safe_seq` |
| `GET /v1/workspaces/{ws}/events/stream[?after_seq&include=marks,clock]` | SSE; `id:` = seq string; `Last-Event-ID` resume |

Common rules: every body has `server_now` and every response `X-Server-Now`; errors are always
`{error:{code, message (en|id by Accept-Language), ...details, request_id, server_now}, server_now}` with HTTP
status from `errors.json`; SQL raises (`P0<http>`, message = code, detail = JSON) map 1:1. Missing rev ->
`428 PRECONDITION_REQUIRED`, stale -> `409 VERSION_CONFLICT {current_rev, base_rev[, current]}`; same
`Idempotency-Key` + same body -> stored response with `replayed:true` and `Idempotent-Replayed: true`, different
body -> `422 IDEMPOTENCY_KEY_REUSED`. `mode=real` -> `403 REAL_SOL_DISABLED`.

Marks for `include=marks` arrive by `pg_notify('<SSE_MARKS_CHANNEL default sentra_marks>',
'{"workspace_id","mode","mark":{MarkMessage}}')`; only `MarkMessage` fields are forwarded.

Env: `TRADING_MODE=paper` (required), `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWT_AUD` (default
`authenticated`), `API_HOST`, `API_PORT` (8080), `SSE_POLL_MS` (500), `SSE_CLOCK_MS` (5000), `SSE_HEARTBEAT_MS` (15000).

Tests (local Postgres superuser; creates/drops database `sentra_api_test`):
```
npm ci
PGHOST=/tmp PGPORT=55432 PGUSER=postgres npm test
npm run typecheck
```
