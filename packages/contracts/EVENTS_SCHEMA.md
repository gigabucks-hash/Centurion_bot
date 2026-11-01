# Centurion Trade stream event schema (contract v1.1.5)

Product name **Centurion Trade**; code/DB names keep the codename `sentra` (e.g. JWT claim `sentra_client`).

Status: **v1.1.2, frozen for client work** (Web, Flutter, Desktop, MCP). See `CHANGELOG.md` for the v1.0 -> v1.1
renames. From v1.1 on: additive changes only; a breaking change to a type's payload bumps that event's `version`.
(v1.1 and v1.1.2 corrected pre-release payloads that no producer had shipped, so every per-type `version` is still `1`.
**1.1.2 is breaking-but-early** for seq (now an int64 string) and for the `version` -> `rev` rename on approval payloads.)
Owner: Backend API Specialist.
Sources of truth: TS `src/wire/events.ts`, Rust `services/backend/crates/common/src/event.rs`, SQL
`public.events` in `services/backend/supabase/migrations/0001_init.sql`.

## 1. Wire rules (every REST body and every stream payload)

**One convention: every key on the wire is `snake_case`** (envelope, payloads, REST bodies, query params,
strategy settings, SQL columns). Enum values are `snake_case` too (guard verdicts stay `PASS|WARN|FAIL`,
error codes stay `UPPER_SNAKE`).

**Number rule (v1.1):**

| Value | Wire type | Example |
|---|---|---|
| SOL amounts (`*_lamports`) | integer **string** (lamports) | `"250000000"` = 0.25 SOL |
| Token amounts (`*_raw`) | integer **string** (base units) | `"44834929"` |
| Prices (`*price*`: `exec_price_sol`, `price_usd`, ...) | **decimal string**, no exponent | `"0.000012345678"` |
| Percentages (`*_pct`), ratios (`*_ratio`, `volume_to_mcap_*`), bps (`*_bps`), USD notionals (`*_usd`), scores/points/measured values | JSON **number** | `-35`, `8.4`, `1.25`, `2.04`, `42000` |
| counts, seconds, ms, slots, rev, version, `decimals` | JSON integer | `125`, `6` |
| int64 ids: `seq`, `after_seq`, `before_seq`, `next_after_seq`, `next_before_seq`, `safe_seq`, `as_of_seq`, `job_id`, SSE `id` | integer **string** | `"18234"` |
| Timestamps | RFC 3339 UTC, ms precision | `"2026-10-29T08:42:00.123Z"` |
| Mode | `practice` \| `real` | `real` is rejected everywhere until Phase 7 |

Parse lamports with BigInt and prices with a decimal library; never round-trip either through a float.
Percentages/ratios are display/threshold values and may be JS numbers. Enforced by the Rust test helper
`common::units::assert_wire_numbers` on every pipeline payload.
Token metadata (name, symbol, uri) is attacker-controlled and only ever appears under `untrusted`;
render as plain text, never interpret, never put in an LLM prompt unescaped.

### server_now
Every REST response carries `server_now` (top-level body field **and** `X-Server-Now` header).
Every stream message carries `server_now` (SSE: in the envelope; Broadcast: in the payload;
Realtime `postgres_changes` rows: use the row's `created_at`, which is the DB clock at insert, plus the
`clock` heartbeat below). Clients compute `skew = server_now - local_now` and render every countdown
(proposal `expires_at`, cooldowns) as `expires_at - (local_now + skew)`. Never compute TTLs client-side.

## 2. Envelope

```json
{
  "id": "k7x2m9q4:1793263320123:position.opened",
  "seq": "18234",
  "type": "position.opened",
  "version": 1,
  "workspace_id": "10000000-0000-0000-0000-00000000000a",
  "strategy_id": "20000000-0000-0000-0000-00000000000a",
  "ck": "k7x2m9q4",
  "mint": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  "ts": "2026-10-29T08:42:00.123Z",
  "actor": "executor",
  "mode": "practice",
  "payload": { },
  "untrusted": { "name": "Example", "symbol": "EXM" },
  "server_now": "2026-10-29T08:42:00.151Z"
}
```

