# Backend answers for Web (dashboard)

Normative detail: `EVENTS_SCHEMA.md`, `API_ENDPOINTS.md`, `errors.json`, TS types in `src/wire`
(`import { wire } from "@sentra/contracts"`). SQL: `services/backend/supabase/migrations/0001_init.sql`, `0002_contracts_v1_1.sql`.
**Contract v1.1** (2026-10-29): see the v1.1 section at the end and `CHANGELOG.md`.

## Round 1 (original 7 questions)

1. **Endpoints, scopes, pagination.** `/v1/workspaces/{ws}/...`; scopes `read` / `trade` (practice) /
   `trade:real` (never issued pre-Phase 7). Lists use keyset `cursor`; events use `after_seq`/`before_seq`
   with `next_after_seq`, `has_more`, `safe_seq`.
2. **Realtime transport, is TradeEvent close?** Supabase Realtime `postgres_changes` on `public.events`
   (RLS) + private Broadcast `marks:<ws>:<mode>` for mark price + `clock` heartbeat (15 s); SSE
   `/v1/workspaces/{ws}/events/stream?mode=&include=marks,clock` (1.1.2) with `Last-Event-ID` for non-Supabase clients. Your TradeEvent is close: rename to
   the envelope `{id, seq, type, version, workspace_id, strategy_id, ck, mint, ts, actor, mode, payload,
   untrusted, server_now}`. `seq` is an int64 **string** (1.1.2), monotonic but not gapless; persist only REST/SSE/clock watermarks.
3. **Units (v1.1+).** Lamports, raw token amounts and int64 ids (seq) are integer strings; prices are decimal strings;
   pct/ratio/bps/usd/score are JSON numbers; counts/ms/rev integers (see EVENTS_SCHEMA section 1).
4. **Funnel.** Precomputed hourly in `strategy_funnel_hourly` from events (detected, screened,
   guard_passed, picked, proposed, approved, opened, closed); `GET .../strategies/{id}/funnel?window=`
   with `1h|24h (default)|7d|30d|all`.
5. **Exit stats server-side with same filters?** Yes: `GET .../stats/exit-reasons` -> SQL `exit_stats()`, using the
   same filter parser as `/positions` (`mode`, `strategy_id`, `window`/`from`/`to`), so numbers match.
6. **Approval endpoint.** `POST .../approvals/{id}/decision` with `Idempotency-Key` header +
   `{decision, token}` + `If-Match: "<rev>"` (or `expected_rev`); the channel comes from the JWT (1.1.2). Server owns `expires_at` (pick 10 min, guard change
   24 h, team action 1 h; configurable per workspace). Replays return the stored result
   (`replayed: true`); conflicts are `409 VERSION_CONFLICT` / `APPROVAL_ALREADY_DECIDED` /
   `APPROVAL_EXPIRED` / `STRATEGY_REV_CONFLICT` / `422 IDEMPOTENCY_KEY_REUSED`.
7. **Single source of truth for cash/equity/drawdown.** `portfolio_snapshots` (written by the worker on
   every fill and every 60 s) and the `portfolio_latest` view; the `portfolio.snapshot` event carries the
   same row incl. `as_of_seq`. Drawdown is integer `drawdown_bps` plus `drawdown_pct` ("8.40").

## Round 2 — already decided (confirmed)
- **Guard impact:** static estimate first (`POST .../guard-impact/estimate`, < 50 ms,
  `method: "static_v1"`). Full replay (`POST .../guard-impact`) behind `GUARD_REPLAY_ENABLED`; it
  returns `503 REPLAY_UNAVAILABLE` when off, and the UI falls back to the estimate. Measured replay:
  50k samples in 172–180 ms CPU (release) plus about 125 ms DB fetch, so under 2 s.
- **Expiry:** the worker expires proposals; archive/delete expires them in the same transaction
  (`retire_strategy`). The `proposal.expired` payload is `{proposal_id, kind, rev, reason, at}` (1.1.2: `rev`).
- **TTLs and clock:** the server owns TTLs (10 min / 24 h). `server_now` is on every REST body plus the
  `X-Server-Now` header, and on every stream payload. Render countdowns with skew correction.
- **Amounts:** lamport strings.
- **Real SOL guard weakening:** the 10 min cooldown and 24 h auto-revert are **mandatory**, enforced by a
  CHECK on `guard_changes` today (disabled path).

## Round 2 — Q3: workspace and mode separation
- Every resource is scoped by `workspace_id` **and** `mode` (`practice|real`). API: path
  `/v1/workspaces/{ws}/...` plus a `mode` query param on reads and a `mode` body field on writes
  (default `practice`).
