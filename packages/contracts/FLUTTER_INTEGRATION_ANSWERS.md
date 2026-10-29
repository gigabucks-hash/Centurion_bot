# Answers for Flutter (Phase 5 mobile), contract v1.1.2

To: Flutter Mobile Specialist. From: Backend API Specialist. Rewritten in full for **v1.1.2** (2026-10-29);
it replaces every earlier version of this file. Sources of truth: `errors.json`, `src/wire/events.ts`,
`EVENTS_SCHEMA.md`, `API_ENDPOINTS.md`, and the SQL in `services/backend/supabase/migrations/`.
All 16 mismatches you reported are resolved below (Apex/Boss decisions folded in).

## 1. Auth
- Google, Apple, email OTP: native Supabase Auth. SIWS: `POST /auth/siws/nonce` -> sign in the wallet app ->
  `POST /auth/siws/verify`. The login wallet is never a trading wallet.
- Telegram: **official OIDC id_token flow only** (design-only, `AUTH_TELEGRAM_OIDC_ENABLED=false`):
  `POST /auth/telegram/nonce {device_id, platform}` -> native Telegram login -> `POST /auth/telegram/verify
  {nonce, id_token, device_id}`. Errors `AUTH_TG_INVALID`, `AUTH_TG_REPLAY`, `AUTH_TG_NO_PROFILE`, `RATE_LIMITED`.
  The Login Widget HMAC path and `TELEGRAM_AUTH_INVALID` are removed.
- Your JWT carries `sentra_client: "mobile"`. **Every RPC takes the actor from the JWT (`auth.uid()`) and the
  channel from that claim.** You never send `p_actor`, `p_via`, `p_client` or `p_user`.

## 2. Exactly which params you send
| RPC | Params | Returns |
|---|---|---|
| `decide_approval` | `p_approval_id, p_token, p_decision ('approve'\|'reject'), p_expected_rev (required, the approval `rev`), p_idempotency_key?, p_reject_reason? (1.1.3: user_declined\|not_tradeable\|price_moved\|other, reject only, default user_declined)` | `{proposal_id, status, rev, reject_reason, replayed, server_now}` |
| `update_strategy` | `p_strategy, p_expected_rev, p_patch?, p_name?, p_status?, p_device? (label, metadata only), p_challenge_id?` | strategy `{id, rev, name, status, mode, settings, server_now}` or the restart error object |
| `set_strategy_status` | `p_strategy, p_status ('running'\|'paused'), p_expected_rev` | same as above |
| `reset_practice` | `p_workspace` | `{epoch, starting_balance_lamports, archived, next_allowed_at, server_now}` |
| `close_position` | `p_position_id, p_expected_rev (position rev), p_idempotency_key, p_fraction_bps? (1-10000, default 10000)` | `ClosePositionResponse` (section 6) |
| `register_device` | `p_device_id, p_platform, p_provider, p_token, p_app_version, p_locale?` | `{id, device_id, platform, rev, last_seen_at, server_now}` |
| `revoke_device` | `p_device_id` | boolean |
| `exit_stats` | `p_workspace, p_strategy?, p_mode?, p_from?, p_to?` | rows (section 8) |
REST equivalents: `POST /v1/workspaces/{ws}/approvals/{id}/decision`,
`POST /v1/workspaces/{ws}/practice/reset`, `POST /v1/workspaces/{ws}/positions/{id}/close`.
Practice reset is a direct action. It is **not** a `team_action` proposal.

## 3. Revisions, If-Match, idempotency
- Every mutable resource carries `rev` (strategies, approvals, positions, devices, workspaces, ...).
  REST writes send `If-Match: "<rev>"` or body `expected_rev`; RPCs send `p_expected_rev`. `expected_version`
  no longer exists anywhere. Missing -> `428 PRECONDITION_REQUIRED` (SQLSTATE `P0428`).
