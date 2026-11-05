# Contracts changelog

## 1.1.6 (2026-11-03): Centurion rename, coin logos, MCP error codes

- **`CONTRACTS_VERSION` is `1.1.6`.** The TS constant in `src/wire/events.ts` had lagged at `1.1.5`
  while the package and the API `/healthz` were already `1.1.6`; clients that mirror it must bump too
  (desktop `model.rs` / contract test).

**Repo-wide rename (no `sentra` left in code):** package `@centurion/contracts` (was the old codename package), env
`CENTURION_*` (e.g. `CENTURION_SESSION_SECRET`), JWT claim `centurion_client`, JWT iss `centurion-api`, DB GUCs
`centurion.*`, SSE NOTIFY channel `centurion_marks`, headers `X-Centurion-*`, deep links `centurion://...`, wallet
placeholder e-mails `@wallet.centurion.invalid`. SIWS legacy statement v1 text is now `Sign in to Centurion
(practice). ...` (v2 `Sign in to Centurion Trade` unchanged; v1 transition window unchanged). Older entries below were
rewritten in place to the new names. Clients import `@centurion/contracts` / `@centurion/contracts/wire`.

- **PnL card/report (additive, migration `0022_pnl_report.sql`; no version bump):** `PositionWire` closed rows
  now carry `pnl_lamports`, `pnl_pct`, `hold_seconds` (null while open), so the closed ledger and the receipt
  show a realized result without recomputing it client-side. One new read route `GET
  /stats/pnl?window=&strategy_id=` (default `7d`) returns unrealized, all-time realized, exact total, windowed
  realized, closed count, win rate, avg hold, fees and best/worst in one row. `GET /positions` finally honours
  the documented `window`/`from`/`to` filters (it did not before) and orders a closed list by `closed_at`.
  Realized definition is `sol_out - sol_in`, the same expression `exit_stats()` already used; `fees_lamports`
  is reported context and is no longer subtracted a second time in `position.closed`. See API_ENDPOINTS 4.4/4.7.
- **Coin logos (additive):** `logo_hash: string | null` + `logo_url: LogoUrl | null` on coin, pick and position wires;
  `logo_url` on approvals/proposals and on every event envelope that carries a mint. TS helpers `LOGO_SIZES`
  (48/64/96/128/192), `LogoSize`, `LogoFormat`, `logoSizeFor(px, dpr)`, `logoUrlFor(url, size, fmt)`. New route
  `GET /v1/img/coin/{mint}` (API_ENDPOINTS 4.12). Schema: migration `0019_coin_logos.sql` (`coin_logos`,
  `coin_logo_blocklist`).
- **New error codes** (errors.json `version` 7, 67 codes): `LOGO_NOT_FOUND` (404), `LOGO_REJECTED` (422); MCP/agent:
  `LOOSEN_REQUIRES_APP` (403; now a real code, see MCP_DESIGN), `RESUME_REQUIRES_APP` (403), `BUYS_PAUSED` (409),
  `AGENT_BUDGET_EXCEEDED` (429, retryable), `AGENT_TRADE_DISABLED` (403), `SIWS_SESSION_REQUIRED` (403),
  `AGENT_REQUEST_EXPIRED` (410). Generated `src/wire/errors.ts` + Rust `error_codes.rs`; Dart tables not yet
  regenerated (mobile).
- **Per-strategy Real gate (UX v2, additive):** strategy reads carry `real_locked: boolean`, `real_locked_reason:
  "needs_owner_approval" | "gate_not_met" | "policy" | "other" | null` and `paper_progress: {days_done, days_required,
  trades_done, trades_required}` (`*_required: number | null`, from settings `centurion.real_gate.min_paper_days` /
  `min_paper_trades`; null = not set by the owner, no value approved yet). `mode` stays `practice | real` (UI "Paper" =
  `practice`). Real is gated off: always `real_locked: true`, reason `needs_owner_approval`. TS:
  `StrategyRealGateFields`, `PaperProgress`, `RealLockedReason`, `REAL_LOCKED_REASONS`.
- **`MODE_NOT_ALLOWED` redefined** (403, same code/sqlstate): now means "this strategy is not approved for Real"
  (en "This strategy is not approved for Real mode", id "Strategi ini belum disetujui untuk mode Real"); was "only
  practice mode is allowed".
- **`logo_hash` next to `logo_url`** (desktop request): on `ApprovalWire` (required, nullable) and on the event
  envelope (`logo_hash?: string | null`, delivered with `logo_url` on SSE/REST, so it covers coin.detected and every
  coin payload). `logo_url` there now carries `&v={logo_hash}` when known.
- **Desktop deep-link hand-off (API_ENDPOINTS 4.1.1):** `siws/verify` with `code_challenge` (S256) + `state` returns
  `{code, expires_in: 60, expires_at, state, redirect_uri}` (no session); `POST /v1/auth/desktop/exchange {code,
  code_verifier}` -> Session. One-time code, 60 s, single use, `centurion://auth` only.
