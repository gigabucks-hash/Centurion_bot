# Sentra stream event schema (contract v1)

Status: **v1, frozen for client work** (Web, Flutter, Desktop, MCP). Additive changes only; a breaking
change to a type's payload bumps that event's `version`. Owner: Backend API Specialist.
Sources of truth: TS `src/wire/events.ts`, Rust `services/backend/crates/common/src/event.rs`, SQL
`public.events` in `services/backend/supabase/migrations/0001_init.sql`.

## 1. Wire rules (every REST body and every stream payload)

| Value | Wire type | Example |
|---|---|---|
| SOL amounts | integer **string**, lamports (`*_lamports`) | `"250000000"` = 0.25 SOL |
| Token amounts | integer **string**, raw base units (`*_raw`) | `"44834929"` |
| Prices, ratios, percentages, scores | **decimal string**, no exponent | `"0.000012345678"`, `"-35"`, `"85"` |
| bps, counts, seconds, ms, slots, seq, version | JSON integer | `125`, `18234` |
| Timestamps | RFC 3339 UTC, ms precision | `"2026-10-29T08:42:00.123Z"` |
| Mode | `practice` \| `real` | `real` is rejected everywhere until Phase 7 |

**No floats over the wire.** Parse amounts with BigInt, prices with a decimal library.
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
  "seq": 18234,
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
| `seq` | `bigint identity`. **Monotonic, not gapless** (rollbacks leave holes). Order by `seq`, never by `ts`. Cursor for pagination and resume. |
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
     "price_sol": "0.000000213400", "liquidity_usd": "48211.50", "slot": 301223344,
     "ts": "2026-10-29T08:42:01.020Z", "position_ids": ["4000..."], "server_now": "2026-10-29T08:42:01.031Z" } }
   { "event": "clock", "payload": { "server_now": "2026-10-29T08:42:15.000Z", "safe_seq": 18240 } }
   ```
3. **SSE** `GET /v1/events/stream?mode=practice&after_seq=<n>` for Desktop, MCP and any client without
   Supabase. `id: <seq>`, `event: <type>`, `data: <envelope>`; honours `Last-Event-ID`; heartbeat
   comment every 15 s. SSE only emits rows with `seq <= events_safe_seq()` so it is strictly seq-ordered.

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
`{ "items": [..], "next_after_seq": 18234, "next_before_seq": null, "has_more": true, "safe_seq": 18240, "server_now": "..." }`.

## 4. Event types (payloads)

Vocabularies: `ExitReason` = `take_profit stop_loss trailing_stop time_out inactivity drain stall rug
sell_floor loss_stop manual strategy_retired` (`sell_floor` is evaluated before every other exit rule).
`GuardVerdict` = `PASS WARN FAIL`. `ProposalKind` = `buy_pick guard_change team_action`.
`ProposalExpiredReason` = `timeout strategy_deleted strategy_archived guard_failed price_moved`.

| type | actor | payload (v1) |
|---|---|---|
| `coin.detected` | ingest | `{mint, stream: bonding\|graduated, launchpad, creator}`; metadata in `untrusted`. Fanned out once per workspace that runs a strategy on that stream. |
| `screener.scored` | screener | `{mint, passed, summary, rejected_by, failed[], result: {passed, score, pass_mark, max_score, checks: [{id, class: stream\|hard\|weighted, passed, measured, points, reason}]}}` (numbers as decimal strings) |
| `guard.result` | guard | `{mint, verdict, risk_score, reasons[], checks: [{name, status: PASS\|WARN\|FAIL\|UNKNOWN, measured, reason, weight}]}` |
| `pick.created` | screener | `{mint, summary, score: <screener result>, guard_verdict, guard_reasons[]}` |
| `entry.armed` / `entry.expired` | entry | `{pick_id, condition, expires_at}` / `{pick_id, reason}` |
| `proposal.created` | entry\|user\|system | `{proposal_id, kind, version, expires_at, first_buy, approval_mode, amount_lamports, risk_level, summary, base_rev, weakening, diff, estimate}` |
| `proposal.approved` / `proposal.rejected` | user | `{proposal_id, kind, version, decided_by, decided_via: web\|mobile\|desktop\|mcp\|push, reason}` (UI label for rejected: "Skipped") |
| `proposal.expired` | system | `{proposal_id, kind, version, reason, at}` — `reason` in `ProposalExpiredReason`; enforced by a CHECK on `events` |
| `position.opened` | executor | `{position_key, mint, fill: {sol_lamports, token_amount_raw, exec_price_sol, swap_fee_lamports, network_fee_lamports, slippage_bps, latency_ms}, first_buy}` |
| `position.updated` | exit\|executor | `{position_key, qty_raw, peak_price_sol, realized_lamports, plan_state}` (partial sells, plan state; at most 1 per 5 s; never per tick) |
| `position.closed` | exit\|user | `{position_key, exit_reason, exit_price_sol, sol_out_lamports, pnl_lamports, pnl_pct, hold_seconds}` |
| `fill.simulated` | executor | `{position_key, side, simulated: true, mark_price_sol, exec_price_sol, token_amount_raw, sol_lamports, fee_bps: 125, swap_fee_lamports, network_fee_lamports, slippage_bps, latency_ms}` |
| `exit.triggered` | exit | `{position_key, rule: ExitReason, rule_index, sell_pct, trigger_price_sol, detail}` |
| `portfolio.snapshot` | system | `{cash_lamports, positions_cost_lamports, positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps, drawdown_pct, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq}` |
| `guard.changed` | user\|system | `{guard_change_id, proposal_id, status: requested\|cooling_down\|applied\|reverted\|cancelled, from_rev, to_rev, weakening, weakened_fields[], cooldown_until, auto_revert_at}` |
| `strategy.created/updated/paused/resumed/archived/deleted` | user\|system | `{rev, diff?, expired_proposals?}` |
| `system.notice` | system | `{code, message}` |

### proposal.expired example
```json
{ "id": "30000000-0000-0000-0000-00000000000b:1793263320123:proposal.expired", "seq": 18300,
  "type": "proposal.expired", "version": 1, "workspace_id": "1000...000a", "strategy_id": "2000...000c",
  "ck": "abc123", "mint": "7GCi...W2hr", "ts": "2026-10-29T08:42:00.123Z", "actor": "system",
  "mode": "practice", "untrusted": {},
  "payload": { "proposal_id": "30000000-0000-0000-0000-00000000000b", "kind": "buy_pick", "version": 2,
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

### fill.simulated example
```json
{ "position_key": "abc123.0", "side": "buy", "simulated": true, "mark_price_sol": "0.00000025",
  "exec_price_sol": "0.000000255", "token_amount_raw": "980392156", "sol_lamports": "250000000",
  "fee_bps": 125, "swap_fee_lamports": "3125000", "network_fee_lamports": "25000",
  "slippage_bps": "2.04", "latency_ms": 450 }
```

### portfolio.snapshot example
```json
{ "cash_lamports": "26292000000", "positions_cost_lamports": "1202000000",
  "positions_value_lamports": "1186000000", "equity_lamports": "27478000000",
  "peak_equity_lamports": "30000000000", "drawdown_bps": 840, "drawdown_pct": "8.40",
  "realized_pnl_lamports": "-2506000000", "unrealized_pnl_lamports": "-16000000",
  "open_positions": 6, "as_of_seq": 18233 }
```

## 5. Ordering per pick
`coin.detected -> screener.scored -> guard.result -> pick.created -> [proposal.created ->
proposal.approved|rejected|expired] -> fill.simulated(buy) -> position.opened -> (exit.triggered ->
fill.simulated(sell) -> position.updated)* -> position.closed -> portfolio.snapshot`, reflected in `seq`.