- DB: a `mode trade_mode` column on workspaces, strategies, picks, positions, fills, events, approvals,
  portfolios, portfolio_snapshots, strategy_funnel_hourly, guard_changes and audit_log. Each column has
  `CHECK (mode = 'practice')`, so the DB keeps rejecting `real` until a Phase 7 migration.
- RLS: workspace membership AND `public.mode_visible(mode)`. Real rows are visible only if the JWT
  `app_scopes` claim contains `trade:real`.
- Scope: `trade:real` is separate from `trade` and is **never issued** before Phase 7. The token issuer
  has no code path for it.
- API behaviour: `mode=real` returns `403 REAL_SOL_DISABLED` (or `403 FORBIDDEN_SCOPE` without the scope).
- Practice and real numbers never mix: separate portfolios, snapshots, funnels, stats and event streams.
  The Broadcast channel name includes the mode.

## Round 2 — Q4: proof-of-confirmation and audit_log
- **Flow:** `POST /confirmations/challenge {action, target, payload_hash}` returns
  `{challenge_id, challenge, expires_at (2 min), rp_id, required: {webauthn, typed_name, hold_ms}}`.
- **Payload** (`confirmation` field on the sensitive request):
  - `challenge_id`
  - `webauthn {credential_id, client_data_json, authenticator_data, signature, user_handle}` (base64url)
  - `challenge` (echo)
  - `typed_confirmation` (the strategy name)
  - `hold_duration_ms`
  - `device {platform, app_version, model, attestation}`
- **Server verification:**
  1. Atomically consume the challenge (`consume_confirmation_challenge`), which must be bound to the
     user, action, target and the `sha256` of the canonical diff.
  2. WebAuthn: type `webauthn.get`, challenge match, origin allow-list, rpIdHash, UP+UV flags, credential
     owned by the user, signature over `authenticatorData || sha256(clientDataJSON)`, and an increasing
     sign_count.
  3. Typed name exactly equals the strategy name (NFC).
  4. Hold of at least 2500 ms for real, 1200 ms for practice. This is client-reported, so it is defence
     in depth only.
  5. Real also requires the `trade:real` scope and TOTP.
  6. Append the audit row.
- **Errors:** `CONFIRMATION_REQUIRED` (428), `CONFIRMATION_INVALID`, `WEBAUTHN_INVALID`,
  `TYPED_CONFIRMATION_MISMATCH`, `HOLD_TOO_SHORT`, `TWO_FACTOR_REQUIRED`.
- **`audit_log`** is append-only (an UPDATE/DELETE/TRUNCATE trigger plus revoked privileges). Columns:
  - `id`, `workspace_id`, `mode`
  - `actor_user`, `actor_kind` (user|system|mcp|worker), `actor_via`
  - `action`, `target_type`, `target`
  - `before jsonb`, `after jsonb`, `risk jsonb`
  - `proof_kind` (webauthn|totp|typed|none), `proof_hash bytea(32)`
  - `approval_id`, `request_id`
  - `ip inet`, `user_agent`, `device jsonb`
  - `server_now` (clock_timestamp), `created_at`
- Read it with `GET .../audit-log` (owner/admin only).

## Round 2 — Q7: login (updated: wallet SIWS only; email OTP dropped)
- **Wallet login (SIWS/Phantom) is the only login** (private single-owner app). Email OTP, Google/Apple and
  Telegram are **not** part of the MVP: their routes answer `404` (flags `AUTH_EMAIL_OTP_ENABLED`,
  `AUTH_TELEGRAM_OIDC_ENABLED` default off, no further work).