- Fix: `POST .../practice/reset` 200 `next_allowed_at` / `server_now` are now IsoTs (UTC, ms, `Z`); they were raw
  Postgres timestamps (session-zone offset, microseconds). The 429 detail and the `practice.reset` event were already IsoTs.
- **Push coin fields (EVENTS_SCHEMA §6):** coin pushes carry `mint` + `logo_hash` (strings; `logo_hash` omitted when
  there is no logo, never empty). `PushPayload.mint?`, `PushPayload.logo_hash?`; helper `coinLogoUrl(origin, mint,
  size, logo_hash)`. Logo variants: 16 KiB hard cap each (oversize variant omitted, next smaller served);
  `LOGO_PUBLIC_BASE_URL` unset = API-relative `logo_url`.
- MCP/OAuth (backend `api/src/mcp`, `api/src/oauth`, migrations 0020/0021): see `services/backend/docs/MCP_DESIGN.md`.

## 1.1.5 (2026-10-29, backend ef74131): quotes without rev bumps, sell quotes, Centurion Trade

Product name is now **Centurion Trade** in user-facing strings, docs, `/healthz` (`service`, `product`) and the SIWS
statement. Repo, crate, package, DB, JWT claim (`centurion_client`) and header (`X-Centurion-*`) names keep `centurion`.

- **`quote_id`** (int64 string) on `ApprovalWire` / `ProposalWire` / `proposal.updated`: `"0"` = never quoted, + 1 per
  refresh. **A quote refresh no longer bumps `rev`** (1.1.4 did), so decision tokens and push actions stay valid.
  Decisions accept `expected_quote_id`; SQL `decide_approval` gains `p_expected_quote_id bigint` (8 args).
- `409 QUOTE_MISSING_OR_STALE` details (TS `QuoteMissingOrStaleError`): `reason: missing|stale|mismatch`, `missing`,
  `quote_ts`, `quote_expires_at`, `quote_id`, `expected_quote_id`, `current: ApprovalWire`, `hint`. Real approve needs
  a fresh quote and the matching `expected_quote_id`; a mismatching id is refused in practice too.
- `POST /v1/workspaces/{ws}/approvals/{id}/quote` (trade): refresh, coalesced at 3 s; `GET .../approvals/{id}`
  auto-refreshes a stale pending quote; no background timer. `proposal.updated` <= 1 per proposal per 3 s, pending only.
- `decimals` and `token_program` on `ApprovalWire` / `ProposalWire` / `proposal.created` / `proposal.updated`;
  `position_id` on `ApprovalWire`.
- **`total_max_lamports`, exact:** buy = SOL in + `est_network_fee_lamports` (includes priority) +
  `est_ata_rent_lamports` (new: `"2039280"` when the token account does not exist, `"0"` when it does); the swap fee
  is taken from SOL in. Sell = `est_network_fee_lamports`.
- Sell quotes: `ProposalKind` gains `sell_position`; `expected_out_lamports`, `min_out_lamports` on approvals;
  `POST /v1/workspaces/{ws}/positions/{id}/close/preview` (read) -> `ClosePreview` (15 s TTL). papersim
  `estimate_sell`; shared Rust/TS quote vectors (`crates/papersim/tests/quote_vectors.json`).
- `mcap_source: curve|pool|unavailable` on every market-cap field set (`MarketCapFields`, coin/pick wires, events).
- Guard weakening: clients always use REST `PATCH` (202 + proposal); `409 GUARD_WEAKEN_REQUIRES_APPROVAL` from the
  `update_strategy` RPC is internal. Real: same flow + 2,500 ms hold (step-up in Phase 7). **An agent (MCP) cannot
  propose a loosening at all:** `403 FORBIDDEN_ROLE {reason: "agent_cannot_loosen"}`, no proposal row (SQL trigger
  on `approvals`). "MCP may propose" is removed everywhere; `LOOSEN_REQUIRES_APP` was never an error code.
- SIWS statement v2 = `Sign in to Centurion Trade` (UX key `auth.siws.statement`, default). v1 (Centurion) stays
  accepted until `AUTH_SIWS_LEGACY_STATEMENT_UNTIL` (default `2026-11-05T12:00:00Z`) unless
  `AUTH_SIWS_LEGACY_STATEMENT=false`; afterwards nonce `422`, verify on an old v1 nonce `401 SIWS_NONCE_INVALID
  {reason: "statement_retired"}`.
- Reserved for Phase 7 (types/docs only, never emitted): `real.*` payloads with flat `actor_type, user_id, device_id,
  device_label`; `real.kill_switch.cleared {..., signer_state: active|revoked}`; `real.sell_all.requested|completed`;
  limit keys `per_trade_lamports|daily_lamports|cap_lamports|max_positions|max_slippage_bps`; `WithdrawFailReason`
  (not in errors.json); `kill_switch_reason`; `proposal.expired.reason` `kill_switch`. EVENTS_SCHEMA §7.