| Field | Notes |
|---|---|
| `id` | Deterministic `<subject>:<epoch_ms>:<type>` (subject = pick key `ck`, proposal id, strategy id). Unique; writers are idempotent; clients dedupe on it. |
| `seq` | `bigint identity`, sent as an **integer string** (int64 exceeds JS safe integers; compare with BigInt). **Monotonic, not gapless** (rollbacks leave holes). Order by `seq`, never by `ts`. Cursor for pagination and resume. |
| `type` | See section 4. Clients must ignore unknown types. |
| `version` | Payload schema version for that type (all `1` today). |
| `workspace_id`, `mode` | Every event is scoped by both. RLS hides `mode='real'` rows unless the JWT has `trade:real` (never issued before Phase 7). |
| `strategy_id`, `ck`, `mint` | Nullable. `ck` = pick key (1 coin x 1 strategy); position key = `<ck>.<n>`. |
| `ts` | When the fact happened (server clock). |
| `actor` | `ingest` `screener` `guard` `entry` `executor` `exit` `user` `system` (UI: `user` = "You"). |
| `payload` | Trusted, typed per `type`. |
| `untrusted` | Always an object (may be `{}`). |
| `server_now` | Added at delivery (SSE/REST); not stored. |

## 3. Transport

1. **Supabase Realtime `postgres_changes`** (INSERT on `public.events`, filter `workspace_id=eq.<id>`):
   primary live feed for Web and Flutter. RLS applies (membership + mode gate).
2. **Supabase Realtime Broadcast**, private channel `marks:<workspace_id>:<mode>`: mark prices only,
   **never written to a table**, throttled to <= 4 msg/s per mint, only for mints with an open position or
   pending proposal. Events: `mark` and a `clock` heartbeat every 15 s:
   ```json
   { "event": "mark", "payload": { "mint": "7GCi...W2hr", "price_usd": "0.000041230000",
     "price_sol": "0.000000213400", "liquidity_usd": 48211.5, "slot": 301223344,
     "ts": "2026-10-29T08:42:01.020Z", "position_ids": ["4000..."], "server_now": "2026-10-29T08:42:01.031Z" } }
   { "event": "clock", "payload": { "server_now": "2026-10-29T08:42:15.000Z", "safe_seq": "18240" } }
   ```
3. **SSE** `GET /v1/workspaces/{ws}/events/stream?mode=practice&after_seq=<n>&include=marks,clock` for Desktop,
   MCP and any client without Supabase (the 1.1 path `/v1/events/stream` is removed). Event frames:
   `id: <seq string>`, `event: <type>`, `data: <envelope>`; honours `Last-Event-ID`; heartbeat comment every
   15 s. SSE only emits rows with `seq <= events_safe_seq()` so it is strictly seq-ordered.
   Optional `include` (comma list):
   - `marks`: adds `event: mark` frames, `data` = exactly the Broadcast `mark` payload above (`MarkMessage`), no `id:`
     (marks are never persisted and never move the watermark).
   - `clock`: adds `event: clock` frames every 5 s, `data` = `{server_now, safe_seq}` (same as Broadcast). No `id:`;
     clients may advance the watermark to `safe_seq`.
   ```
   id: 18234
   event: position.updated
   data: {"id":"k7x2m9q4.0:1793263320123:position.updated","seq":"18234",...}

   event: mark
   data: {"mint":"7GCi...W2hr","price_usd":"0.000041230000","price_sol":"0.000000213400",...}

   event: clock
   data: {"server_now":"2026-10-29T08:42:15.000Z","safe_seq":"18240"}
   ```

### Why seq is safe to resume from although it is not gapless
A transaction can take seq 101 and commit after seq 102. The REST list and SSE therefore only serve
`seq <= events_safe_seq()` (the highest seq below which no in-flight transaction can still commit; computed
from `pg_snapshot_xmin`). The value a client persists as its **resume watermark** must come from REST
(`next_after_seq`), SSE (`id`) or the Broadcast `clock.safe_seq`, never from a raw Realtime row.

```
watermark = persisted (0 first run)
subscribe Realtime; apply live rows immediately, dedupe by id
loop: page = GET /v1/events?after_seq=watermark&limit=500 ; apply (dedupe) ; watermark = page.next_after_seq
      until page.has_more == false
on reconnect or every clock heartbeat: repeat the loop from watermark (cheap; catches late commits)
```