- `decide_approval` requires `p_expected_rev` for every channel, **push included**; null is rejected.
- **Idempotency:** same key + same body -> the original response with `replayed: true`; same key + different
  body -> `422 IDEMPOTENCY_KEY_REUSED` (`P0422`). Same decision token + same decision also replays.
- Stale write -> `409` with merge data inside the error object: `current_rev`, `base_rev`, `changed_fields`,
  `changed_by {actor, via, device}`, `changed_at`, `current`. Show the conflict, adopt `current`, refetch;
  never retry blindly. `CONFIRMATION_RESTART_REQUIRED` (Real only, Phase 7) has the same shape.

## 4. Errors
- `errors.json` (v4) is the single registry. Each code has `kind` (`error|notice|skip`), `http`, `sqlstate`
  (`P0` + HTTP status: `P0401`..`P0429`, `P0500`, `P0503`; 5xx codes are `P05xx`, not `P04xx`), `retryable`,
  and `messages.en` / `messages.id` (show `id` for `id-ID`). Generate Dart from it (or ask me to add a Dart
  target to `scripts/gen-errors.mjs`).
- RPC errors: `PostgrestException.code` = sqlstate, `.message` = the code, `.details` = JSON text of the details.
  REST: `{error: {code, message, ...details, server_now}, server_now}`; `error` is always an object.
- `MODE_NOT_ALLOWED`: "Only practice mode is allowed; real mode is not enabled". Wire modes are
  `practice | real`; nothing on the wire says `paper` (healthz: `{mode: "practice", real_enabled: false}`).
- New in 1.1.2: `POSITION_ALREADY_CLOSED` (409), `INVALID_FRACTION` (422), `UNSUPPORTED_QUOTE_MINT`,
  `SLIPPAGE_EXCEEDED`, `INSUFFICIENT_PRACTICE_BALANCE`, `GUARD_FAILED`, `POOL_STALE`, and notice codes
  `PRACTICE_CASH_INSUFFICIENT`, `JOB_DEAD_LETTERED`, `SOURCE_DEGRADED`.

## 5. Approvals and expiry
- Token: opaque `apt_…`, single-use, TTL `min(15 min, expires_at)`, from `GET .../approvals/{id}`
  (`decision_token`) or the push payload. Never construct it.
- Status: `pending | approved | rejected | expired` (UI "Skipped" = `rejected`). Kinds: `buy_pick | guard_change | team_action`.
- **Canonical `proposal.expired.reason` wire values** (exact strings): `timeout`, `strategy_deleted`,
  `strategy_archived`, `guard_failed`, `price_moved`, `practice_reset`, `account_deleted`.
  `reset_practice` expires pending and approved-but-unexecuted buys with `practice_reset`; account deletion
  expires every open proposal with `account_deleted`. Both are covered by SQL tests.
- `proposal.created` carries `{proposal_id, kind, rev, mint, symbol (untrusted text), price_sol, amount_lamports,
  expires_at, first_buy, approval_mode, ...}`; `proposal.*` payloads use `rev` (not `version`).
- The backend owns `expires_at`. Countdowns are `expires_at - (now + skew)`, with skew from `server_now`.

## 6. Manual sell (close a position)
`POST /v1/workspaces/{ws}/positions/{id}/close` with `If-Match: "<position rev>"`, `Idempotency-Key`, body
`{fraction_bps}` (integer 1-10000; 10000 = sell all), or RPC `close_position(...)` (section 2). Practice only.
Response:
```json
{ "position": { "id": "6000…", "rev": 2, "practice_epoch": 0, "qty_raw": "1000000000", "decimals": 6, "...": "…" },
  "order": { "id": "7a1…", "status": "queued", "fraction_bps": 5000, "job_id": "41", "...": "…" },
  "order_id": "7a1…", "fill": null, "job_id": "41", "status": "queued", "replayed": false,
  "server_now": "2026-10-29T10:00:00.000Z" }
```
Then events: `order.submitted` -> `fill.simulated` -> `position.updated` (partial; new `rev`) or
`position.closed` (`exit_reason: "manual"`) -> `order.filled`; on rejection `order.failed {reason_code}`.
Errors: `INVALID_FRACTION`, `POSITION_ALREADY_CLOSED`, `VERSION_CONFLICT` (with `current`), `PRECONDITION_REQUIRED`,
`IDEMPOTENCY_KEY_REUSED`, `FORBIDDEN_ROLE`, `MODE_NOT_ALLOWED`. `sell_pct` is gone.