- Schema: migration `0016_contracts_v1_1_5.sql` (`pool_states`, quote columns, 7-arg `approval_quote_check`).

## Unreleased: ingest (backend 01fd8b3, no wire-type change)

- `/readyz` adds `ingest_bytes_today {day_utc, sources: {<source>: {bytes, frames}}} | null` (bytes/day meter per
  source per UTC day; table `ingest_bytes_daily`, migration 0018).

## Unreleased: wallet login (backend, additive; no wire-type change)

- SIWS fails closed: no boot (exit 78) with SIWS enabled and an empty/invalid `OWNER_WALLETS`; empty list at runtime = no login.
- Login limits never hard-block the owner wallet (soft delay, `X-Centurion-Login-Delay-Ms`); strangers 403 then 429 per IP.
- SIWS hardening (mobile review): every message field stored with the nonce and compared exactly (B-3; mismatch burns
  the nonce); refresh grace 10 s returns the same successor pair (B-4); access tokens carry `sid`, checked per request,
  so logout ends them (B-5, `session_revoked`); `statement_version` on nonce request/response (B-7); access tokens
  signed with our own `CENTURION_SESSION_SECRET` (B-10); FLUTTER/WEB integration answers updated (B-8).
- SIWS verify returns `workspace_id`; the first login creates the owner's workspace (idempotent); users are created
  via the Supabase admin API in production.
- Rate limits on every write route (per IP, per user, per route), optional Postgres-backed counters (API_ENDPOINTS 2.3).

Private single-owner MVP: SIWS (Phantom) is the only login. New REST routes `POST /v1/auth/siws/nonce`,
`/v1/auth/siws/verify`, `/v1/auth/session/refresh`, `/v1/auth/session/logout` (API_ENDPOINTS 4.1), optional
`OWNER_WALLETS` allowlist, short-lived access tokens + rotating refresh tokens with reuse detection (migration
`0011_siws_sessions.sql`), per-IP / per-address rate limits (`429 RATE_LIMITED` + `Retry-After`). No new error
codes. Email OTP and Telegram login are dropped (flags default off, routes 404).

## 1.1.4 (2026-10-29)

Additive. `CONTRACTS_VERSION` = `1.1.4` (`healthz.contracts_version` too); per-event `version` stays `1`;
`ERROR_CODES_VERSION` = `6` (5 added GUARD_WEAKEN_REQUIRES_APPROVAL, 6 added QUOTE_MISSING_OR_STALE). Migrations
`0007_guard_weaken_requires_approval.sql`, `0008_guard_change_proposals.sql`, `0009_contracts_v1_1_4.sql`,
`0010_proposal_quote.sql`.

### Time-based exits
- Settings **`time_stop_s`** (integer seconds 1-604800, `null`/absent = off): sell the whole position once held that
  long. **exit_reason `max_hold`** (reused: it already means "held too long", v1.0 `time_out`).
- Settings **`stall_exit: {window_s, min_move_pct}`** (`null`/absent = off; `window_s` integer 5-86400,
  `min_move_pct` 0.01-100, both required): sell the whole position when |price change| over the last `window_s`
  is below `min_move_pct`; never before a full window since entry. **New exit_reason `stall`** (SQL enum value
  added in 0009; TS `ExitReason`/`EXIT_REASONS`; Rust `common::ExitReason::Stall`). No existing reason covered it:
  `idle` = no trades, `no_new_high` = no new high in time. Note: the v1.0 -> v1.1 table below still maps the v1.0
  name `stall` to `no_new_high`; the 1.1.4 `stall` is a different, new rule.
- Validated by `strategy_settings_valid()` (generated by `scripts/gen_settings.py`, now into 0009) and
  `config/strategy_settings.schema.json` (`$id` v1.1.4); evaluated by the new Rust exit module `papersim::exits`
  (`TimeExits`, `TimeExitClock`). `time_stop_s` wins if both are due on the same mark. TS: `ExitSettings.time_stop_s`,
  `ExitSettings.stall_exit`, `StallExit`.

### Market cap
- New fields **`market_cap_lamports`** (integer string; price x total supply / 10^decimals from curve or pool
  state; `null` when decimals or supply are unknown), **`mcap_usd`** (decimal string, nullable, display-only and
  indicative: same SOL/USD reference as marks) and **`mcap_as_of`** on `coin.detected`, `screener.scored`,
  `pick.created`, REST coins and picks (TS `MarketCapFields`, `CoinWire`, `PickWire`; SQL columns on `coins` and
  `picks`). One computation (`common::mcap`) feeds both these fields and the screener's `mcap_usd` metric, so the
  column and the check agree; when both exist, the computed value replaces a data source's own `mcap_usd`.
  Mint accounts now also yield `supply` (raw).