### Cursor pagination on seq
`GET /v1/events?mode=practice&after_seq=<n>&limit=1..500&types=a,b&strategy_id=&ck=` ascending, or
`before_seq=<n>` descending (scroll-back). Response:
`{ "items": [..], "next_after_seq": "18234", "next_before_seq": null, "has_more": true, "safe_seq": "18240", "server_now": "..." }`.

## 4. Event types (payloads)

Vocabularies: `ExitReason` = `sell_floor profit_target loss_guard peak_trail max_hold idle sell_pressure
no_new_high rug_detected drawdown_halt manual strategy_retired practice_reset stall` (`sell_floor` is evaluated
before every other exit rule). 1.1.4: `max_hold` also covers settings `time_stop_s`; `stall` (new) = settings
`stall_exit` fired (|price change| over `window_s` < `min_move_pct`); the v1.0 name `stall` maps to `no_new_high`. `Venue` = `curve amm`.
`GuardVerdict` = `PASS WARN FAIL`. `ProposalKind` = `buy_pick guard_change team_action`.
`ProposalExpiredReason` = `timeout strategy_deleted strategy_archived guard_failed price_moved practice_reset
account_deleted`. Guard check names: `mint_authority freeze_authority lp_safety top_holders_share single_holder
creator_share bundled_share sniper_share transfer_fee honeypot serial_creator`.

