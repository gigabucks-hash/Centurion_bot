# Sentra REST API (contract v1 draft)

Base `https://api.<domain>/v1`, JSON. Wire rules and `server_now`: see `EVENTS_SCHEMA.md` section 1.
Every response body is an object with a top-level `server_now`; lists are
`{ "items": [..], "next_cursor": "..."|null, "server_now": "..." }`, single resources
`{ "data": {..}, "server_now": "..." }`. Errors (codes from `errors.json`):
```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Approval version is 3", "details": { "current_version": 3 },
             "request_id": "req_01J..." }, "server_now": "2026-10-29T08:42:00.151Z" }
```

## 1. Auth, scopes, workspace + mode separation

- First-party apps: Supabase Auth JWT (`Authorization: Bearer`). Claims: `sub`, `app_scopes`.
- MCP / third-party agents: OAuth 2.1 Authorization Code + PKCE (S256 only), public clients, DCR.
- Scopes:
  - `read`: all GETs, SSE, risk estimate/replay.
  - `trade`: all **practice** mutations. Implies `read`.
  - `trade:real`: required for anything with `mode=real`. **Never issued before Phase 7** (the token
    issuer has no code path that mints it; the DB rejects `real` rows anyway).
- Every resource is scoped by **`workspace_id` + `mode`**:
  - Workspace: path `/v1/workspaces/{ws}/...` (all endpoints below are relative to it).
  - Mode: query param `mode=practice|real` on every read and in the body of every write; default
    `practice`. `mode=real` -> `403 REAL_SOL_DISABLED` today (`403 FORBIDDEN_SCOPE` without `trade:real`).
  - DB: a `mode` column on workspaces, strategies, picks, positions, fills, events, approvals,
    portfolios, portfolio_snapshots, strategy_funnel_hourly, guard_changes, audit_log; each has
    `CHECK (mode = 'practice')` until the Phase 7 migration. RLS = workspace membership AND
    `mode_visible(mode)` (real rows require the `trade:real` claim).
  - Separate numbers: practice and real never share snapshots, funnels, stats or events.
- Roles: `owner` `admin` `trader` `viewer`; `viewer` is read-only whatever the token scopes.
- MCP can **propose** guard weakening / team actions but cannot decide them (`APPROVAL_REQUIRES_APP`).

## 2. Idempotency, versions, approval tokens

- `Idempotency-Key: <8..128 chars>` on every mutating request; stored in `api_idempotency`
  (user, key, request hash, response) for 24 h. Same key + same body -> stored response with
  `Idempotent-Replayed: true`; same key + different body -> `409 IDEMPOTENCY_KEY_REUSED`.