### Proposal quote (UX WF-22 transaction review sheet)
- Optional, nullable quote fields on `ApprovalWire` (TS alias `ProposalWire`), `proposal.created` and the new event
  **`proposal.updated`** (`{proposal_id, kind, rev, ...quote}`, emitted when a pending quote is set/refreshed):
  `est_network_fee_lamports`, `priority_fee_lamports`, `min_out_raw`, `total_max_lamports` (integer strings),
  `swap_fee_bps`, `max_slippage_bps` (JSON numbers), `quote_ts`, `quote_expires_at` (ISO). TS `ProposalQuoteFields`,
  `ProposalUpdated`; Rust `EventKind::ProposalUpdated`. Papersim fills them with estimates
  (`papersim::quote::estimate_buy`, 15 s validity). Migration `0010_proposal_quote.sql` (approvals columns,
  `set_approval_quote`, `approvals_guard` allows pending->pending quote-only refreshes and freezes quotes once decided).
- **New error `QUOTE_MISSING_OR_STALE`** (kind `error`, HTTP **409**, `P0409`, retryable; `ERROR_CODES_VERSION` = `6`):
  for `mode=real`, approve is refused when the quote is missing or `quote_expires_at <= server now`. Checked in SQL
  `decide_approval` (`approval_quote_check`, tested directly since Real rows are still schema-rejected). Practice is
  never blocked by a missing quote.

### Docs
- Flat error envelope wording: `RESET_COOLDOWN` carries `error.next_allowed_at` (not `details.next_allowed_at`),
  also in the `errors.json` en/id messages; API_ENDPOINTS states details are read as `error.<field>`.
- API_ENDPOINTS 4.5 documents the Approval resource (`ApprovalWire`) field by field; section 3 documents cursors.

### Guard weakening and proposals


- **New error `GUARD_WEAKEN_REQUIRES_APPROVAL`** (kind `error`, HTTP **409**, SQLSTATE `P0409`, not retryable).
  A strategy change that weakens any guard is **refused and nothing is applied** (REST `PATCH .../strategies/{id}`
  and RPC `update_strategy`), with flat details `{weakened_fields: string[], strategy_id, rev, hint}`.
  Strengthening-only and neutral changes still apply directly; a change mixing both is refused as a whole.
  The RPC `update_strategy` keeps refusing weakening; REST PATCH now turns it into a proposal (below).
- **Guard-change proposals (practice)**, migration `0008_guard_change_proposals.sql`: REST PATCH with a weakening
  patch -> `202 {data: {proposal: ApprovalWire, guard_change: GuardChangeWire}}`, nothing applied (RPC
  `propose_guard_change`). Approve needs `confirmation.hold_duration_ms >= 1200` (`p_hold_ms`) and a decision
  token >= 1.2 s old (`428 CONFIRMATION_REQUIRED` / `422 HOLD_TOO_SHORT`); applied on exactly `base_rev`.
  `guard.changed.status` gains `rejected | expired`; `strategy.updated` gains `proposal_id`. TS: `GuardChangeStatus`,
  `GuardChangeWire`, `GuardChangeProposed`, `ApprovalDecisionRequest.confirmation?`. `decide_approval` gains
  `p_hold_ms` (6-argument overload dropped). Real SOL path documented (API_ENDPOINTS 4.5), still schema-rejected.
- Classifier: SQL `guard_weakened_fields(old, new)` mirrors the Rust `guard::impact::weakened_fields` over the
  effective GuardConfig (`guard_config_defaults()` overlaid with `settings.guard_checks`; a Rust test keeps the
  defaults equal), plus settings-level guard keys: `*_share_pct_max` raised or turned off (0 / removed),
  `lp_burned_pct_min` lowered or removed, any `required_checks` entry removed. Screener keys
  (`score_threshold`, `liquidity_usd_min`, ...) are not guards.

## 1.1.3 (2026-10-29)

Additive. `CONTRACTS_VERSION` = `1.1.3` (`healthz.contracts_version` too); per-event `version` stays `1`;
`ERROR_CODES_VERSION` stays `4` (no new codes). Migration `0006_contracts_v1_1_3_reject_reason.sql`.

- **Approval reject reason.** Decide body (REST `POST .../approvals/{id}/decision`) gains optional
  `reject_reason`, a closed enum `ApprovalRejectReason = user_declined | not_tradeable | price_moved | other`,
  only for `decision: "reject"`, default `user_declined`. Unknown value or sent with `approve` ->
  `422 VALIDATION_FAILED {field: "reject_reason"}` (API and SQL). RPC: `decide_approval(..., p_reject_reason text
  default null)`; the 5-argument overload is dropped (named-argument calls without `p_reject_reason` still work).
- Stored as `approvals.reject_reason` (CHECK: only on rejected). Carried in `proposal.rejected.reject_reason`
  (`null` on `proposal.approved`), in the decision response (`reject_reason`), in `ApprovalWire`, and in the
  `approval.reject` audit row (`after.reject_reason`). A replay must match it: same key + other reason -> 422.