| type | actor | payload (v1) |
|---|---|---|
| `coin.detected` | ingest | `{mint, venue: curve\|amm, launchpad, creator, decimals, token_program, quote_mint}`. `decimals` (integer) and `token_program` come from the mint account (never assume 6; `null` only while the mint is unreadable, and such coins are never filled). `quote_mint` null = SOL. 1.1.4: plus `market_cap_lamports` (integer string \| null), `mcap_usd` (decimal string \| null, indicative), `mcap_as_of` (ts \| null), see API_ENDPOINTS 4.4. Metadata in `untrusted`. Fanned out once per workspace that runs a strategy on that venue. |
| `screener.scored` | screener | `{mint, passed, tradeable, skip_reason, quote_mint, summary, rejected_by, failed[], result: {passed, score, score_threshold, max_score, tradeable, skip_reason, quote_mint, checks: [{id, class: venue\|hard\|weighted, passed, measured, points, reason}]}}` (scores/measured are JSON numbers). `tradeable: false` + `skip_reason: "UNSUPPORTED_QUOTE_MINT"` = practice mode cannot trade the coin (non-SOL quote; prices never converted); then `passed` is false and `rejected_by` = skip_reason. 1.1.4: plus `market_cap_lamports`, `mcap_usd`, `mcap_as_of` (same values as `coin.detected`; `mcap_usd` = the `measured` of the `mcap` check). **Design choice (1.1.2):** the screener result is extended; there is no separate `coin.skipped` event. |
| `guard.result` | guard | `{mint, verdict, risk_score, reasons[], checks: [{name, status: PASS\|WARN\|FAIL\|UNKNOWN, measured, reason, weight}]}` |
| `pick.created` | screener | `{mint, summary, score: <screener result>, guard_verdict, guard_reasons[], market_cap_lamports, mcap_usd, mcap_as_of}` (market cap fields 1.1.4) |
| `entry.armed` / `entry.expired` | entry | `{pick_id, condition, expires_at}` / `{pick_id, reason}` |
| `proposal.created` | entry\|user\|system | `{proposal_id, kind, rev, mint, symbol (untrusted text, same as envelope untrusted.symbol), price_sol (decimal string), expires_at, first_buy, approval_mode, amount_lamports, risk_level, summary, base_rev, weakening, diff: [{field, before, after, weakening}]\|null, estimate}` + optional nullable quote fields (1.1.4, below) |
| `proposal.updated` | system | A pending proposal's quote was set or refreshed (`set_approval_quote` / `POST .../approvals/{id}/quote` / GET auto-refresh): `{proposal_id, kind, rev, quote_id, decimals, token_program, est_network_fee_lamports, priority_fee_lamports, swap_fee_bps, max_slippage_bps, min_out_raw, est_ata_rent_lamports, expected_out_lamports, min_out_lamports, total_max_lamports, quote_ts, quote_expires_at}`. **1.1.5: `rev` is unchanged** (keep using it as `expected_rev`); `quote_id` (int64 string) increments; send it as `expected_quote_id`. **Coalescing:** at most one `proposal.updated` per proposal per 3 s, only while the proposal is pending (a refresh inside 3 s of the last quote returns that quote and emits nothing). Clients that hold a press-and-hold reset it when `quote_id` changes. |
| `proposal.approved` / `proposal.rejected` | user | `{proposal_id, kind, rev, decided_by, decided_via: web\|mobile\|desktop\|mcp\|push, reason, reject_reason}`. `reject_reason` (1.1.3): `user_declined\|not_tradeable\|price_moved\|other` on `proposal.rejected` (default `user_declined`), `null` on `proposal.approved` (UI label for rejected: "Skipped") |
| `proposal.expired` | system | `{proposal_id, kind, rev, reason, at}` — `reason` is exactly one of the canonical wire values `timeout`, `strategy_deleted`, `strategy_archived`, `guard_failed`, `price_moved`, `practice_reset`, `account_deleted`; plus `kill_switch` (1.1.5, **reserved for Phase 7**, never emitted in practice: buys paused or a safety trip). `reset_practice()` expires pending/approved buys with `practice_reset`; account finalization expires every open proposal with `account_deleted` (both SQL-tested) |
| `order.submitted` | user | `{order: OrderWire, position_id, position_rev, practice_epoch}` (manual close accepted) |
| `order.filled` | executor | `{order: OrderWire, fill: FillWire, position_id, position_rev, practice_epoch}` |
| `order.failed` | executor | N-05. `{order_id, proposal_id, position_id?, mint, side, amount_lamports (string\|null), qty_raw?, fraction_bps?, reason_code, detail, quote_mint?, mode, practice_epoch?, server_now}`. `reason_code` from errors.json: `SLIPPAGE_EXCEEDED`, `INSUFFICIENT_PRACTICE_BALANCE`, `GUARD_FAILED`, `UNSUPPORTED_QUOTE_MINT`, `POOL_STALE`, `POSITION_ALREADY_CLOSED`, `VALIDATION_FAILED`, `MODE_NOT_ALLOWED`. Symbol is in envelope `untrusted`. Emitted whenever a simulated fill is rejected (papersim and `fail_order()`) |
| `position.opened` | executor | `{position_key, position_id, rev, practice_epoch, mint, decimals, token_program, fill: FillWire, first_buy}` |
| `position.updated` | exit\|executor | `{position_key, position_id, rev, practice_epoch, qty_raw (string), cost_basis_lamports (string), avg_entry_price_sol (decimal string), peak_price_sol, realized_lamports, unrealized_pnl_lamports (string\|null), plan_state: PlanState\|null}` (partial sells, plan state; at most 1 per 5 s; never per tick) |
| `position.closed` | exit\|executor | `{position_key, position_id, rev, practice_epoch, exit_reason, exit_price_sol, sol_out_lamports, pnl_lamports, pnl_pct, hold_seconds}` |
| `fill.simulated` | executor | `FillWire` + `{position_key, position_id, order_id, mark_price_sol?, fee_bps?}` |
| `exit.triggered` | exit | `{position_key, rule: ExitReason, rule_index, sell_portion_pct, trigger_price_sol, detail}` |
| `portfolio.snapshot` | system | `{practice_epoch, cash_lamports, positions_cost_lamports, positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps, drawdown_pct, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq}` |
| `guard.changed` | user\|system | `{guard_change_id, proposal_id, status: requested\|cooling_down\|applied\|reverted\|cancelled\|rejected\|expired, from_rev, to_rev, weakening, weakened_fields[], cooldown_until, auto_revert_at}`; practice: `requested` on proposal, `applied` (with `to_rev`) on approval, `rejected` / `expired` otherwise |
| `strategy.created/updated/paused/resumed/archived/deleted` | user\|system | `{rev, base_rev?, status?, changed_fields?, expired_proposals?}`; a client editing at `base_rev < rev` enters the conflict state (API_ENDPOINTS.md 2.1) |
| `practice.reset` | user\|system | `{epoch, previous_epoch, starting_balance_lamports: "30000000000", archived: {positions, closed_open_positions, fills, snapshots, expired_proposals}, next_allowed_at, at}`; clients drop cached positions/equity and refetch for the new epoch |
| `account.deletion_scheduled` | user | `{scheduled_for, grace_days, at}` (emitted into every workspace the user owns) |
| `account.deletion_cancelled` / `account.deleted` | user | `{at}` |
| `system.notice` | system | `{code, message}`; `code` is an errors.json code with `kind: "notice"` (e.g. `PRACTICE_CASH_INSUFFICIENT`, `JOB_DEAD_LETTERED`, `SOURCE_DEGRADED`) |

