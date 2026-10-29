# Answers for Flutter (Phase 5 mobile)

To: Flutter Mobile Specialist. From: Backend API Specialist. Contract v1 (v1.1 update at the end). I adopted all six of Apex's
calls; refinements are noted inline. `ARCHITECTURE.md` was **not on disk** after the restore; these
answers are checked against `app/lib/data/models/models.dart` and `repositories/repositories.dart`.

## 1. Auth: Supabase Auth; Telegram and SIWS via Edge Functions that mint the JWT  - ADOPTED
- Google, Apple (required on iOS since Google is offered), email OTP: native Supabase Auth providers.
- Telegram: Edge Function `auth-telegram` verifies the Login Widget HMAC (bot token in env), `auth_date`
  <= 10 min, then upserts `auth_identities(provider='telegram')` and mints a session via the admin API.
  Mobile: open the Telegram login in an in-app browser / deep link back (`sentra://auth/telegram`).
- SIWS: `POST /auth/siws/nonce` -> sign message with Phantom / Solflare / Mobile Wallet Adapter ->
  `POST /auth/siws/verify`; ed25519 verify, nonce single-use 5 min (`siws_nonces`), domain + URI bound.
- The login wallet is **not** a trading wallet; no keys ever leave the wallet app.

## 2. Approvals model  - ADOPTED, aligned with `decide_approval(token)` and `expected_rev`
- Token: opaque `apt_` + 128-bit random, single-use, stored only as sha256, TTL = min(15 min, `expires_at`). You receive it
  from `GET /v1/workspaces/{ws}/approvals/{id}` (`decision_token`) or in the push data payload; never construct it.
- RPC: `decide_approval(p_approval_id uuid, p_token text, p_decision text ('approve'|'reject'), p_expected_rev int, p_client text, p_idempotency_key text default null)`
  returns jsonb `{proposal_id, status, version, replayed, server_now}`.
  `p_expected_rev` = the approval's `version` (your `baseRev` stays the *strategy* rev for guard changes).
- Idempotent: same token + same decision returns the same status (no error). Mismatch -> Postgres error
  with SQLSTATE `P04xx` and `MESSAGE` = an error code from the shared enum (`VERSION_CONFLICT`,
  `APPROVAL_ALREADY_DECIDED`, `APPROVAL_EXPIRED`, `APPROVAL_TOKEN_INVALID`, `STRATEGY_REV_CONFLICT`,
  `IDEMPOTENCY_KEY_REUSED`, `APPROVAL_REQUIRES_APP`). Precedence: token, mcp, role, replay, key reuse, already decided,
  expired, version, strategy rev. Map those to your
  `ConflictException`.
- Status wire values: `pending | approved | rejected | expired`. Your `ApprovalStatus.skipped` maps to
  wire `rejected` (keep the "Skipped" label).
- `ExpireReason` wire values: `timeout | strategy_deleted | strategy_archived | guard_failed | price_moved`
  (map your `timedOut`, `guardFailedWhileWaiting`, `priceRanPastLimit`).
- `ApprovalKind` wire: `buy_pick | guard_change | team_action`. `PickType` wire: `first_buy` boolean on
  the proposal plus `reentry` flag on the pick. `approval_mode` wire: `off | ask_first_buy | ask_every_buy`.
- The backend owns `expires_at` (10 min pick, 24 h guard change). The worker owns transitions;
  deleting/archiving a strategy expires its pending proposals in the same transaction and emits
  `proposal.expired {proposal_id, kind, version, reason, at}`. Ask mode also covers a portfolio's first buy.
- Clock: every RPC/REST response and stream payload carries `server_now`; render countdowns as
  `expires_at - (now + skew)`. Mode wire values are `practice | real` (not paper/live).

## 3. RPC error codes  - ADOPTED
Shared enum `packages/contracts/errors.json` (source), generated `src/wire/errors.ts` and Rust
`crates/common/src/error_codes.rs`. Please add a Dart generator (or I can add one to
`scripts/gen-errors.mjs`; tell me the target path). REST returns `{error:{code,...}}`; RPC raises with
the code as the message.

## 4. Mark price over Realtime Broadcast  - ADOPTED
Channel `marks:<workspace_id>:<mode>` (private), events `mark` (payload `MarkMessage`, decimal strings, with `server_now`)
and `clock` every 15 s `{server_now, safe_seq}`. Not
persisted, not in `seq`. Compute unrealized PnL locally from `qty_raw` and the mark for live display, but
use `portfolio.snapshot` / `GET /portfolio/overview` as the authoritative numbers. Drop your `double`
fields in favour of `Decimal` / `BigInt` (`solIn` -> `sol_in_lamports`).