- TS: `ApprovalRejectReason`, `APPROVAL_REJECT_REASONS`, `ApprovalWire` (new; = SQL `approval_wire()`),
  `ApprovalDecisionRequest.reject_reason?`, `ApprovalDecisionResponse.reject_reason`, `ProposalDecided.reject_reason`.
- 409 bodies: `current` is **required** on every `VERSION_CONFLICT` / `STRATEGY_REV_CONFLICT` (the API_ENDPOINTS
  example was fixed in 1f24d28); `decide_approval` now sends it (migration 0005), and `ConflictError.request_id`
  is no longer optional.

## 1.1.2 (2026-10-29)

Breaking-but-early corrections from the Flutter (16 items) and Desktop (Q1–Q18) reviews. No producer has shipped
these payloads yet, so per-event `version` stays `1`. `CONTRACTS_VERSION` = `1.1.2`, `ERROR_CODES_VERSION` = `4`.
Migrations 0001/0002 were edited in place (never applied outside local test DBs); new objects are in 0003.

### Breaking
- **seq is an int64 integer string** on the wire: envelope `seq`, `after_seq`, `before_seq`, `next_after_seq`,
  `next_before_seq`, `safe_seq`, `as_of_seq`, `job_id`, and the SSE `id`. Rust accepts a JSON number on input.
- **SSE moved** to `GET /v1/workspaces/{ws}/events/stream?mode=` with optional `include=marks,clock`
  (`event: mark` / `event: clock` frames, same shapes as Broadcast). `/v1/events/stream` is removed.
- **Approvals use `rev`** (column, payloads, responses). `expected_version` is gone everywhere; send
  `If-Match: "<rev>"` or `expected_rev` (`p_expected_rev`). Required for every channel, including push.
- **Actor and channel come from the JWT**: removed `p_actor`, `p_via`, `p_client`, `p_user` from every
  client RPC (`decide_approval`, `update_strategy`, `reset_practice`, `register_device`, `revoke_device`).
  `via` = claim `centurion_client` (`web|mobile|desktop|mcp`) or `push` for push-minted tokens. `p_device` stays.
- `reset_practice(p_workspace uuid)` is the only signature (REST `POST /v1/workspaces/{ws}/practice/reset`).
  The old "reset as a team_action proposal" text is deleted everywhere.
- **Errors are always objects**: `{error: {code, message, ...details, server_now}, server_now}`; conflict
  details moved inside `error`. `CONFIRMATION_RESTART_REQUIRED` is returned by SQL in that exact shape.
- `IDEMPOTENCY_KEY_REUSED` is HTTP **422** (same key + different body); same key + same body replays the
  original response with `replayed: true`.
- **Exit stats** (`exit_stats()` and `/stats/exit-reasons`): one shape
  `{exit_reason, count, pnl_lamports (string), avg_pnl_pct, win_rate_pct (0-100), avg_hold_s}`. Uses
  `exit_reason`, not `reason`.
- Push data: every FCM `data` value is a string (`v`, `seq`, `version` integer strings; `actions`, `vars`
  JSON strings). `vars.sol` -> `vars.amount_lamports` (integer string); `vars.mm_ss` dropped (countdown =
  `exp - server_now`). Push carries `version` = approval rev.
- No `paper` on the wire: `workspaces.paper_start_lamports` -> `practice_start_lamports`;
  healthz `{mode: "practice", real_enabled: false, ...}`; `MODE_NOT_ALLOWED` message uses practice|real.
  (`TRADING_MODE=paper` env and the `papersim` crate keep their internal names.)
- `epoch` columns on positions/fills/portfolio_snapshots renamed `practice_epoch`.
- `sell_pct` is gone everywhere; manual close uses `fraction_bps`.

### Added
- **Coin facts (Q1):** `coin.detected` and coins carry `decimals` (integer, read from the mint account;
  never assumed 6), `token_program`, `quote_mint`. Ingest reads the mint account read-only
  (`getAccountInfo`); coins whose decimals are unknown are never filled (`order.failed POOL_STALE`).
- **Quote gate (screener-result extension, no new event):** `ScreenerResult` / `screener.scored` gain
  `tradeable`, `skip_reason`, `quote_mint`. Pool state is built from the pump.fun bonding-curve account
  (read-only RPC); a non-SOL quote is `tradeable: false, skip_reason: UNSUPPORTED_QUOTE_MINT` and papersim
  rejects it; prices are never converted. `PoolState.quote` / `quote_mint` on coin and pool wire types.