`proposal.created` (1.1.5) also carries `decimals` and `token_program` (null for `guard_change`), and `kind` may be
`sell_position` (sell quote fields: `expected_out_lamports`, `min_out_lamports`, `total_max_lamports` = network fee).
`coin.detected` / `screener.scored` / `pick.created` market-cap fields gain `mcap_source: curve|pool|unavailable` (1.1.5).

**Quote fields (1.1.4, UX WF-22 transaction review sheet)** on `proposal.created`, `proposal.updated` and
`ApprovalWire` (TS `ProposalQuoteFields`; all optional and nullable): `est_network_fee_lamports`,
`priority_fee_lamports`, `min_out_raw` (raw token units), `total_max_lamports` are integer strings; `swap_fee_bps`,
`max_slippage_bps` are JSON numbers; `quote_ts`, `quote_expires_at` are ISO timestamps. Practice values are papersim
estimates (`papersim::quote::estimate_buy`): network fee = base + priority (CU limit x CU price), `min_out_raw` =
CPMM tokens out after the swap fee x (1 - max slippage), validity 15 s. **1.1.5 exact definition:** buy
`total_max_lamports = amount_lamports + est_network_fee_lamports + est_ata_rent_lamports` (the network fee already
includes the priority fee; the swap fee is taken out of SOL in, never added; `est_ata_rent_lamports` = `"2039280"`
when the token account does not exist yet, else `"0"`); sell `total_max_lamports = est_network_fee_lamports`.
Rule: for `mode=real`, approving with a missing quote, `quote_expires_at <= server now`, or an `expected_quote_id`
that is missing or not the current `quote_id` -> `409 QUOTE_MISSING_OR_STALE {reason, missing, quote_ts,
quote_expires_at, quote_id, expected_quote_id, current}` (SQL `approval_quote_check` inside `decide_approval`);
practice is never blocked by a missing/stale quote.

### proposal.expired example
```json
{ "id": "30000000-0000-0000-0000-00000000000b:1793263320123:proposal.expired", "seq": "18300",
  "type": "proposal.expired", "version": 1, "workspace_id": "1000...000a", "strategy_id": "2000...000c",
  "ck": "abc123", "mint": "7GCi...W2hr", "ts": "2026-10-29T08:42:00.123Z", "actor": "system",
  "mode": "practice", "untrusted": {},
  "payload": { "proposal_id": "30000000-0000-0000-0000-00000000000b", "kind": "buy_pick", "rev": 2,
               "reason": "strategy_deleted", "at": "2026-10-29T08:42:00.123Z" },
  "server_now": "2026-10-29T08:42:00.140Z" }
```

**Who expires proposals:** the worker, never a DB trigger. (a) Sweeper calls `expire_due_proposals()`
every 2 s (`timeout`). (b) Entry engine calls `expire_proposal(id, 'guard_failed'|'price_moved')` when
a re-check fails while waiting. (c) Archive/delete calls `retire_strategy(id, 'archive'|'delete', actor)`,
which in **one transaction** locks the strategy, flips its status, expires every pending (and
approved-but-unexecuted) proposal, writes one `proposal.expired` per proposal plus
`strategy.archived|deleted`, burns outstanding decision tokens, and appends an `audit_log` row. Because
`events` is the outbox, a client can never see a pending proposal whose strategy is gone.

### FillWire / fill.simulated example (matches `FillWire` exactly; `mid_price_sol` is required)
```json
{ "id": "7000...0001", "side": "buy", "simulated": true, "practice_epoch": 0,
  "sol_lamports": "250000000", "token_amount_raw": "980392156",
  "exec_price_sol": "0.000000255", "mid_price_sol": "0.00000025", "price_impact_bps": 196,
  "slippage_bps": 2.04, "swap_fee_lamports": "3125000", "network_fee_lamports": "25000", "latency_ms": 450,
  "created_at": "2026-10-29T08:42:00.123Z",
  "position_key": "abc123.0", "position_id": "6000...0001", "order_id": null,
  "mark_price_sol": "0.00000025", "fee_bps": 125 }
```
Price fields are decimal strings (`exec_price_sol`, `mid_price_sol`, `mark_price_sol`); bps are numbers.

