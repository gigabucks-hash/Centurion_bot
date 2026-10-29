# Sentra REST API (contract v1.1.3)

v1.1.3 (2026-10-29): optional `reject_reason` on approval decisions (closed enum, reject only). See `CHANGELOG.md`.

v1.1.2 (2026-10-29): manual close (`fraction_bps`), positions/approvals carry `rev`, `practice_epoch` on
workspace/portfolio/position/fill, seq as int64 string, SSE under the workspace with `include=marks,clock`,
coin `decimals`/`token_program`/`quote_mint`, errors always objects, actor/channel from the JWT. See `CHANGELOG.md`.

Base `https://api.<domain>/v1`, JSON. Wire rules and `server_now`: see `EVENTS_SCHEMA.md` section 1.
Every response body is an object with a top-level `server_now`; lists are
`{ "items": [..], "next_cursor": "..."|null, "server_now": "..." }`, single resources
`{ "data": {..}, "server_now": "..." }`.

**Errors (Q15).** `error` is ALWAYS an object `{code, message, ...details, server_now}` (never a bare string);
details are flattened into it: read `error.<field>` (e.g. `error.next_allowed_at`, `error.current`, `error.field`), never `error.details.<field>`. Codes, HTTP status, SQLSTATE and `en`/`id` messages come from `errors.json`
(`kind: error|notice|skip`):
```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Stale rev; refetch and retry", "current_rev": 3, "base_rev": 2,
             "current": { "id": "apr_01J...", "rev": 3, "status": "approved" },
             "request_id": "req_01J...", "server_now": "2026-10-29T08:42:00.151Z" },
  "server_now": "2026-10-29T08:42:00.151Z" }
```
RPC (Supabase) errors: `PostgrestException.code` = SQLSTATE (`P0` + HTTP status, e.g. `P0409`),
`message` = the code, `details` = the same detail object as JSON text.

## 1. Auth, scopes, workspace + mode separation

- First-party apps: Supabase Auth JWT (`Authorization: Bearer`). Claims: `sub`, `app_scopes`, `sentra_client`
  (`web|mobile|desktop|mcp`, set by our access-token hook / MCP token minting).