- **Manual close (Q7, Q9/Q16, Q12):** `POST /v1/workspaces/{ws}/positions/{id}/close` / RPC
  `close_position(p_position_id, p_expected_rev, p_idempotency_key, p_fraction_bps default 10000)`, practice
  only, If-Match on the position `rev`. Response `{position, order, order_id, fill|null, job_id, status,
  replayed, server_now}`. Wire types `OrderWire`, `JobWire`, `ClosePositionRequest/Response`. Events
  `order.submitted`, `order.filled`, then `fill.simulated` + `position.updated|closed (exit_reason manual)`.
  New codes `POSITION_ALREADY_CLOSED` (409), `INVALID_FRACTION` (422).
- **`order.failed` (N-05):** `{order_id, proposal_id, mint, side, amount_lamports, reason_code, detail, mode,
  server_now, ...}` with `reason_code` from errors.json (`SLIPPAGE_EXCEEDED`, `INSUFFICIENT_PRACTICE_BALANCE`,
  `GUARD_FAILED`, `UNSUPPORTED_QUOTE_MINT`, `POOL_STALE`, ...). Emitted by papersim on every rejected simulated
  fill and by `fail_order()`. New codes `UNSUPPORTED_QUOTE_MINT`, `SLIPPAGE_EXCEEDED`,
  `INSUFFICIENT_PRACTICE_BALANCE`, `GUARD_FAILED`, `POOL_STALE`.
- **Positions carry `rev`** (+1 on every change) and `cost_basis_lamports`; `position.opened|updated|closed`
  carry `rev`, `position_id`, `practice_epoch`. `position.updated` carries `qty_raw`, `cost_basis_lamports`,
  `avg_entry_price_sol`, `unrealized_pnl_lamports`, `rev` (Q3).
- **`practice_epoch` (Q18)** on workspace and portfolio responses, `portfolio.snapshot`, position and fill payloads.
- `proposal.created` carries `mint`, `symbol` (untrusted text), `price_sol`, `amount_lamports`, `kind`,
  `expires_at`, `rev` (Q8).
- `plan_state` has a concrete schema: `PlanState` with a discriminated `PlanStep` union (Q6). No `unknown`
  remains in the TS wire types (`JsonValue` instead).
- `FillWire` matches the example: `id`, `practice_epoch`, required `mid_price_sol` (decimal string),
  `price_impact_bps`, `created_at` (Q2).
- `proposal.expired` reasons `practice_reset` (from `reset_practice`) and `account_deleted` (from account
  finalization) are now SQL-tested end to end; canonical reason strings are documented.
- errors.json v4: every code has `kind` (`error|notice|skip`), `sqlstate` (`P0` + HTTP status: P04xx for 4xx,
  P0500/P0503 for 5xx) and `messages.en` / `messages.id`. It is the single registry, including
  `system.notice` codes (`PRACTICE_CASH_INSUFFICIENT`, renamed from the desktop's `PAPER_CASH_INSUFFICIENT`,
  `JOB_DEAD_LETTERED`, `SOURCE_DEGRADED`). Generators emit `sqlstate()`, `kind()`, `message_en/id()`;
  `scripts/check_error_codes.py` fails CI if a SQL raise disagrees with errors.json.
- Settings: `stop_loss_pct` restored (hard stop from **entry**, the meaning of v1.0 `stopLossPct`; 0 or 5-49),
  separate from `peak_trail_pct` (trail from **peak**). `exit_rules.loss_guards[]` items are defined:
  `{at_loss_pct 1-99, sell_portion_pct 0.01-100}` (schema, SQL CHECK, TS `LossGuard`) (Q14).

### Changed
- **Account deletion grace: 7–30 days, default 7**, decided by Apex as lead (matches UX i18n v0.4.1). Migration
  `0004_deletion_grace_7_30.sql` replaces the 1–30 check in `request_account_deletion()` (detail `"range":"7-30"`)
  and the `users_deletion_consistent` table CHECK. Grace 6 -> `422 VALIDATION_FAILED`; 7 and 30 accepted.

### Removed
- `TELEGRAM_AUTH_INVALID` (the Login Widget HMAC path is retired; use `AUTH_TG_*`).

### Fixed
- The v1.0 -> v1.1 table mapped `stopLossPct` -> `peak_trail_pct`. v1.0 `stopLossPct` was a fixed stop from
  entry (Web: "Hard stop loss from entry"), so it maps to `stop_loss_pct`; `peak_trail_pct` is a separate key.

## 1.1.1 (2026-10-29)

### Changed
- Account deletion grace period: default 7 days, **server-side** setting `ACCOUNT_DELETION_GRACE_DAYS`, allowed
  range **1–30 days**. (Superseded in 1.1.2: the range is **7–30 days**, default 7, decided by Apex as lead.) `POST /me/deletion` no longer accepts `grace_days` from the client; the
  value is reported in `GET /me/deletion` and `account.deletion_scheduled {scheduled_for, grace_days}`. Cancel is
  allowed at any time until `scheduled_for`; afterwards credentials are hard-deleted and personal data anonymized,
  `audit_log` is retained (actor ip / user agent / device nulled).