### PlanState (position.updated.plan_state)
A discriminated union per exit-plan step (`kind`), so no field is untyped:
```json
{ "preset": "three_step_ladder", "current_step": 1, "triggered_steps": [0], "trail_peak_price_sol": "0.00000041",
  "steps": [
    { "kind": "profit_target", "index": 0, "at_gain_pct": 50, "sell_portion_pct": 33, "trigger_price_sol": "0.000000375", "triggered": true, "triggered_at": "2026-10-29T08:50:00.000Z" },
    { "kind": "profit_target", "index": 1, "at_gain_pct": 100, "sell_portion_pct": 33, "trigger_price_sol": "0.0000005", "triggered": false, "triggered_at": null },
    { "kind": "peak_trail", "index": 2, "trail_pct": 15, "armed": true, "peak_price_sol": "0.00000041", "stop_price_sol": "0.0000003485", "triggered": false, "triggered_at": null },
    { "kind": "stop_loss", "index": 3, "stop_loss_pct": 30, "stop_price_sol": "0.000000175", "triggered": false, "triggered_at": null } ] }
```
Step kinds: `profit_target`, `loss_guard`, `stop_loss`, `peak_trail`, `giveback`, `max_hold`, `idle`, `sell_floor`
(fields per kind in `src/wire/events.ts` `PlanStep`).

### portfolio.snapshot example
```json
{ "cash_lamports": "26292000000", "positions_cost_lamports": "1202000000",
  "positions_value_lamports": "1186000000", "equity_lamports": "27478000000",
  "peak_equity_lamports": "30000000000", "drawdown_bps": 840, "drawdown_pct": 8.4,
  "realized_pnl_lamports": "-2506000000", "unrealized_pnl_lamports": "-16000000",
  "open_positions": 6, "as_of_seq": "18233", "practice_epoch": 0 }
```

## 5. Ordering per pick
`coin.detected -> screener.scored -> guard.result -> pick.created -> [proposal.created ->
proposal.approved|rejected|expired] -> fill.simulated(buy) -> position.opened -> (exit.triggered ->
fill.simulated(sell) -> position.updated)* -> position.closed -> portfolio.snapshot`, reflected in `seq`.
Manual close: `order.submitted -> fill.simulated(sell) -> position.updated|position.closed -> order.filled`
(or `order.submitted -> order.failed`).

## 6. Push payload (FCM / APNs / Web Push data message)

Data-only, copy rendered on the device from the UX catalog (`NOTIFICATIONS.md`). Built by the push worker
from an `events` row + `outbox(channel='push')`; one message per registered, non-revoked device.

**Encoding (FCM `data` is a string map): every value is a string.** `v`, `seq` and `version` are base-10
integer strings; `actions` and `vars` are JSON-encoded strings; timestamps are RFC 3339 strings. Exactly what
the device receives:
```json
{ "v": "1", "event": "N-01", "type": "proposal.created", "mode": "practice",
  "workspace_id": "1000...000a", "seq": "18301", "deep_link": "sentra://approvals/3000...000a",
  "approval_id": "3000...000a", "version": "1", "token": "apt_Q2x...", "exp": "2026-10-29T08:52:00.000Z",
  "actions": "[\"approve\",\"skip\",\"open\"]",
  "vars": "{\"symbol\":\"EXM\",\"strategy\":\"Yumi · AMM\",\"amount_lamports\":\"250000000\"}",
  "server_now": "2026-10-29T08:42:00.151Z" }
```
Decoded (`decodePushData()` in `src/wire/events.ts`): `version` = the approval `rev`; send it back as
`p_expected_rev` / `If-Match` (it is required; push decisions are not exempt). `vars.amount_lamports` is an
integer string (format with `lamportsToSol`); `vars.symbol` is untrusted plain text. There is **no** `vars.sol`
and **no** `vars.mm_ss`: compute the countdown as `exp - server_now` (plus your measured skew).
Rules: no secrets, no session tokens, no PII beyond display vars; `token` is a single-use **practice
`buy_pick`** decision token minted for that device (`issued_via='push'`), `exp = min(token TTL 15 min,
expires_at)`. **Real SOL is never actionable from a push**: no `token`, `actions` = `["open"]` (skip is
opened in-app). Guard changes and team actions: `["open"]` only. Clients fail closed on unknown `v`/`event`,
missing `mode`, or real-only events in practice. Device registration, rotation and revocation:
API_ENDPOINTS.md 4.10.