- **Actor and channel always come from the token** (Q13): every RPC uses `auth.uid()` as the actor and
  `sentra_client` (or the push token's `issued_via = push`) as `via`. No RPC accepts `p_actor`, `p_via`,
  `p_client` or `p_user`. `p_device` (free-form device label) stays as optional metadata.
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
  - DB: a `mode` column on workspaces, strategies, picks, positions, fills, orders, events, approvals,
    portfolios, portfolio_snapshots, strategy_funnel_hourly, guard_changes, audit_log; each has
    `CHECK (mode = 'practice')` until the Phase 7 migration. RLS = workspace membership AND
    `mode_visible(mode)` (real rows require the `trade:real` claim).
  - Separate numbers: practice and real never share snapshots, funnels, stats or events.
- Roles: `owner` `admin` `trader` `viewer`; `viewer` is read-only whatever the token scopes.
- MCP can **propose** guard weakening / team actions but cannot decide them (`APPROVAL_REQUIRES_APP`).

## 2. Idempotency, revisions, approval tokens

- `Idempotency-Key: <8..128 chars>` on every mutating request (RPCs: `p_idempotency_key`). Stored with a
  hash of the request for 24 h. **Same key + same body -> the original response with `replayed: true`**
  (REST also sends `Idempotent-Replayed: true`); **same key + different body -> `422 IDEMPOTENCY_KEY_REUSED`**.
- Optimistic concurrency: see 2.1. Every mutable resource, approvals included, uses `rev`; clients send
  `If-Match: "<rev>"` or body `expected_rev` (RPC `p_expected_rev`). `expected_version` no longer exists.
- **Approval decision token**: opaque 128-bit random (`apt_` + 22 base64url chars), single-use, stored
  only as sha256 in `approval_tokens`, bound to (approval, user, issuing surface), TTL =
  `min(15 min, approval.expires_at)`. Minted by `issue_approval_token()` when a member with `trade`
  fetches a pending approval (`GET .../approvals/{id}` returns `decision_token` once per call) or by the
  push worker (one per device notification). Plaintext is never stored or logged.
- How they fit together (all enforced in SQL `decide_approval()`):
  1. `expected_rev` missing -> `428 PRECONDITION_REQUIRED` (every channel, push included);
  2. token -> authorisation for this user + natural idempotency key;
  3. same token (or same `Idempotency-Key`) + same decision -> `200` stored result, `replayed: true`
     (even if `expected_rev` is now stale);
  4. same `Idempotency-Key` + different decision -> `422 IDEMPOTENCY_KEY_REUSED`;
  5. token already used / approval decided -> `409 APPROVAL_ALREADY_DECIDED`;
  6. expired approval or token -> `409 APPROVAL_EXPIRED` (with `reason`);
  7. `expected_rev != rev` -> `409 VERSION_CONFLICT` (`current_rev`, `base_rev`);
  8. guard change whose `base_rev != strategy.rev` -> `409 STRATEGY_REV_CONFLICT`.

## 2.1 Revisions and the 409 conflict contract
- **Every mutable resource carries `rev`** (integer, +1 on every change): workspaces, strategies,
  portfolios, **positions**, **approvals**, guard changes, wallets (custody refs), members, the user profile,
  devices. Responses also send `ETag: "<rev>"`. `position.opened|updated|closed` carry the position `rev`.
- **Every write must name the revision it was based on**: header `If-Match: "<rev>"` **or** body
  `expected_rev`. Missing -> `428 PRECONDITION_REQUIRED`. There is no force-save and no server-side auto-merge.
- Stale write -> **409** with the merge data inside `error` (UX REVISION_CONFLICT S1/S2):
```json
{ "error": { "code": "STRATEGY_REV_CONFLICT", "message": "Strategy rev changed since this was based on it",
             "request_id": "req_01J...", "server_now": "2026-10-29T08:42:00.151Z",
             "current_rev": 9, "base_rev": 7,
             "changed_fields": ["peak_trail_pct", "status"],
             "changed_by": { "actor": "0000...000a", "via": "mobile", "device": "iPhone15,2" },
             "changed_at": "2026-10-29T08:40:12.004Z",
             "current": { "id": "2000...", "rev": 9, "name": "Yumi · AMM", "status": "paused", "mode": "practice", "settings": { } } },
  "server_now": "2026-10-29T08:42:00.151Z" }
```
  `GET .../strategies/{id}/revisions/{rev}` returns the merge base (3-way review: base / current / mine).
- **Real SOL guard loosening + stale write -> `409 CONFIRMATION_RESTART_REQUIRED`** (same body). The
  confirmation challenge used for that write is burned server-side; the client must re-run the complete
  confirmation (new challenge, WebAuthn, typed name, 2FA, 2.5 s hold). Cooldown (10 min) and auto-revert
  (24 h) are counted from the new confirmation. A pending guard change whose strategy is edited by someone
  else is cancelled (`guard.changed {status: cancelled}`) and a fresh request is needed.
- SQL: `update_strategy(p_strategy, p_expected_rev, p_patch, p_name?, p_status?, p_device?, p_challenge_id?)`
  is the only write path (direct `UPDATE` is revoked); `set_strategy_status(p_strategy, p_status, p_expected_rev)`
  wraps it. Errors: SQLSTATE `P0409`, MESSAGE = code, DETAIL = the `error` object's detail fields as JSON.
  `CONFIRMATION_RESTART_REQUIRED` is *returned* (raising would roll back the challenge burn) in exactly the
  REST shape: `{"error": {"code": "CONFIRMATION_RESTART_REQUIRED", "message", "server_now", current_rev, ...}}`.

### 2.2 RPC parameters clients send (complete list)
| RPC | Client params | Notes |
|---|---|---|
| `decide_approval` | `p_approval_id, p_token, p_decision ('approve'\|'reject'), p_expected_rev (required), p_idempotency_key?, p_reject_reason?, p_hold_ms?` | via = JWT claim / push token. `p_reject_reason` (1.1.3): `user_declined\|not_tradeable\|price_moved\|other`, reject only, default `user_declined`. `p_hold_ms`: required (>= 1200) to approve a weakening guard_change |
| `propose_guard_change` | `p_strategy, p_expected_rev, p_patch, p_device?` | the only path for a guard-weakening change; returns `{proposal, guard_change, server_now}`. `update_strategy` refuses weakening with `409 GUARD_WEAKEN_REQUIRES_APPROVAL` |
| `update_strategy` | `p_strategy, p_expected_rev, p_patch?, p_name?, p_status?, p_device?, p_challenge_id?` | |
| `set_strategy_status` | `p_strategy, p_status ('running'\|'paused'), p_expected_rev` | |
| `reset_practice` | `p_workspace` | REST `POST /v1/workspaces/{ws}/practice/reset` |
| `close_position` | `p_position_id, p_expected_rev, p_idempotency_key, p_fraction_bps? (1-10000, default 10000)` | REST `POST /v1/workspaces/{ws}/positions/{id}/close` |
| `register_device` | `p_device_id, p_platform, p_provider, p_token, p_app_version, p_locale?` | |
| `revoke_device` | `p_device_id` | |
| `exit_stats` | `p_workspace, p_strategy?, p_mode?, p_from?, p_to?` | read |
Service-only (API / workers, never clients): `issue_approval_token`, `request_account_deletion`,
`cancel_account_deletion`, `finalize_account_deletion`, `unlink_identity`, `complete_order_fill`, `fail_order`,
`revoke_device_token`, `expire_proposal`. These take an explicit `p_user` because the API has already verified it.

## 3. Pagination and filters
Lists: keyset `?cursor=&limit<=100` (default 50), newest first by `(created_at, id)`; `next_cursor` is opaque (base64url of the microsecond timestamp + id), `null` on the last page; a malformed cursor or one from another list -> `400 CURSOR_INVALID`. Implemented for positions, strategies, strategy revisions (by `rev`), coins (by last pick), picks, fills, guard-changes, audit-log (also `before_id`), practice resets, devices and approvals (`status=pending` pages soonest `expires_at` first; other filters newest `created_at` first). Events: seq cursors
(`after_seq`, `before_seq`; int64 **strings**, as are `next_after_seq`, `next_before_seq`, `safe_seq`). Common filters, parsed by one function and reused by stats so numbers
match: `mode`, `strategy_id`, `window=1h|24h|7d|30d|all` (default `24h`) or `from`/`to`.

## 4. Endpoints

### 4.1 Auth (public unless noted)

**MVP (Boss, 2026-10-29): private single-owner app, wallet login only (SIWS / Phantom).** Implemented by the API
(`services/backend/api/src/routes_auth.ts`, migration `0011_siws_sessions.sql`):

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/auth/siws/nonce` | Body `{address, domain, uri?, chain_id?: "solana:mainnet"}` -> `200 {data: {nonce, message, issued_at, expires_at}}`. `domain` must be in `AUTH_SIWS_DOMAINS` and equal the `Origin` host when one is sent; `uri` https on that domain (default `https://{domain}`). 32-char alnum nonce, **5 min, single-use, bound to domain + address** (`siws_nonces`). `OWNER_WALLETS` set and address not in it -> `403 FORBIDDEN_ROLE {reason: "wallet_not_allowed"}`. Limits 10/min/IP, 5/min/address -> `429 RATE_LIMITED {retry_after_s, limit, window_s}` + `Retry-After`. `AUTH_SIWS_DOMAINS` empty -> `503 UNAVAILABLE`. |
| POST | `/v1/auth/siws/verify` | Body `{address, message (exactly as returned), signature (base58, 64-byte ed25519), client?: web\|mobile\|desktop}`. Strict parse (any extra/changed line -> `401 SIWS_NONCE_INVALID {reason: "message"}`), expiry check, allowlist check, `consume_siws_nonce(nonce, address, domain)` (atomic; then a bad signature still burns it), ed25519 verify over the exact UTF-8 bytes with the address as public key (`401 SIWS_SIGNATURE_INVALID`), `siws_login(address)` (find/create user + `auth_identities(provider='siws')`). -> `200 {data: Session}`. Limits 10/min/IP, 5/min/address. Verification only: the server never holds keys or signs anything. |
| POST | `/v1/auth/session/refresh` | Body `{refresh_token}` -> `200 {data: Session}` with a NEW refresh token (rotation; same `session_id`). A rotated token presented again revokes the whole session family -> `401 UNAUTHENTICATED {reason: "refresh_reused"}`; revoked/expired/unknown -> `401 {reason: refresh_revoked\|refresh_expired\|refresh_invalid}`. Wallet no longer in `OWNER_WALLETS` -> family revoked, `403 FORBIDDEN_ROLE`. 30/min/IP. |
| POST | `/v1/auth/session/logout` | Body `{refresh_token}` -> `200 {data: {revoked: true}}` always (revokes the family if it exists). |

`Session = {access_token, token_type: "bearer", expires_in, expires_at, refresh_token ("srt_..."), refresh_expires_in,
session_id, user_id, address}`. Access token: HS256 with the API's JWT secret, `exp` = `AUTH_ACCESS_TTL_S` (default
900 s, 60-3600), claims `{iss: "sentra-api", sub, aud, role: "authenticated", app_scopes: ["read","trade"],
sentra_client, session_id, amr: ["siws"], wallet}`; never `trade:real`. Refresh token: opaque, `AUTH_REFRESH_TTL_S`
(default 30 d), stored as sha256 only (`auth_refresh_tokens`). Email OTP and Telegram are **dropped from the MVP**:
their routes answer `404` while `AUTH_EMAIL_OTP_ENABLED` / `AUTH_TELEGRAM_OIDC_ENABLED` are false (default) and
have no implementation; the rows below are kept as the earlier design.