## 7. Stream, seq, marks
- Realtime `postgres_changes` on `public.events` (RLS) plus Broadcast `marks:<ws>:<mode>` (`mark`, `clock`).
- **`seq` is an int64 integer string** (envelope `seq`, `after_seq`, `before_seq`, `next_after_seq`,
  `safe_seq`, `as_of_seq`, SSE `id`). Parse it with `BigInt.parse`.
- Resume only from REST `next_after_seq`, SSE `id` or `clock.safe_seq`.
- SSE (if you need it): `/v1/workspaces/{ws}/events/stream?mode=practice&include=marks,clock`.
- Units: lamports/raw amounts/int64 ids are integer strings; prices are decimal strings; pct/ratio/bps/usd/score
  are numbers; `decimals` is an integer from the mint account (never assume 6).

## 8. Portfolio and exit stats
- `portfolio_latest` / `GET .../portfolio/overview` columns: `workspace_id, mode, practice_epoch, ts,
  cash_lamports, positions_cost_lamports, positions_value_lamports, equity_lamports, peak_equity_lamports,
  drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq` (lamports and
  `as_of_seq` are strings).
- `exit_stats()` = `GET .../stats/exit-reasons`, one shape: `{exit_reason, count, pnl_lamports (string),
  avg_pnl_pct, win_rate_pct (0-100), avg_hold_s}`. The key is **`exit_reason`**, not `reason`.

## 9. Push (FCM data message)
**Every value in `data` is a string.** `v`, `seq`, `version` are base-10 integer strings; `actions` and `vars`
are JSON-encoded strings.
```json
{ "v": "1", "event": "N-01", "type": "proposal.created", "mode": "practice",
  "workspace_id": "1000…000a", "seq": "18301", "deep_link": "sentra://approvals/3000…000a",
  "approval_id": "3000…000a", "version": "1", "token": "apt_Q2x…", "exp": "2026-10-29T08:52:00.000Z",
  "actions": "[\"approve\",\"skip\",\"open\"]",
  "vars": "{\"symbol\":\"EXM\",\"strategy\":\"Yumi · AMM\",\"amount_lamports\":\"250000000\"}",
  "server_now": "2026-10-29T08:42:00.151Z" }
```
- `version` = approval `rev`: pass it as `p_expected_rev` when the user taps Approve or Skip.
- `vars.amount_lamports` is an integer string (format it with BigInt). There is no `vars.sol` and no
  `vars.mm_ss`: compute the countdown from `exp` and `server_now`.
- Real SOL is never actionable from a push (no token, `actions` `["open"]`).
- Devices: `register_device` on login, app start and token refresh; `revoke_device` on logout.

## 10. Settings keys you asked about
- `stop_loss_pct`: hard stop measured from the **entry** price (v1.0 `stopLossPct`; 0 = off, else 5-49).
- `peak_trail_pct`: trailing stop from the **peak** (0 = off, else 5-49). They are separate keys.
  The 1.1.0 rename table wrongly mapped `stopLossPct` to `peak_trail_pct`; corrected in 1.1.2.
- `exit_rules.loss_guards[]`: `{at_loss_pct 1-99, sell_portion_pct 0.01-100}`.

## 11. Real SOL confirmation (disabled until Phase 7)
WebAuthn + typed strategy name + 2.5 s hold + TOTP via `confirmations/challenge`. Nothing in practice needs it.

## 12. Account deletion
`GET/POST/DELETE /me/deletion`. Grace is server-side: 7–30 days, default 7 (decided by Apex as lead) and cancellable until `scheduled_for`.