- Ingest parser tests run against captured mainnet fixtures (`services/backend/fixtures/mainnet/`).

## 1.1.0 (2026-10-29)

Breaking pre-release corrections. No producer had shipped v1.0 payloads, so per-event `version` stays `1`;
`CONTRACTS_VERSION` = `1.1.0`, `ERROR_CODES_VERSION` = `2`.

### Changed
- **One wire convention: snake_case** for every key (envelope, payloads, REST, settings, SQL) and enum value.
- **Number rule**: SOL amounts = lamport integer strings, raw token amounts = integer strings, prices = decimal strings;
  percentages, ratios, bps, USD notionals, scores, measured values = JSON numbers (were decimal strings).
- Settings keys, exit-preset ids, enum values and identifiers renamed to Centurion's own vocabulary (table below).
- `LAST_IDENTITY` -> `LAST_LOGIN_METHOD` (now HTTP 422).
- Paths: `/coins/{mint}/trail` -> `/coins/{mint}/timeline`, `/stats/exits` -> `/stats/exit-reasons`,
  `/workspaces/{ws}/reset-practice` -> `POST /workspaces/{ws}/practice/reset` (direct, no proposal).
- Telegram login: Login Widget HMAC replaced by official OIDC id_token flow (design-only, flag off).

### Added
- `rev` on every mutable resource, `If-Match` / `expected_rev` required (428), 409 conflict body
  `{current_rev, base_rev, changed_fields, changed_by, changed_at, current}`, `CONFIRMATION_RESTART_REQUIRED`.
- Practice reset (30 SOL, archive by epoch, once per 24 h): endpoint, `practice.reset` event, `RESET_COOLDOWN`.
- Account deletion: `/me/deletion` GET/POST/DELETE, `account.deletion_scheduled|deletion_cancelled|deleted` events.
- Devices / push: `PUT|GET|DELETE /devices`, `DeviceRegistration`, `PushPayload` (EVENTS_SCHEMA.md section 6).
- Error codes: PRECONDITION_REQUIRED, CONFIRMATION_RESTART_REQUIRED, REAUTH_REQUIRED, WALLET_ROLE_CONFLICT,
  RESET_COOLDOWN, ACCOUNT_DELETION_PENDING, ACCOUNT_DELETION_BLOCKED, DEVICE_TOKEN_INVALID, AUTH_TG_INVALID,
  AUTH_TG_REPLAY, AUTH_TG_NO_PROFILE.
- Exit reason `practice_reset`; expire reasons `practice_reset`, `account_deleted`.

### Deprecated
- TS `CoinStream` (alias of `Venue`), removed in 1.2.

### Rename table (v1.0 name -> v1.1 name)

#### Settings

| v1.0 name | v1.1 name |
|---|---|
| `budgetLamports` | `bankroll_lamports` |
| `tradeLamports` | `ticket_lamports` |
| `maxOpen` | `max_concurrent_positions` |
| `maxPoolSharePct` | `max_pool_impact_pct` |
| `askFirst` | (removed; use approval_mode) |
| `approvalMode` | `approval_mode` |
| `codeOnly` | `deterministic_only` |
| `lossStopPct` | `real_drawdown_halt_pct` |
| `practiceStopPct` | `practice_drawdown_halt_pct` |
| `skipTwinCoins` | `avoid_practice_overlap` |
| `streams` | `venues` |
| `minAgeMinutes` | `age_minutes_min` |
| `maxAgeMinutes` | `age_minutes_max` |
| `minGraduatedSeconds` | `since_migration_seconds_min` |
| `minMarketCapUsd` | `mcap_usd_min` |
| `maxMarketCapUsd` | `mcap_usd_max` |
| `minLiquidityUsd` | `liquidity_usd_min` |
| `minVolume24hUsd` | `volume_24h_usd_min` |
| `minHolders` | `holder_count_min` |
| `minBuyers1h` | `unique_buyers_1h_min` |
| `minBuySellRatio` | `buy_to_sell_ratio_min` |
| `maxTop10Percent` | `top_holders_share_pct_max` |
| `minLpBurnPct` | `lp_burned_pct_min` |
| `minTurnover1h` | `volume_to_mcap_1h_min` |
| `maxTurnover1h` | `volume_to_mcap_1h_max` |
| `minMove1hPct` | `change_1h_pct_min` |
| `maxMove1hPct` | `change_1h_pct_max` |
| `sweetMove1hLowPct` | `change_1h_pct_preferred_low` |
| `sweetMove1hHighPct` | `change_1h_pct_preferred_high` |
| `maxDrawdownPct` | `off_high_pct_max` |
| `hourCrashLimit` | `one_minute_dump_pct_max` |
| `mustHave` | `required_checks` |
| `passMark` | `score_threshold` |
| `recheckMovePct` | `revisit_after_move_pct` |
| `rules` | `screen_rules` |
| `shield` | `guard_checks` |
| `maxDevPercent` | `creator_share_pct_max` |
| `maxBundlersPercent` | `bundled_share_pct_max` |
| `maxSnipersPercent` | `sniper_share_pct_max` |
| `dipPct` | `entry_discount_pct` |
| `entryDelayMinutes` | `observe_before_entry_minutes` |
| `entryMaxUpPct` | `skip_if_risen_pct` |
| `breakout` | `range_break_entry` |
| `activeTrading` | `liveness_gate` |
| `rebuy` | `reentry` |
| `tradingDays` | `entry_weekdays_utc` |
| `tradingHours` | `entry_hours_utc` |
| `exitPlan` | `exit_preset` |
| `exits` | `exit_rules` |
| `takeProfits` | `profit_targets` |
| `stopLosses` | `loss_guards` |
| `gainPct` | `at_gain_pct` |
| `sellPct` | `sell_portion_pct` |
| `pullbackPct` | `giveback_pct` |
| `stopLossPct` | `stop_loss_pct` (fixed stop from entry; corrected in 1.1.2, was wrongly `peak_trail_pct`) |
| `noTradeSeconds` | `idle_exit_seconds` |
| `drain` | `sell_pressure_exit` |
| `sellFloors` | `sell_floors` |
| `maxLossPct` | `max_loss_pct` |
| `liquidityDropPct` | `liquidity_drop_pct` |