- Optimistic concurrency: strategies `rev` (`expected_rev`), approvals `version` (`expected_version`,
  which is Flutter's `expected_rev`). Mismatch -> `409 STRATEGY_REV_CONFLICT` / `409 VERSION_CONFLICT`.
- **Approval decision token**: opaque 128-bit random (`apt_` + 22 base64url chars), single-use, stored
  only as sha256 in `approval_tokens`, bound to (approval, user, issuing surface), TTL =
  `min(15 min, approval.expires_at)`. Minted by `issue_approval_token()` when a member with `trade`
  fetches a pending approval (`GET .../approvals/{id}` returns `decision_token` once per call) or by the
  push worker (one per device notification). Plaintext is never stored or logged.
- How the three fit together (all enforced in SQL `decide_approval()`):
  1. token -> authorisation for this user + natural idempotency key;
  2. same token (or same `Idempotency-Key`) + same decision -> `200` stored result, `replayed: true`
     (even if `expected_version` is now stale);
  3. token already used / approval decided differently -> `409 APPROVAL_ALREADY_DECIDED`;
  4. expired approval or token -> `409 APPROVAL_EXPIRED` (with `reason`);
  5. `expected_version != version` -> `409 VERSION_CONFLICT` (`current_version`);
  6. guard change whose `base_rev != strategy.rev` -> `409 STRATEGY_REV_CONFLICT`.

## 3. Pagination and filters
Lists: keyset `?cursor=&limit<=100`, newest first by `(created_at, id)`. Events: seq cursors
(`after_seq`, `before_seq`). Common filters, parsed by one function and reused by stats so numbers
match: `mode`, `strategy_id`, `window=1h|24h|7d|30d|all` (default `24h`) or `from`/`to`.

## 4. Endpoints

### 4.1 Auth (Supabase Auth + Edge Functions; public unless noted)
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/siws/nonce` | body `{address, domain, uri, chain_id: "solana:mainnet"}` -> `{nonce, message, issued_at, expires_at}`. Nonce 16-64 alnum, **5 min TTL, single-use, bound to domain + address** (`siws_nonces`). Rate limit 10/min/IP, 5/min/address. |
| POST | `/auth/siws/verify` | `{address, message, signature (base58 ed25519)}`. Steps: parse SIWS message (domain, address, uri, version 1, chain, nonce, issued-at, expiration); domain must equal the request Origin host allow-list; `consume_siws_nonce(nonce, address, domain)` atomically; verify ed25519 over the exact message bytes; upsert `auth_identities(provider='siws', subject=address)`; mint Supabase session. Errors `SIWS_NONCE_INVALID`, `SIWS_SIGNATURE_INVALID`. |
| POST | `/auth/email/otp/request` | `{email}` -> always `202 {sent: true, resend_after_s: 60}` (no account enumeration). 6-digit code, **10 min TTL**, stored as `HMAC-SHA256(OTP_PEPPER, email_norm || code)` in `email_otps`. Limits: resend >= 60 s apart, <= 5 codes/email/hour, <= 20 requests/IP/hour -> `429 RATE_LIMITED` with `retry_after_s`. |
| POST | `/auth/email/otp/verify` | `{email, code}`; constant-time compare against the latest unconsumed, unexpired code; wrong code increments `attempts`; 5 wrong -> `locked_until = now()+15 min` (`429 OTP_LOCKED`); success sets `consumed_at`, upserts identity, mints session. Errors `OTP_INVALID`, `OTP_LOCKED`. |
| POST | `/auth/telegram/verify` | Login Widget payload; HMAC-SHA256 with `sha256(bot_token)`; `auth_date` <= 10 min. `TELEGRAM_AUTH_INVALID`. |
| — | Google / Apple | native Supabase OAuth (PKCE) |
| GET | `/auth/identities` (read) | linked identities |
| POST | `/auth/identities/link`, DELETE `/auth/identities/{id}` (trade, app) | re-verify an existing method first; cannot remove last (`LAST_IDENTITY`) |
| POST | `/auth/webauthn/register/options`, `/auth/webauthn/register/verify` (trade, app) | registers a passkey for proof-of-confirmation (`webauthn_credentials`, public key only) |
| POST | `/auth/2fa/totp/enroll`, `/verify` (trade, app) | TOTP, Phase 7 prerequisite |
| — | `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke` | MCP OAuth 2.1 |

### 4.2 Workspace
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/me` | read | user, memberships, `scopes` |
| GET | `/workspaces/{ws}` | read | name, `modes_enabled: ["practice"]`, `paper_start_lamports`, TTL settings |
| POST | `/workspaces/{ws}/reset-practice` | trade | creates a `team_action` proposal |

### 4.3 Strategies (`/workspaces/{ws}/strategies`)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/?mode=&status=` | read | with `rev`, headline stats |
| POST | `/` | trade | `{mode, name, settings}`; settings validated by `config/strategy_settings.schema.json` + DB CHECK |
| GET | `/{id}` / `/{id}/revisions` | read | |
| PATCH | `/{id}` | trade | `{expected_rev, settings_patch}`. Non-weakening -> applied (`rev+1`). Weakening -> `202 {proposal}` (`guard_change`, 24 h) |
| POST | `/{id}/pause`, `/{id}/resume` | trade | `expected_rev` |
| POST | `/{id}/archive`, DELETE `/{id}` | trade | `retire_strategy()`; response `{expired_proposals: n}` |
| POST | `/{id}/guard-impact/estimate` | read | **Ships first (Phase 2).** Static estimate, < 50 ms: `{method: "static_v1", weakening, weakened_fields[], risk_level: low\|medium\|high\|critical, max_extra_passes, window_evaluated, reasons[]}` |
| POST | `/{id}/guard-impact` | read | **Full replay**, behind `GUARD_REPLAY_ENABLED` (off until p95 < 2 s holds in staging). Body `{settings_patch, window: "7d"}` (max 7 d, max 50k samples). Response `{window, samples, truncated, compute_ms, pass_before, pass_after, newly_passing, newly_blocked, newly_passing_rugged, newly_passing_labelled, newly_passing_avg_drawdown_pct, weakened_fields}`. When disabled or over budget: `503 REPLAY_UNAVAILABLE` and clients fall back to `/estimate`. Measured: 50k samples replay 172-180 ms CPU (release); cold DB fetch of 50k snapshots ~125 ms. |
| GET | `/{id}/funnel?mode=&window=` | read | from `strategy_funnel_hourly` |

### 4.4 Coins, picks, positions, fills, events
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/coins?mode=&strategy_id=&window=`, `/coins/{mint}`, `/coins/{mint}/trail?mode=&strategy_id=` | read | trail = events by `mint`, seq ordered |
| GET | `/picks?mode=&strategy_id=&stage=`, `/picks/{id}` | read | |
| GET | `/positions?mode=&state=open\|closed&strategy_id=&window=`, `/positions/{id}` | read | |
| POST | `/positions/{id}/sell` | trade | `{mode, sell_pct: "100"}` -> job; practice only |
| GET | `/fills?mode=&position_id=&window=` | read | `simulated: true` always until Phase 7 |
| GET | `/events?mode=&after_seq=&before_seq=&limit=&types=&strategy_id=&ck=` | read | seq cursor + `safe_seq` |
| GET | `/events/stream?mode=&after_seq=` | read | SSE |

### 4.5 Approvals (`/workspaces/{ws}/approvals`)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/?mode=&status=pending\|approved\|rejected\|expired&kind=` | read | pending sorted by `expires_at` |
| GET | `/{id}` | read (+trade to get a token) | `{..., version, expires_at, decision_token, decision_token_expires_at, server_now}` |
| POST | `/{id}/decision` | trade (+app for weakening/team actions; + proof for real) | below |
| POST | `/batch-decision` | trade | `buy_pick` only; per-item results |

```http
POST /v1/workspaces/1000.../approvals/3000.../decision
Idempotency-Key: 6f1c2b7e-...
{ "decision": "approve", "token": "apt_Q2x...", "expected_version": 1, "client": "web", "reason": null }
-> 200 { "data": { "proposal_id": "3000...", "status": "approved", "version": 2, "replayed": false },
         "server_now": "2026-10-29T08:42:00.151Z" }
```
Flutter: `supabase.rpc('decide_approval', {p_approval_id, p_token, p_decision, p_expected_rev, p_client, p_idempotency_key})`
returns the same object; errors are SQLSTATE `P04xx` with `message` = error code.

### 4.6 Proof-of-confirmation (Real SOL actions and Real guard weakening; disabled until Phase 7)
Flow: `POST /confirmations/challenge {action, target, payload_hash}` -> `{challenge_id, challenge (base64url 32 B), expires_at (2 min), rp_id, required: {webauthn: true, typed_name: "<strategy name>", hold_ms: 2500}}`,
then the action request carries `confirmation`:
```json
{ "confirmation": {
    "challenge_id": "c0ffee00-...",
    "webauthn": { "credential_id": "base64url", "client_data_json": "base64url", "authenticator_data": "base64url",
                  "signature": "base64url", "user_handle": "base64url|null" },
    "challenge": "base64url (echo)",
    "typed_confirmation": "Yumi · Graduated",
    "hold_duration_ms": 2610,
    "device": { "platform": "ios|android|web|macos|windows|linux", "app_version": "0.5.0", "model": "iPhone15,2",
                "attestation": null } } }
```
Server verification, in order (any failure -> no state change, audit row with `proof_kind` + failure):
1. `confirmation_challenges` row exists, `user_id = sub`, unused, unexpired; mark `used_at` (single use).
2. `action`/`target` equal the request; `payload_hash = sha256(canonical JSON of the exact change)`
   (so a confirmed diff cannot be swapped).
3. WebAuthn: `clientDataJSON.type = "webauthn.get"`, `challenge` equals the stored challenge,
   `origin` in the allow-list; `rpIdHash = sha256(rp_id)`; flags UP and UV set; credential belongs to the
   user; signature verifies with the stored COSE key over `authenticatorData || sha256(clientDataJSON)`;
   `sign_count` increases (else flag clone, reject).
4. `typed_confirmation` equals the current strategy name (NFC, case-sensitive) -> else `TYPED_CONFIRMATION_MISMATCH`.
5. `hold_duration_ms >= 2500` for real (1200 for practice hold-only flows) -> else `HOLD_TOO_SHORT`
   (client-reported, defence in depth only).
6. Real mode additionally needs `trade:real` scope + TOTP (`TWO_FACTOR_REQUIRED`).
7. Append `audit_log` with `proof_kind='webauthn'`, `proof_hash = sha256(canonical confirmation JSON)`,
   ip, user agent, device, `server_now`.

### 4.7 Portfolio and stats (single source of truth `portfolio_snapshots` / `portfolio_latest`)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/portfolio/overview?mode=` | read | latest snapshot (+ `as_of_seq`) |
| GET | `/portfolio/equity?mode=&window=72h&step=5m` | read | series from snapshots |
| GET | `/stats/strategies?mode=&window=` | read | pnl, win rate, max drawdown, avg hold |
| GET | `/stats/exits?mode=&strategy_id=&window=` | read | SQL `exit_stats()`, same filters as `/positions` |

### 4.8 Guard changes and audit
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/guard-changes?mode=&strategy_id=` | read | |
| POST | `/guard-changes/{id}/cancel` | trade, app | during cooldown (real only; disabled) |
| GET | `/audit-log?mode=&window=&action=` | read (owner/admin) | |

`audit_log` (append-only; UPDATE/DELETE/TRUNCATE blocked by trigger and revoked):
`id bigint identity, workspace_id, mode, actor_user, actor_kind, actor_via, action, target_type, target,
before jsonb, after jsonb, risk jsonb, proof_kind (webauthn|totp|typed|none), proof_hash bytea(32),
approval_id, request_id, ip inet, user_agent, device, server_now timestamptz (clock_timestamp), created_at`.

Real guard weakening (Phase 7, schema enforced now): mandatory 10 min cooldown (`cooldown_until >=
created_at + 10 min`) **and** mandatory 24 h auto-revert (`auto_revert_at = applied_at + 24 h`), cancel
allowed during cooldown, notifications to all devices + email, audit row with risk snapshot.

### 4.9 Health
`GET /healthz`, `GET /readyz` -> `{trading_mode: "paper", modes_enabled: ["practice"], live_executor: "disabled", server_now}`.