- Four routes (API_ENDPOINTS 4.1):
  - `POST /v1/auth/siws/nonce {address, domain, uri?, chain_id?: "solana:mainnet", statement_version?: 1}` ->
    `{data: {nonce, message, issued_at, expires_at, statement_version}}`. Sign `message` **byte for byte** with
    `signMessage` / MWA `sign_messages` (not the wallet's own `signIn`, which rebuilds the text).
  - `POST /v1/auth/siws/verify {address, message, signature (base58, 64 bytes), client: "web"}` ->
    `{data: Session & {workspace_id}}`.
  - `POST /v1/auth/session/refresh {refresh_token}` -> `{data: Session}` (rotating; single-flight on the client;
    a replay of the just-rotated token within 10 s returns the same new pair, later replays revoke the session).
  - `POST /v1/auth/session/logout {refresh_token}` -> `{data: {revoked: true}}`; the access token stops working
    at once (`401 UNAUTHENTICATED {reason: "session_revoked"}`).
- Only allow-listed owner wallets (`OWNER_WALLETS`, required; the API does not boot without it) can sign in;
  others get `403 FORBIDDEN_ROLE {reason: "wallet_not_allowed"}`. The owner wallet is never answered `429` at login,
  only delayed (`X-Sentra-Login-Delay-Ms`).
- Nonce: 5 min, single-use, every message field (domain, address, uri, chain, issued at, expiry, statement version)
  is stored with it and compared exactly at verify; a tampered message burns the nonce.
- **`client`:** send `"web"` from the web app (also the default). It is optional and defaults to `"web"`; it becomes the
  `sentra_client` claim, which the backend records as the channel (`via`) on approvals and audit rows and on the
  session. It grants nothing: scopes are always `read` + `trade` (never `trade:real`).
- Access token: HS256 signed by the Sentra API with its own key (`SENTRA_SESSION_SECRET`, iss `sentra-api`,
  15 min, claims `sub, sid, app_scopes, sentra_client, wallet, amr: ["siws"]`). Send it only to the Sentra API,
  not to Supabase directly. The login wallet is never a trading wallet.
- Web: `domain` must equal the page host (it is checked against `Origin`), `uri` an https URL on it.

## v1.1 changes and what `apps/web` should change (checked against `lib/types.ts`, `lib/api.ts`, `lib/http-api.ts`)
1. Paths: `/v1/workspaces/${mode}/...` -> `/v1/workspaces/{ws}/...?mode=practice`; `/v1/strategies/{id}` ->
   `/v1/workspaces/{ws}/strategies/{id}`; `/coins/{mint}/trail` -> `/timeline`; `/stats/exits` -> `/stats/exit-reasons`.
2. Strategy save: `PATCH .../strategies/{id}` with `If-Match: "<rev>"` (or `expected_rev`) and a flat snake_case
   `settings_patch`; no `POST /revisions`. Handle `409 STRATEGY_REV_CONFLICT` (body has `current`, `changed_fields`,
   `changed_by`, `changed_at`; base via `GET .../revisions/{rev}`), `428 PRECONDITION_REQUIRED`, and
   `409 CONFIRMATION_RESTART_REQUIRED` (re-run the whole Real confirmation).
3. Approvals: `POST .../approvals/{id}/decision` (not `/decisions`) with `Idempotency-Key`, `token`,
   `If-Match: "<rev>"` (1.1.2; `expected_version` is gone); skip = `decision: "reject"`; undo-skip stays client-side (send after the 5 s window);
   cancel a cooldown with `POST .../guard-changes/{id}/cancel`.
4. Settings model: nested camelCase `StrategySettings` (`sizing.budgetSol`, ...) -> flat snake_case keys from
   `services/backend/config/strategy_settings.schema.json`; SOL as lamport strings (`bankroll_lamports`,
   `ticket_lamports`); percentages as numbers. Exit plan ids (`ladder3`, `trailOnly`, `quickScalp`, `doubling`)
   -> `exit_preset` values; must-have rules -> `required_checks`.
5. Enums: `EXIT_REASONS` -> import `wire.EXIT_REASONS`; `CoinMeta.stream` -> `venue: "curve" | "amm"` (`CoinStream`
   is a deprecated alias until 1.2); guard check names -> `wire.GuardCheckName` (`washTrading`, `layeredLaunch`,
   `insiderProfit` do not exist); strategy status has no `stopped` (`draft|running|paused|archived`); funnel stages
   are `scanned filtered signaled entered exited`.
6. Numbers: prices are `*_price_sol` decimal strings (no `entryPriceUsd` number); pct/ratio/bps/score are numbers.
   Guard impact responses are `StaticEstimate` / `ImpactReport` (not `RiskImpact`).
7. `lib/contracts.ts` is imported but missing: import from `@sentra/contracts` (`wire`).
8. New flows: practice reset (`POST .../practice/reset`, 429 `RESET_COOLDOWN` with `next_allowed_at`,
   `practice.reset` event -> drop cached positions/equity), account deletion (`/me/deletion`), devices
   (`PUT /devices/{device_id}` with `platform: "web"`, `provider: "webpush"`). Telegram and email OTP are dropped (404).

## v1.1.2 changes for `apps/web`
- `seq`/`next_after_seq`/`safe_seq`/`as_of_seq` are strings: compare with `BigInt`.
- SSE: `/v1/workspaces/{ws}/events/stream?mode=practice&include=marks,clock`.
- Errors: details are inside `error` (`error.current_rev`, `error.current`, ...); `error` is always an object.
- Manual sell: `POST .../positions/{id}/close` with `If-Match: "<position rev>"`, `Idempotency-Key`,
  `{fraction_bps}`; follow `order.*`/`position.*` events. `sell_pct` is gone.
- Exit stats rows: `{exit_reason, count, pnl_lamports, avg_pnl_pct, win_rate_pct, avg_hold_s}`.
- Settings: `exit.stopLossPct` maps to `stop_loss_pct` (from entry); trailing maps to `peak_trail_pct`.
- Coins/positions carry `decimals` and `token_program`; never assume 6. `practice_epoch` is on workspace,
  portfolio, positions and fills.