#### Exit Presets

| v1.0 name | v1.1 name |
|---|---|
| `clip` | `momentum_trail` |
| `stake` | `principal_recovery` |
| `flip` | `double_out` |
| `ladder` | `three_step_ladder` |
| `trailingTp` | `peak_giveback` |
| `trail` | `trail_stop_only` |
| `scaleOut` | `incremental_trim` |
| `scalp` | `fast_half` |
| `take30` | `fixed_thirty` |
| `stall` | `new_high_timeout` |
| `stepLock` | `ratchet` |
| `tighten` | `tightening_trail` |
| `doubling` | `geometric_ladder` |

#### Required checks

| v1.0 name | v1.1 name |
|---|---|
| `liquidity` | `liquidity_usd` |
| `volume` | `volume_24h_usd` |
| `marketCap` | `mcap_usd` |
| `age` | `age_minutes_min` |
| `maxAge` | `age_minutes_max` |
| `top10` | `top_holders_share_pct` |
| `lpBurn` | `lp_burned_pct` |

#### Venues

| v1.0 name | v1.1 name |
|---|---|
| `bonding` | `curve` |
| `graduated` | `amm` |

#### Exit Reasons

| v1.0 name | v1.1 name |
|---|---|
| `take_profit` | `profit_target` |
| `stop_loss` | `loss_guard` |
| `trailing_stop` | `peak_trail` |
| `time_out` | `max_hold` |
| `inactivity` | `idle` |
| `drain` | `sell_pressure` |
| `stall` | `no_new_high` |
| `rug` | `rug_detected` |
| `loss_stop` | `drawdown_halt` |

#### Metrics

| v1.0 name | v1.1 name |
|---|---|
| `liquidityUsd` | `liquidity_usd` |
| `marketCapUsd` | `mcap_usd` |
| `volume1hUsd` | `volume_1h_usd` |
| `volume24hUsd` | `volume_24h_usd` |
| `holders` | `holder_count` |
| `buyers1h` | `unique_buyers_1h` |
| `buySellRatio` | `buy_to_sell_ratio` |
| `turnover1h` | `volume_to_mcap_1h` |
| `top10Pct` | `top_holders_share_pct` |
| `lpBurnPct` | `lp_burned_pct` |
| `move1hPct` | `change_1h_pct` |
| `drawdownPct` | `off_high_pct` |
| `devPct` | `creator_share_pct` |
| `bundlersPct` | `bundled_share_pct` |
| `snipersPct` | `sniper_share_pct` |
| `ageMinutes` | `age_minutes` |
| `graduatedSeconds` | `since_migration_seconds` |
| `curveProgressPct` | `curve_progress_pct` |

#### Ruleset

| v1.0 name | v1.1 name |
|---|---|
| `passMark` | `score_threshold` |
| `onMissing` | `on_missing` |
| `zeroAt` | `zero_at` |
| `streams` | `venues` |

#### Other

| v1.0 name | v1.1 name |
|---|---|
| `Stream (coin source type)` | `Venue` |
| `stream (coin field)` | `venue` |
| `pass_mark (screener result / picks column)` | `score_threshold` |
| `coin_outcomes.max_drawdown_pct` | `coin_outcomes.worst_drawdown_pct` |
| `GET /coins/{mint}/trail` | `GET /coins/{mint}/timeline` |
| `GET /stats/exits` | `GET /stats/exit-reasons` |
| `GuardConfig keys dev/bundlers/snipers/top10 (camelCase)` | `creator_share/bundled_share/sniper_share/top_holders_share (snake_case)` |