## 7. Reserved for Phase 7 (not emitted)

Contracts 1.1.5 reserve these names and payloads for Real SOL (UX N-23..N-46). **Nothing emits them before Phase 7;**
they only appear on the real stream (never mixed with practice). TS: `ReservedPhase7Payloads`,
`RESERVED_PHASE7_EVENTS` and the `Real*` interfaces in `src/wire/events.ts` (marked `phase7`); they are deliberately
not part of `EventPayloads`. Mirrored in `services/backend/docs/REAL_MONEY_OPTIONS.md` §7.4.

Payload rules: lamport amounts are integer strings; times ISO UTC; addresses and signatures in full. Actor and device
are **flat fields**: `actor_type: user|rule|system`, `user_id` (uuid | null), `device_id` (string | null),
`device_label` (string | null). `kill_switch_reason = policy_mismatch | loss_velocity | provider_error | other`.
Limit `setting` keys: `per_trade_lamports`, `daily_lamports` (rolling 24 h), `cap_lamports`, `max_positions`,
`max_slippage_bps`; `from`/`to` are integer strings for `*_lamports`, JSON numbers otherwise.

| Event | Payload |
|---|---|
| `real.signer.granted` | `{signer_id, provider, expires_at, actor_type, user_id, device_id, device_label}` |
| `real.signer.revoked` | `{signer_id, provider, reason: kill_switch\|expiry\|user, actor_type, user_id}` |
| `real.policy.activated` | `{version, policy_hash, actor_type, user_id}` |
| `real.policy.mismatch` | `{version, policy_hash, expected_hash, actual_hash}` |
| `real.limit.changed` | `{setting, from, to, policy_version, actor_type, user_id}` |
| `real.limit.loosen_requested` | `{setting, from, to, policy_version, activates_at, actor_type, user_id, device_id, device_label}`; final (no auto-revert; `real.limit.reverted` does not exist) |
| `real.kill_switch.tripped` | `{scope: global\|workspace\|strategy, target_id, reason: kill_switch_reason \| null, rule_id, actor_type, user_id, at}` |
| `real.kill_switch.cleared` | `{scope, target_id, reason, actor_type, user_id, device_id, device_label, at, signer_state: active\|revoked}`; after a `policy_mismatch` trip the signer stays `revoked` until a manual re-grant |
| `real.buys.paused` / `real.buys.resumed` | `{scope, target_id, actor_type, user_id, device_id, device_label, at}` (Stop = pause new buys; exits keep running) |
| `real.sell_all.requested` | `{sell_all_id, requested_count, actor_type, user_id, device_id, device_label, at}` (session-authorized, 2.5 s hold, 1 per 60 s, idempotent) |
| `real.sell_all.completed` | `{sell_all_id, requested_count, sold_count, failed_count, amount_out_lamports \| null, failures: [{position_id, mint, reason_code}], completed_at}` (failed positions stay open with their exit plans) |
| `real.withdraw_address.added` | `{address, usable_at, cancel_until, actor_type, user_id, device_id, device_label}` (main-wallet change, 48 h) |
| `real.withdraw_address.usable` / `.cancelled` | `{address, at, actor_type, user_id}` |
| `real.deposit.detected` | `{amount_lamports, balance_lamports, tx_signature, slot, at}` |
| `real.withdraw.requested` | `{withdraw_id, amount_lamports, address, tx_signature: null, actor_type, user_id, device_id, device_label}` |
| `real.withdraw.confirmed` | `{withdraw_id, amount_lamports, address, tx_signature, slot}` |
| `real.withdraw.failed` | `{withdraw_id, amount_lamports, address, tx_signature \| null, reason_code}` |

`real.withdraw.failed.reason_code` is a reserved enum documented here and in TS (`WithdrawFailReason`), **not** in
`errors.json`: `withdraw_simulation_failed | insufficient_balance | destination_not_owned | tx_expired |
provider_error | user_rejected | other`. `proposal.expired.reason` gains `kill_switch` (reserved). Push for these
events is informational only; Real is never actionable from a push.
