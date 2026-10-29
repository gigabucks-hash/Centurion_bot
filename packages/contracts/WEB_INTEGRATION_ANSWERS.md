# Backend answers for Web (dashboard)

Normative detail: `EVENTS_SCHEMA.md`, `API_ENDPOINTS.md`, `errors.json`, TS types in `src/wire`
(`import { wire } from "@sentra/contracts"`). SQL: `services/backend/supabase/migrations/0001_init.sql`.

## Round 1 (original 7 questions)

1. **Endpoints, scopes, pagination.** `/v1/workspaces/{ws}/...`; scopes `read` / `trade` (practice) /
   `trade:real` (never issued pre-Phase 7). Lists use keyset `cursor`; events use `after_seq`/`before_seq`
   with `next_after_seq`, `has_more`, `safe_seq`.
2. **Realtime transport, is TradeEvent close?** Supabase Realtime `postgres_changes` on `public.events`
   (RLS) + private Broadcast `marks:<ws>:<mode>` for mark price + `clock` heartbeat (15 s); SSE
   `/v1/events/stream` with `Last-Event-ID` for non-Supabase clients. Your TradeEvent is close: rename to
   the envelope `{id, seq, type, version, workspace_id, strategy_id, ck, mint, ts, actor, mode, payload,
   untrusted, server_now}`. `seq` is monotonic but not gapless; persist only REST/SSE/clock watermarks.
3. **Units.** Lamports and raw token amounts are integer strings; prices/pcts/scores decimal strings;
   bps/counts/ms integers. No floats anywhere on the wire (enforced by a Rust end-to-end test).
4. **Funnel.** Precomputed hourly in `strategy_funnel_hourly` from events (detected, screened,
   guard_passed, picked, proposed, approved, opened, closed); `GET .../strategies/{id}/funnel?window=`
   with `1h|24h (default)|7d|30d|all`.
5. **Exit stats server-side with same filters?** Yes: `GET .../stats/exit-reasons` -> SQL `exit_stats()`, using the
   same filter parser as `/positions` (`mode`, `strategy_id`, `window`/`from`/`to`), so numbers match.
6. **Approval endpoint.** `POST .../approvals/{id}/decision` with `Idempotency-Key` header +
   `{decision, token, expected_version, client}`. Server owns `expires_at` (pick 10 min, guard change
   24 h, team action 1 h; configurable per workspace). Replays return the stored result
   (`replayed: true`); conflicts are `409 VERSION_CONFLICT` / `APPROVAL_ALREADY_DECIDED` /
   `APPROVAL_EXPIRED` / `STRATEGY_REV_CONFLICT` / `IDEMPOTENCY_KEY_REUSED`.
7. **Single source of truth for cash/equity/drawdown.** `portfolio_snapshots` (written by the worker on
   every fill and every 60 s) and the `portfolio_latest` view; the `portfolio.snapshot` event carries the
   same row incl. `as_of_seq`. Drawdown is integer `drawdown_bps` plus `drawdown_pct` ("8.40").

## Round 2 — already decided (confirmed)
- **Guard impact:** static estimate first (`POST .../guard-impact/estimate`, < 50 ms,
  `method: "static_v1"`). Full replay (`POST .../guard-impact`) behind `GUARD_REPLAY_ENABLED`; it
  returns `503 REPLAY_UNAVAILABLE` when off, and the UI falls back to the estimate. Measured replay:
  50k samples in 172–180 ms CPU (release) plus about 125 ms DB fetch, so under 2 s.
- **Expiry:** the worker expires proposals; archive/delete expires them in the same transaction
  (`retire_strategy`). The `proposal.expired` payload is `{proposal_id, kind, version, reason, at}`.
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

## Round 2 — Q7: SIWS and email OTP
- **SIWS:**
  - `POST /auth/siws/nonce {address, domain, uri, chain_id}` returns
    `{nonce, message, issued_at, expires_at}`. The nonce has a 5 min TTL, is single-use, and is bound to
    the domain and address (`siws_nonces`).
  - `POST /auth/siws/verify {address, message, signature}`: parse the message, check the domain
    allow-list against the Origin, consume the nonce atomically (`consume_siws_nonce`), verify the
    ed25519 signature over the exact bytes, then link the identity and mint a session.
  - Rate limits: 10/min per IP, 5/min per address.
- **Email OTP:**
  - `POST /auth/email/otp/request {email}` always returns `202` (no account enumeration).
  - The code is 6 digits with a 10 min TTL, stored only as
    `HMAC-SHA256(OTP_PEPPER, email || code)` in `email_otps`.
  - Limits: resend no sooner than 60 s, at most 5 codes per email per hour, at most 20 requests per IP
    per hour (`429 RATE_LIMITED`, `retry_after_s`).
  - `POST /auth/email/otp/verify {email, code}` uses a constant-time compare. 5 wrong attempts lock it
    for 15 min (`OTP_LOCKED`). A code is single-use (`consumed_at`).