| Method | Path | Notes (earlier design) |
|---|---|---|
| POST | `/auth/siws/nonce` | body `{address, domain, uri, chain_id: "solana:mainnet"}` -> `{nonce, message, issued_at, expires_at}`. Nonce 16-64 alnum, **5 min TTL, single-use, bound to domain + address** (`siws_nonces`). Rate limit 10/min/IP, 5/min/address. |
| POST | `/auth/siws/verify` | `{address, message, signature (base58 ed25519)}`. Steps: parse SIWS message (domain, address, uri, version 1, chain, nonce, issued-at, expiration); domain must equal the request Origin host allow-list; `consume_siws_nonce(nonce, address, domain)` atomically; verify ed25519 over the exact message bytes; upsert `auth_identities(provider='siws', subject=address)`; mint Supabase session. Errors `SIWS_NONCE_INVALID`, `SIWS_SIGNATURE_INVALID`. |
| POST | `/auth/email/otp/request` | `{email}` -> always `202 {sent: true, resend_after_s: 60}` (no account enumeration). 6-digit code, **10 min TTL**, stored as `HMAC-SHA256(OTP_PEPPER, email_norm || code)` in `email_otps`. Limits: resend >= 60 s apart, <= 5 codes/email/hour, <= 20 requests/IP/hour -> `429 RATE_LIMITED` with `retry_after_s`. |
| POST | `/auth/email/otp/verify` | `{email, code}`; constant-time compare against the latest unconsumed, unexpired code; wrong code increments `attempts`; 5 wrong -> `locked_until = now()+15 min` (`429 OTP_LOCKED`); success sets `consumed_at`, upserts identity, mints session. Errors `OTP_INVALID`, `OTP_LOCKED`. |
| POST | `/auth/telegram/nonce` | **Design-only, behind `AUTH_TELEGRAM_OIDC_ENABLED=false`** (install waits on Boss's security-review approval). Body `{device_id, platform}` -> `{nonce, expires_at (5 min)}`. Our own single-use nonce (the native SDK has no nonce/state); stored hashed in `telegram_login_nonces`, bound to `device_id` + client IP prefix. Limit 10/min/IP. |
| POST | `/auth/telegram/verify` | Design-only (same flag). Body `{nonce, id_token, device_id}`. Edge Function `auth-telegram-oidc` (we do **not** use Supabase's custom OIDC provider): verify JWS against `https://oauth.telegram.org/.well-known/jwks.json` (RS256 or ES256 only; `kid` cache 1 h, on unknown `kid` refetch at most once per 5 min, fail closed); `iss = https://oauth.telegram.org`, `aud = TELEGRAM_CLIENT_ID`, `exp > now`, `now - iat <= 120 s` (clock skew 30 s); if the token carries `nonce` it must equal ours; consume our nonce atomically (`consume_telegram_nonce`, bound to device_id); record `sha256(id_token)` once (`telegram_id_token_uses`) so the same token cannot be replayed; require claim `id` (scope `profile`) else `AUTH_TG_NO_PROFILE`; rate limit 10/min/IP and 5/min per `sub`; upsert `auth_identities(provider='telegram', subject=id)`; mint Supabase session (admin API). Errors `AUTH_TG_INVALID`, `AUTH_TG_REPLAY`, `AUTH_TG_NO_PROFILE`, `RATE_LIMITED`. The v1.0 Login Widget HMAC path (`TELEGRAM_AUTH_INVALID`) is retired. |
| — | Google / Apple | native Supabase OAuth (PKCE) |
| GET | `/auth/identities` (read) | linked identities |
| POST | `/auth/identities/link` (app) | re-auth with an existing method first (session <= 5 min); an IdP identity owned by another account -> `409 CONFLICT`, never auto-merged |
| DELETE | `/auth/identities/{id}` (app) | `If-Match` + re-auth (`REAUTH_REQUIRED` 401); SQL `unlink_identity()`; emails every verified address; audited. The **last login method -> `422 LAST_LOGIN_METHOD`** (DB trigger, not just the UI). Unlinking the SIWS login wallet never touches the trading wallet and vice versa |
| POST | `/auth/reauth` | re-verify any linked method -> `{reauth_at}` claim in the session (valid 5 min) for unlink, deletion, Real switches |
| POST | `/auth/webauthn/register/options`, `/auth/webauthn/register/verify` (trade, app) | registers a passkey for proof-of-confirmation (`webauthn_credentials`, public key only) |
| POST | `/auth/2fa/totp/enroll`, `/verify` (trade, app) | TOTP, Phase 7 prerequisite |
| — | `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke` | MCP OAuth 2.1 |

### 4.2 Workspace
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/me` | read | user, memberships, `scopes` |
| GET | `/workspaces/{ws}` | read | `WorkspaceWire`: `{id, name, rev, modes_enabled: ["practice"], practice_epoch, practice_start_lamports, ...TTL settings}` |
| POST | `/workspaces/{ws}/practice/reset` | trade | Body `{}` + `Idempotency-Key`. SQL `reset_practice(p_workspace uuid)` (one signature; a direct user action, **not** a proposal): archives the current epoch (positions closed with `practice_reset` + `archived_at`; fills/snapshots stay under their old `practice_epoch`), expires pending buys (`practice_reset`), restores **30 SOL** (`"30000000000"`), resets first-buy flags, emits `practice.reset`, audits. `200 {epoch, starting_balance_lamports, archived, next_allowed_at, server_now}`. Once per 24 h: `429 RESET_COOLDOWN` with `error.next_allowed_at` (flat in the error object, + `Retry-After`). Practice only (`MODE_NOT_ALLOWED`). |
| GET | `/workspaces/{ws}/practice/resets` | read | reset history; `?epoch=` on positions/fills/equity reads archived epochs |

### 4.3 Strategies (`/workspaces/{ws}/strategies`)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/?mode=&status=` | read | with `rev`, headline stats |
| POST | `/` | trade | `{mode, name, settings}`; settings validated by `config/strategy_settings.schema.json` + DB CHECK |
| GET | `/{id}` / `/{id}/revisions` | read | |
| PATCH | `/{id}` | trade | `If-Match` or `{expected_rev}` + `{settings_patch}` (JSON merge at the top level; `null` removes a key; nested objects such as `guard_checks` are replaced whole). Non-weakening -> applied (`200`, `rev+1`). **Weakening** (any guard field less strict, per SQL `guard_weakened_fields()`) -> **`202 {data: {proposal: ApprovalWire, guard_change: GuardChangeWire}}`** + `Location: /approvals/{id}`; **nothing is applied**; the whole patch (mixed strengthen + weaken too) becomes one `guard_change` proposal (24 h expiry, `base_rev` = current rev). A weakening patch cannot carry `name`/`status` (422). MCP may propose; only first-party apps decide. Stale -> 409 (2.1) |
| GET | `/{id}/revisions`, `/{id}/revisions/{rev}` | read | history and merge base |
| POST | `/{id}/pause`, `/{id}/resume` | trade | `If-Match` / `expected_rev` (status changes bump `rev`) |
| POST | `/{id}/archive`, DELETE `/{id}` | trade | `retire_strategy()`; response `{expired_proposals: n}` |
| POST | `/{id}/guard-impact/estimate` | read | **Ships first (Phase 2).** Static estimate, < 50 ms: `{method: "static_v1", weakening, weakened_fields[], risk_level: low\|medium\|high\|critical, max_extra_passes, window_evaluated, reasons[]}` |
| POST | `/{id}/guard-impact` | read | **Full replay**, behind `GUARD_REPLAY_ENABLED` (off until p95 < 2 s holds in staging). Body `{settings_patch, window: "7d"}` (max 7 d, max 50k samples). Response `{window, samples, truncated, compute_ms, pass_before, pass_after, newly_passing, newly_blocked, newly_passing_rugged, newly_passing_labelled, newly_passing_avg_drawdown_pct, weakened_fields}`. When disabled or over budget: `503 REPLAY_UNAVAILABLE` and clients fall back to `/estimate`. Measured: 50k samples replay 172-180 ms CPU (release); cold DB fetch of 50k snapshots ~125 ms. |
| GET | `/{id}/funnel?mode=&window=` | read | from `strategy_funnel_hourly` |

### 4.4 Coins, picks, positions, fills, events
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/coins?mode=&strategy_id=&window=`, `/coins/{mint}`, `/coins/{mint}/timeline?mode=&strategy_id=` | read | `CoinWire`: coin carries `decimals` (integer, from the mint account; never assume 6), `token_program`, `quote_mint` (null = SOL), and (1.1.4) `market_cap_lamports` / `mcap_usd` / `mcap_as_of` (below); timeline = events by `mint`, seq ordered |
| GET | `/picks?mode=&strategy_id=&stage=`, `/picks/{id}` | read | `PickWire`; market cap as of the pick (fields below) |
| GET | `/positions?mode=&state=open\|closed&strategy_id=&window=&epoch=`, `/positions/{id}` | read | `PositionWire` (= SQL `position_wire()`): `rev`, `practice_epoch`, `qty_raw`, `decimals`, `token_program`, `cost_basis_lamports`, ... |
| POST | `/positions/{id}/close` | trade | Manual sell, practice only. Headers `If-Match: "<position rev>"` (or body `expected_rev`) + `Idempotency-Key`. Body `{fraction_bps?: 1-10000 (default 10000 = all)}`. SQL `close_position()`. `200 ClosePositionResponse {position (rev at request time), order: OrderWire, order_id, fill: null\|FillWire (only if the simulated fill completed synchronously), job_id (int64 string, if async), status: queued\|filled\|failed, replayed, server_now}`. Then `order.submitted` -> `fill.simulated` + `position.updated` (partial, new rev) or `position.closed` (`exit_reason: manual`) + `order.filled`; or `order.failed`. Errors `404 NOT_FOUND`, `403 FORBIDDEN_ROLE`, `403 MODE_NOT_ALLOWED`, `422 INVALID_FRACTION`, `409 POSITION_ALREADY_CLOSED`, `428 PRECONDITION_REQUIRED`, `409 VERSION_CONFLICT {current_rev, base_rev, current}`, `422 IDEMPOTENCY_KEY_REUSED`. `sell_pct` is gone everywhere. |
| GET | `/orders/{id}`, `/jobs/{job_id}` | read | `OrderWire`, `JobWire` (poll if you do not consume the stream) |
| GET | `/fills?mode=&position_id=&window=` | read | `simulated: true` always until Phase 7 |
| GET | `/events?mode=&after_seq=&before_seq=&limit=&types=&strategy_id=&ck=` | read | seq cursor (strings) + `safe_seq` |
| GET | `/events/stream?mode=&after_seq=&include=marks,clock` | read | SSE at **`/v1/workspaces/{ws}/events/stream`** (the old `/v1/events/stream` is removed). `id:` = seq string; `Last-Event-ID` honoured. `include=marks` adds `event: mark` frames (`MarkMessage`, same shape as Broadcast), `include=clock` adds `event: clock` frames every 5 s (`{server_now, safe_seq}`). See EVENTS_SCHEMA section 3 |

**Market cap (1.1.4)** on `CoinWire`, `PickWire`, `coin.detected`, `screener.scored`, `pick.created`
(TS `MarketCapFields`; SQL columns `coins/picks.market_cap_lamports, mcap_usd, mcap_as_of`):
- `market_cap_lamports`: integer string = price (SOL per whole token, from curve or pool state) x total supply
  (raw / 10^decimals, from the mint account) x 10^9. `null` when decimals or supply are unknown (never assumed).
- `mcap_usd`: decimal string or `null`, **display-only and indicative**: `market_cap_lamports` at the same
  configured SOL/USD reference the marks use (`MARKS_SOL_USD`, not a live feed). It is the exact value the
  screener's `mcap_usd` rule measured (`checks[].measured` for `mcap`), so the column and the check agree. When
  `market_cap_lamports` is null it is the data source's own figure, or null.
- `mcap_as_of`: ISO timestamp the inputs were observed; `null` when both values are null.

### 4.5 Approvals (`/workspaces/{ws}/approvals`)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/?mode=&status=pending\|approved\|rejected\|expired&kind=` | read | pending sorted by `expires_at` |
| GET | `/{id}` | read (+trade to get a token) | `{..., rev, expires_at, decision_token, decision_token_expires_at, server_now}` |
| POST | `/{id}/decision` | trade (+app for weakening/team actions; + proof for real) | below |
| POST | `/batch-decision` | trade | `buy_pick` only; per-item results |

**Approval resource (`ApprovalWire`, = SQL `approval_wire()`).** Returned by list/get (`data`), in `proposal.*`
event context, and as `proposal` in the 202 guard-change response. Every field is always present (`null` when unset):

| Field | Type | Meaning |
|---|---|---|
| `id` | uuid | Approval id (path `{id}`) |
| `proposal_id` | uuid | Same value as `id` (event payloads call it `proposal_id`) |
| `workspace_id` | uuid | Owning workspace |
| `strategy_id` | uuid \| null | Strategy the proposal belongs to |
| `kind` | `buy_pick \| guard_change \| team_action` | What is being approved |
| `mode` | `practice` | Always `practice` until Phase 7 (`approvals_practice_only`) |
| `subject` | string \| null | Kind-specific key: pick `ck` (buy_pick), strategy id (guard_change), position key / action |
| `mint` | base58 \| null | Coin for `buy_pick` |
| `amount_lamports` | integer string \| null | Buy size (`buy_pick`); `null` otherwise |
| `is_first_buy` | boolean | First buy of this strategy (drives `ask_first_buy`) |
| `risk` | `low \| medium \| high \| critical` | Server-assigned risk (guard_change: `guard_change_risk()`) |
| `weakening` | boolean | `true` = guard-weakening guard_change (needs the 1,200 ms hold) |
| `status` | `pending \| approved \| rejected \| expired` | Lifecycle |
| `rev` | integer >= 1 | Optimistic-concurrency revision; send as `If-Match` / `expected_rev` |
| `expire_reason` | `timeout \| strategy_deleted \| strategy_archived \| guard_failed \| price_moved \| practice_reset \| account_deleted` \| null | Set only when `status = expired` |
| `base_rev` | integer \| null | guard_change: strategy `rev` the patch was built on (applied only on exactly this rev) |
| `decision` | `approve \| reject` \| null | Set once decided (null for expired) |
| `reject_reason` | `ApprovalRejectReason` \| null | Only when rejected (default `user_declined`) |
| `decided_via` | `web \| mobile \| desktop \| mcp \| push` \| null | Channel from the JWT claim |
| `decided_by` | uuid \| null | Deciding user |
| `payload` | object | Kind-specific detail (guard_change: `{patch, weakened_fields, guard_change_id, ...}`; buy_pick: pick summary) |
| `created_at` | ISO ts | Created (ms precision, `Z`) |
| `expires_at` | ISO ts | Server-owned deadline (guard_change: created + 24 h) |
| `decided_at` | ISO ts \| null | When approved/rejected/expired |
| `est_network_fee_lamports` | integer string \| null | 1.1.4 quote: base + priority fee (estimate in practice) |
| `priority_fee_lamports` | integer string \| null | 1.1.4 quote: CU limit x CU price |
| `swap_fee_bps` | number \| null | 1.1.4 quote: swap fee |
| `max_slippage_bps` | number \| null | 1.1.4 quote: slippage cap |
| `min_out_raw` | integer string \| null | 1.1.4 quote: minimum tokens out, raw units |
| `total_max_lamports` | integer string \| null | 1.1.4 quote: SOL in + network fee (most the buy can cost) |
| `quote_ts` | ISO ts \| null | 1.1.4 quote: when estimated |
| `quote_expires_at` | ISO ts \| null | 1.1.4 quote: valid while `server_now < quote_expires_at` (papersim: +15 s) |

`ProposalWire` (TS) is the same type. Quotes are set or refreshed only while pending (`set_approval_quote`, backend
only; rev + 1, `proposal.updated`) and frozen once decided. **Real approve rule (1.1.4):** `decision: "approve"`
with `mode=real` and a missing quote or `quote_expires_at <= server now` -> `409 QUOTE_MISSING_OR_STALE
{quote_ts, quote_expires_at, missing, hint}` (retryable: refresh the quote, review, approve with the new rev).
Implemented in SQL `decide_approval` via `approval_quote_check(mode, quote_ts, quote_expires_at, now)`, so it
applies once Real exists; practice is never blocked by a missing or stale quote.

`GET /{id}` adds `decision_token`, `decision_token_expires_at` (with trade scope) and `server_now`.

```http
POST /v1/workspaces/1000.../approvals/3000.../decision
Idempotency-Key: 6f1c2b7e-...
If-Match: "1"
{ "decision": "approve", "token": "apt_Q2x...", "reason": null }
-> 200 { "data": { "proposal_id": "3000...", "status": "approved", "rev": 2, "reject_reason": null, "replayed": false },
         "server_now": "2026-10-29T08:42:00.151Z" }
```
**`reject_reason` (1.1.3)**: optional, only with `decision: "reject"`; closed enum `ApprovalRejectReason =
user_declined | not_tradeable | price_moved | other`, default `user_declined`. Unknown value, non-string, or sent
with `approve` -> `422 VALIDATION_FAILED {field: "reject_reason", allowed?}`. Stored on the approval
(`approval_wire().reject_reason`), carried in `proposal.rejected` (`reject_reason`; `null` on `proposal.approved`)
and in the audit row. Same `Idempotency-Key` with a different `reject_reason` is a different request -> `422 IDEMPOTENCY_KEY_REUSED`.
```http
{ "decision": "reject", "token": "apt_Q2x...", "reject_reason": "price_moved" }
-> 200 { "data": { "proposal_id": "3000...", "status": "rejected", "rev": 2, "reject_reason": "price_moved", "replayed": false }, ... }
```
Flutter: `supabase.rpc('decide_approval', {p_approval_id, p_token, p_decision, p_expected_rev, p_idempotency_key, p_reject_reason})`
returns `{proposal_id, status, rev, reject_reason, replayed, server_now}`; errors are SQLSTATE `P04xx` with `message` = error code.
No `client` / `p_client`: the channel comes from the JWT claim (`push` when the token was minted for a push).

**Guard-change proposals (practice).** Decide like any approval, plus for `decision: "approve"` on a weakening
proposal the body carries `"confirmation": {"hold_duration_ms": <int>}` from a **1,200 ms press-and-hold**:
missing -> `428 CONFIRMATION_REQUIRED {required: {hold_ms: 1200}}`; `< 1200`, or a decision token issued less than
1.2 s earlier (server-side check) -> `422 HOLD_TOO_SHORT {min_hold_ms: 1200}`. MCP -> `403 APPROVAL_REQUIRES_APP`.
On approve the patch is applied on exactly `base_rev` (else `409 STRATEGY_REV_CONFLICT` with `current`; ask for a
new proposal), the guard change becomes `applied`, and `strategy.updated {proposal_id}` + `guard.changed {status:
applied, to_rev}` are emitted. Reject -> `guard.changed {status: rejected}`; 24 h expiry -> `{status: expired}`.
Several pending proposals may exist; once one is applied the others fail with `STRATEGY_REV_CONFLICT`.
Real SOL guard weakening (Phase 7, rejected by the schema today: `guard_changes_practice_only`,
`approvals_practice_only`): proof-of-confirmation (4.6: WebAuthn, typed strategy name, 2.5 s hold) **and** TOTP 2FA
(`TWO_FACTOR_REQUIRED`), then a mandatory **10 min cooldown** (`cooling_down`, cancellable via
`POST /guard-changes/{id}/cancel`) before apply, and a mandatory **24 h auto-revert** (`auto_revert_at =
applied_at + 24 h`, CHECK-enforced), with notifications to every device plus email and an audit row with the risk
snapshot.

### 4.6 Proof-of-confirmation (Real SOL actions and Real guard weakening; disabled until Phase 7)
Flow: `POST /confirmations/challenge {action, target, payload_hash}` -> `{challenge_id, challenge (base64url 32 B), expires_at (2 min), rp_id, required: {webauthn: true, typed_name: "<strategy name>", hold_ms: 2500}}`,
then the action request carries `confirmation`:
```json
{ "confirmation": {
    "challenge_id": "c0ffee00-...",
    "webauthn": { "credential_id": "base64url", "client_data_json": "base64url", "authenticator_data": "base64url",
                  "signature": "base64url", "user_handle": "base64url|null" },
    "challenge": "base64url (echo)",
    "typed_confirmation": "Yumi · AMM",
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
| GET | `/portfolio/overview?mode=` | read | `PortfolioWire` = view `portfolio_latest` (below) |
| GET | `/portfolio/equity?mode=&window=72h&step=5m` | read | series from snapshots |
| GET | `/stats/strategies?mode=&window=` | read | pnl, win rate, max drawdown, avg hold |
| GET | `/stats/exit-reasons?mode=&strategy_id=&window=` | read | SQL `exit_stats()`, same filters as `/positions`; current practice epoch only; `practice_reset` closes excluded. Items: `ExitStatsRow` (below) |

`portfolio_latest` columns (view, current epoch; also the `portfolio.snapshot` payload minus `drawdown_pct`):
| column | wire type | notes |
|---|---|---|
| `workspace_id` | uuid | |
| `mode` | `practice` | |
| `practice_epoch` | integer | |
| `ts` | RFC 3339 | snapshot time |
| `cash_lamports`, `positions_cost_lamports`, `positions_value_lamports`, `equity_lamports`, `peak_equity_lamports` | lamport string | `equity = cash + positions_value` |
| `drawdown_bps` | integer | `(peak - equity) * 10000 / peak` |
| `realized_pnl_lamports`, `unrealized_pnl_lamports` | lamport string (may be negative) | `unrealized = value - cost` |
| `open_positions` | integer | |
| `as_of_seq` | int64 string | events.seq this snapshot reflects |

`exit_stats()` / `/stats/exit-reasons` row (one shape, Q13):
| field | wire type | notes |
|---|---|---|
| `exit_reason` | `ExitReason` | not `reason` |
| `count` | integer | closed positions |
| `pnl_lamports` | lamport string | sum of `sol_out - sol_in` |
| `avg_pnl_pct` | number \| null | 2 dp |
| `win_rate_pct` | number | 0-100, 2 dp |
| `avg_hold_s` | integer | seconds |

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

Login wallet vs trading wallet: the SIWS wallet is an **identity only** and never signs trades; the trading
wallet is a custody reference in `wallets` (`role='trading'`). The same address can never be both (DB triggers,
`409 WALLET_ROLE_CONFLICT`), and unlinking one never affects the other.

Real guard weakening (Phase 7, schema enforced now): mandatory 10 min cooldown (`cooldown_until >=
created_at + 10 min`) **and** mandatory 24 h auto-revert (`auto_revert_at = applied_at + 24 h`), cancel
allowed during cooldown, notifications to all devices + email, audit row with risk snapshot.

### 4.10 Devices and push tokens
| Method | Path | Scope | Notes |
|---|---|---|---|
| PUT | `/devices/{device_id}` | read | Register or rotate. Body `DeviceRegistration` `{platform: ios\|android\|web\|desktop, provider: fcm\|apns\|webpush, token, app_version (semver), locale (e.g. id-ID)}`; `device_id` = app-generated install id (8–128 `[A-Za-z0-9_-]`, kept in Keychain/Keystore). SQL `register_device()`. Call on login, on every app start, and on the SDK's token-refresh callback. Same `device_id` + new token replaces the old token (rotation); a token seen under another user moves to the caller. `200 {id, device_id, platform, rev, last_seen_at, server_now}`. Invalid -> `422 DEVICE_TOKEN_INVALID` |
| GET | `/devices` | read | own devices without the token (column-level revoke) |
| DELETE | `/devices/{device_id}` | read | revoke (logout, "sign out this device"). The worker also revokes on FCM `UNREGISTERED`/APNs 410 and after 60 days without `last_seen_at` |

Push payload: `EVENTS_SCHEMA.md` section 6 (data-only, approval token for practice buys only, deep link,
no secrets, Real SOL never actionable from a push).

### 4.11 Account deletion (App Store 5.1.1(v))
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/me/deletion` | read | `{state: active\|pending_deletion\|deleted, scheduled_for, rev, server_now}` |
| POST | `/me/deletion` | app | Requires re-auth <= 5 min (`REAUTH_REQUIRED`) and 2FA when enrolled. Body `{}`. The grace period is a **server-side setting** (`ACCOUNT_DELETION_GRACE_DAYS`, default 7, allowed **7–30**, decided by Apex as lead; out of range -> `422 VALIDATION_FAILED` `{range: "7-30"}`; clients cannot choose it) and is returned as `scheduled_for` / `grace_days`. Preconditions: no open Real positions, trading wallet withdrawn (`ACCOUNT_DELETION_BLOCKED`). SQL `request_account_deletion()`: state `pending_deletion`, `account.deletion_scheduled` event, confirmation email, audit. Already pending -> `409 ACCOUNT_DELETION_PENDING` |
| DELETE | `/me/deletion` | app | cancel at any time until `scheduled_for` (`cancel_account_deletion()`), event `account.deletion_cancelled` |
| — | worker | — | `finalize_due_account_deletions()` after `scheduled_for`: deletes identities, OTPs, passkeys, challenges, approval tokens, device tokens, memberships, display name; archives the user's strategies, closes owned workspaces, expires proposals (`account_deleted`); **audit_log rows are retained, anonymized by actor** (ip / user_agent / device nulled; actor id no longer resolves to a person); emits `account.deleted`; then the API deletes the `auth.users` row (hard delete of the login; trading history stays under the tombstoned id) |

### 4.9 Health
`GET /healthz`, `GET /readyz` -> `{mode: "practice", real_enabled: false, modes_enabled: ["practice"], live_executor: "disabled", contracts_version: "1.1.3", server_now}`.
(The `TRADING_MODE=paper` env gate and the `papersim` crate keep their internal names; nothing on the wire says `paper`.)

## 5. Strategy settings (v1.1.2; 1.1.4 adds `time_stop_s`, `stall_exit`)

**1.1.4 time-based exits** (both sell the whole position; absent or `null` = off; evaluated on marks by the exit
engine, `papersim::exits`; `time_stop_s` wins if both are due on the same mark):
- `time_stop_s`: integer seconds 1-604800; sell once the position has been held that long -> `exit_reason: max_hold`
  (the existing reason, v1.0 `time_out`).
- `stall_exit: {window_s, min_move_pct}`: `window_s` integer 5-86400, `min_move_pct` 0.01-100, both required, no
  other keys. Sell when |last price / price in force at the window start - 1| x 100 < `min_move_pct`; never before
  a full `window_s` since entry -> `exit_reason: stall` (new in 1.1.4; not the v1.0 `stall`, which is `no_new_high`).
Invalid values -> `422 VALIDATION_FAILED` (SQL `strategy_settings_valid`, CHECK violation).
JSON Schema: `services/backend/config/strategy_settings.schema.json`, generated together with the SQL CHECK
`strategy_settings_valid()` by `services/backend/scripts/gen_settings.py` (single source). All keys snake_case;
`bankroll_lamports` / `ticket_lamports` are lamport strings; every percentage/ratio/threshold is a JSON number.
Exit presets: `momentum_trail principal_recovery double_out three_step_ladder peak_giveback trail_stop_only
incremental_trim fast_half fixed_thirty new_high_timeout ratchet tightening_trail geometric_ladder`.
Exit keys: `stop_loss_pct` = hard stop measured from the **entry** price (v1.0 `stopLossPct`; 0 = off, else 5-49);
`peak_trail_pct` = trailing stop from the **peak** (0 = off, else 5-49); `exit_rules.loss_guards[]` items
`{at_loss_pct: 1-99 (below entry), sell_portion_pct: 0.01-100}` (max 8, no other keys); `profit_targets[]` items
`{at_gain_pct, sell_portion_pct, giveback_pct?}`.
v1.0 -> v1.1 key mapping: `CHANGELOG.md`.