## 5. Firebase push  - ADOPTED as an external dependency
Firebase project is owned by Boss's org account and set up at integration. Backend side: `outbox`
rows with `channel='push'` are delivered by a push worker via FCM HTTP v1 using a service account
from env (`FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON_PATH`). Device tokens table arrives with Phase 4
(`device_tokens`). Practice notifications may carry approve/skip actions that call `decide_approval`
with `p_client='push'`; Real SOL never actions from a notification.

## 6. Real SOL confirmation  - ADOPTED, all disabled until Phase 7
Server-side 2FA (TOTP, checked by the API) **plus** a WebAuthn/passkey assertion (platform biometric) over a server
challenge, typed strategy name and a 2.5 s hold; payload and verification steps in
`packages/contracts/API_ENDPOINTS.md` section 4.6. App Attest / Play Integrity are post-MVP add-ons. Today the DB CHECK rejects
`mode='real'` and the API returns `REAL_SOL_DISABLED`; build the UI flow behind a flag only.

## v1.1 update (2026-10-29), checked against `solbot_mobile/ARCHITECTURE.md`
1. **Telegram: official OIDC replaces the Login Widget** (design-only, `AUTH_TELEGRAM_OIDC_ENABLED=false` until Boss
   signs off the security review). Flow: `POST /auth/telegram/nonce {device_id, platform}` -> SDK login -> send
   `POST /auth/telegram/verify {nonce, id_token, device_id}`. Errors `AUTH_TG_INVALID`, `AUTH_TG_REPLAY`,
   `AUTH_TG_NO_PROFILE` (request the `profile` scope). Do not configure Supabase's custom OIDC provider.
2. RPCs: `decide_approval(p_approval_id, p_token, p_decision approve|reject, p_expected_rev, p_client,
   p_idempotency_key)` (no `device_id` argument; the token is bound to the device at issue).
   `set_strategy_status(p_strategy, p_status, p_expected_rev)` now exists. Strategy edits:
   `update_strategy(p_strategy, p_expected_rev, p_patch, ...)`; direct table UPDATE is revoked.
   Practice reset: `reset_practice(p_workspace)`. Devices: `register_device(p_device_id, p_platform, p_provider,
   p_token, p_app_version, p_locale)` / `revoke_device(p_device_id)` (replaces writing `device_tokens.fcm_token`).
3. Views: `v_portfolio_summary` -> `portfolio_latest`; `v_strategy_stats` -> `exit_stats()`; `equity_history` ->
   `portfolio_snapshots` (current `epoch`) or `GET .../portfolio/equity`.
4. Realtime: subscribe to `public.events` (one feed, seq ordered) instead of `postgres_changes` on positions /
   approvals / strategies; refetch rows on the event.
5. 409 handling: every write sends its `rev` (approvals `version`); conflicts return `current`, `changed_fields`,
   `changed_by`, `changed_at`; `CONFIRMATION_RESTART_REQUIRED` restarts the full Real confirmation.
6. Last login method: unlink returns `422 LAST_LOGIN_METHOD`; unlink/deletion need re-auth within 5 min
   (`REAUTH_REQUIRED`). The SIWS login wallet is never the trading wallet (`WALLET_ROLE_CONFLICT`).
7. Account deletion (App Store): `GET/POST/DELETE /me/deletion`; 7-day grace by default; events
   `account.deletion_scheduled|deletion_cancelled|deleted`.
8. Push payload: your data-only schema is adopted (`v=1, event=N-xx, mode, approval_id?, position_id?, token?,
   exp?, expire_reason?`) plus `type`, `workspace_id`, `seq`, `deep_link` (`sentra://...`), `actions`, `vars`,
   `server_now` (EVENTS_SCHEMA.md section 6). `expire_reason` uses wire values (`timeout guard_failed price_moved
   strategy_deleted strategy_archived practice_reset account_deleted`); map them to UX copy on device.
   Real SOL: no token, `actions: ["open"]` only.
9. Renamed vocabulary and snake_case settings: `CHANGELOG.md`. Error enum: your `tool/gen_errors.dart` from
   `errors.json` (`ERROR_CODES_VERSION` 2).
