# Stream Event Schema (v1)

Status: **contract v1, frozen for client work** (Web, Flutter, Desktop, MCP). Additive changes only;
breaking changes bump `version`. Owner: Backend API Specialist. Source types:
`packages/contracts/src/events.ts` (TS) and `crates/common/src/events.rs` (Rust).

## 1. Wire rules (apply to every payload)

| Kind of value | Wire type | Example |
|---|---|---|
| SOL / token amounts | **string**, integer base units (lamports for SOL, raw units for SPL) | `"250000000"` (= 0.25 SOL) |
| Prices (USD or SOL per token) | **decimal string**, no exponent | `"0.000012345678"` |
| Percentages / ratios | **decimal string**, percent units | `"-35"`, `"12.5"` |
| Basis points, counts, seconds, slots, seq | JSON integer | `125`, `300` |
| Timestamps | RFC 3339 UTC, millisecond precision | `"2026-10-29T08:42:00.123Z"` |
| IDs | string (UUID v7 for rows, base58 for mints/wallets) | |

**No floats over the wire. Ever.** Clients parse amounts with BigInt / `BigInt` / Rust `u64` and prices
with a decimal library (`decimal.js`, Dart `decimal`, Rust `rust_decimal`).

Token metadata (name, symbol, image URL, description) is attacker controlled and is always placed under
`untrusted`. Render it as plain text only; never interpret it, never feed it to an LLM prompt unescaped.

## 2. Envelope

```json
{
  "id": "0192d6a4-6c1e-7b3a-9f1e-2b4f1c9d0a11",
  "seq": 18234,
  "type": "position.opened",
  "version": 1,
  "workspace_id": "0192d6a0-0000-7000-8000-000000000001",
  "strategy_id": "0192d6a0-0000-7000-8000-0000000000aa",
  "ts": "2026-10-29T08:42:00.123Z",
  "actor": "executor",
  "mode": "paper",
  "trail_key": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU:1793263320123:position.opened",
  "payload": { }
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID v7) | Globally unique; safe dedupe key. |
| `seq` | integer | **Strictly increasing and gapless per workspace.** Allocated under a row lock on `workspace_counters`, so commit order == seq order inside a workspace. Resume and pagination use it. |
| `type` | string | One of the types in section 4. Unknown types must be ignored by clients (forward compatible). |
| `version` | integer | Payload schema version for that `type`. Currently `1` for all types. |
| `workspace_id` | string | Always set. RLS scopes delivery to workspace members. |
| `strategy_id` | string \| null | Null for workspace-level events (`portfolio.snapshot`, workspace guard changes). |
| `ts` | string | When the fact happened (server clock, UTC). |
| `actor` | enum | `ingest` `screener` `guard` `entry` `executor` `exit` `user` `system`. UI label "You" = `user`. |
| `mode` | enum | `paper` only until Phase 7. `live` is reserved and rejected by the DB CHECK today. |
| `trail_key` | string \| null | `<mint>:<epoch_ms>:<type>`; human-readable coin trail key (blueprint style). Not unique across strategies; use `id`. |
| `payload` | object | Type-specific (section 4). |

## 3. Transport

Three channels, one schema:

1. **Supabase Realtime `postgres_changes`** on `public.events` (INSERT only), filter `workspace_id=eq.<id>`.
   RLS on `events` restricts rows to workspace members. Row columns == envelope fields (`payload` is jsonb).
   This is the primary feed for Web and Flutter.
2. **Supabase Realtime Broadcast** channel `marks:<workspace_id>` for mark prices (high frequency,
   ephemeral, **never written to a table**). Private channel; authorised by a Realtime RLS policy on
   `realtime.messages` that checks workspace membership. Message:
   ```json
   { "event": "mark", "payload": {
       "mint": "7xKX...gAsU", "price_usd": "0.000041230000", "price_sol": "0.000000213400",
       "liquidity_usd": "48211.50", "slot": 301223344, "ts": "2026-10-29T08:42:01.020Z",
       "position_ids": ["0192d6a5-..."] } }
   ```
   Throttled server-side to <= 4 msgs/s per mint and only for mints with an open position or a pending
   proposal in that workspace. Marks are not part of `seq`; after reconnect clients refetch positions.
3. **SSE** `GET /v1/events/stream?after_seq=<n>` (API service) for Desktop, MCP and any non-Supabase
   client. Each SSE message: `id: <seq>`, `event: <type>`, `data: <envelope json>`. Honours
   `Last-Event-ID` for resume. Heartbeat comment every 15 s.

### Resume-from-seq algorithm (all clients)

```
last = persisted last_seq (0 on first run)
subscribe realtime (buffer incoming events, do not apply yet)
loop: page = GET /v1/events?after_seq=last&limit=500
      apply page.items in order; last = page.next_after_seq
      until page.has_more == false
apply buffered events where seq > last, in seq order; then apply live
on gap detected (incoming.seq > last + 1): re-run the backfill loop from last
```

Dedupe on `seq` (or `id`). Because seq is gapless per workspace, a gap always means a missed message.

### Cursor pagination on seq

`GET /v1/events?after_seq=<n>&limit=<1..500>&types=a,b&strategy_id=<id>` ascending (forward/resume), or
`?before_seq=<n>` descending (history scroll-back). Response:

```json
{ "items": [ /* envelopes */ ], "next_after_seq": 18234, "next_before_seq": null, "has_more": true }
```

When filters are applied, seq values in a page are not contiguous; gap detection only applies to the
unfiltered stream. Retention: events are kept forever in paper mode (append-only); the API may archive
events older than 90 days to cold storage with `CURSOR_EXPIRED` returned for older cursors.

## 4. Event types

Reason/enum vocabularies used below:

- `ExitReason`: `take_profit` `stop_loss` `trailing_stop` `time_out` `inactivity` `drain` `stall` `rug`
  `sell_floor` `loss_stop` `manual` `strategy_retired`
- `GuardVerdict`: `PASS` `WARN` `FAIL`
- `ProposalKind`: `buy_pick` `guard_change` `team_action`
- `ProposalExpiredReason`: `timeout` `strategy_deleted` `strategy_archived` `guard_failed` `price_moved`
- `Stream`: `bonding` `graduated`

### coin.detected (actor `ingest`, strategy_id null)
Ingest is global (table `coins`); the event is fanned out only to workspaces with a running strategy
subscribed to that `stream`, at most once per workspace per mint.
```json
{ "mint": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "stream": "bonding",
  "source": "pumpportal", "launchpad": "pump_fun", "pool_program": null,
  "creator": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "slot": 301223001,
  "decimals": 6, "price_usd": "0.000004100000", "market_cap_usd": "4100.00",
  "liquidity_usd": "8200.00",
  "untrusted": { "name": "Example", "symbol": "EXM", "uri": "https://..." } }
```

### screener.scored (actor `screener`)
```json
{ "pick_candidate_id": "0192...", "mint": "7xKX...gAsU", "strategy_rev": 7,
  "passed": true, "score": 92, "pass_mark": 80,
  "hard": [ { "rule": "min_liquidity_usd", "passed": true, "measured": "8200.00", "threshold": "5000" } ],
  "weighted": [ { "rule": "max_top10_pct", "points": 20, "max_points": 25,
                  "measured": "31.2", "threshold": "35" } ],
  "rejected_by": null }
```
`rejected_by` = first failing hard rule id, or `"pass_mark"`, when `passed` is false.

### guard.result (actor `guard`)
```json
{ "mint": "7xKX...gAsU", "strategy_rev": 7, "verdict": "WARN", "snapshot_id": "0192...",
  "checks": [
    { "check": "mint_authority", "verdict": "PASS", "reason": "Mint authority revoked" },
    { "check": "top_holders", "verdict": "WARN", "reason": "Top 10 hold 31.2% (warn >= 30)",
      "measured": "31.2", "threshold": "30" },
    { "check": "sell_simulation", "verdict": "PASS", "reason": "Simulated sell ok, tax 0 bps" } ] }
```

### pick.created (actor `screener`)
```json
{ "pick_id": "0192...", "mint": "7xKX...gAsU", "strategy_rev": 7, "score": 92,
  "guard_verdict": "WARN", "pick_price_usd": "0.000004100000",
  "entry": { "state": "watching", "dip_pct": "8", "delay_seconds": 0, "max_up_pct": "17",
             "expires_at": "2026-10-29T08:52:00.000Z" },
  "untrusted": { "symbol": "EXM" } }
```

### proposal.created (actor `entry` | `user` | `system`)
```json
{ "proposal_id": "0192...", "kind": "buy_pick", "version": 1,
  "expires_at": "2026-10-29T08:52:00.000Z", "pick_id": "0192...", "first_buy": true,
  "approval_mode": "ask_first_buy", "amount_lamports": "187500000", "risk_level": "medium",
  "summary": "Buy 0.1875 SOL of EXM at market", "base_rev": null, "diff": null }
```
For `kind: "guard_change"`: `pick_id` null, `base_rev` set, `diff` = `{ "<settings path>": [old, new] }`,
`weakening: true|false`, `impact` = replay result (see API `POST /v1/strategies/{id}/guard-impact`),
default TTL 24 h.

### proposal.approved / proposal.rejected (actor `user`)
```json
{ "proposal_id": "0192...", "kind": "buy_pick", "version": 2, "decided_by": "0192...user",
  "decided_via": "web", "reason": null }
```
`decided_via`: `web` `mobile` `desktop` `mcp` `push`. UI label for `rejected` is "Skipped".

### proposal.expired (actor `system` | `user`)
```json
{ "proposal_id": "0192...", "kind": "buy_pick", "version": 2, "reason": "strategy_deleted",
  "detail": "Strategy was deleted while the proposal was pending" }
```
`reason` is `ProposalExpiredReason`. `strategy_deleted`/`strategy_archived` are emitted in the same DB
transaction that retires the strategy (`retire_strategy()`), so a client can never observe a pending
proposal whose strategy is gone.

### position.opened (actor `executor`)
```json
{ "position_id": "0192...", "position_key": "7xKX...gAsU.0", "pick_id": "0192...",
  "mint": "7xKX...gAsU", "entry_price_usd": "0.000004182000", "qty_raw": "44834929",
  "sol_in_lamports": "187500000", "fee_lamports": "2343750", "first_buy": true,
  "exit_plan": "ladder" }
```

### position.updated (actor `exit` | `executor`)
Emitted on partial sells, plan state changes (trail armed, step locked), and peak changes at most once
per 5 s. Not emitted per mark tick (marks are Broadcast).
```json
{ "position_id": "0192...", "qty_raw": "29889953", "peak_price_usd": "0.000006010000",
  "realized_lamports": "61120000", "plan_state": { "rungs_hit": [0], "trail_armed": true } }
```

### position.closed (actor `exit` | `user`)
```json
{ "position_id": "0192...", "exit_reason": "trailing_stop", "exit_price_usd": "0.000005400000",
  "sol_out_lamports": "231200000", "pnl_lamports": "43700000", "pnl_pct": "23.31",
  "hold_seconds": 19 }
```

### fill.simulated (actor `executor`)
```json
{ "fill_id": "0192...", "position_id": "0192...", "side": "buy", "simulated": true,
  "mark_price_usd": "0.000004100000", "fill_price_usd": "0.000004182000",
  "qty_raw": "44834929", "sol_lamports": "187500000", "fee_bps": 125, "fee_lamports": "2343750",
  "priority_fee_lamports": "50000", "slippage_bps": 200, "latency_ms": 450,
  "quote_slot": 301223010, "fill_slot": 301223011 }
```

### exit.triggered (actor `exit`)
```json
{ "position_id": "0192...", "rule": "take_profit", "rule_index": 0, "sell_pct": "33.33",
  "trigger_price_usd": "0.000006150000", "detail": "Rung 1: +50% sell 1/3" }
```
`rule` is an `ExitReason`. `sell_floor` rules are evaluated before every other rule.

### portfolio.snapshot (actor `system`, strategy_id null or set for per-strategy)
```json
{ "snapshot_id": "0192...", "scope": "workspace", "cash_lamports": "26292000000",
  "invested_lamports": "1186000000", "equity_lamports": "27478000000",
  "realized_pnl_lamports": "-2506000000", "unrealized_pnl_lamports": "-16000000",
  "peak_equity_lamports": "30000000000", "drawdown_pct": "8.41", "open_positions": 6,
  "as_of_seq": 18233 }
```
Emitted after every fill and at most once per 60 s otherwise. Identical numbers to
`GET /v1/portfolio/overview`, because both read `portfolio_snapshots`.

### guard.changed (actor `user` | `system`)
```json
{ "guard_change_id": "0192...", "proposal_id": "0192...", "status": "applied",
  "from_rev": 7, "to_rev": 8, "weakening": true, "diff": { "guard.max_dev_pct": ["5", "10"] },
  "cooldown_until": null, "revert_at": null }
```
`status`: `applied` `cooldown` `reverted` `cancelled`. `cooldown`/auto-revert only applies to live
mode and is disabled until Phase 7.

### Other types (also v1)
`strategy.created`, `strategy.updated` (`{rev, diff}`), `strategy.paused`, `strategy.resumed`,
`strategy.archived`, `strategy.deleted`, `entry.armed`, `entry.expired`, `job.failed`,
`system.notice`. Clients must ignore types they do not know.

## 5. Ordering guarantees per pick

`coin.detected` -> `screener.scored` -> `guard.result` -> `pick.created` -> [`proposal.created` ->
`proposal.approved|rejected|expired`] -> `fill.simulated(buy)` -> `position.opened` ->
(`exit.triggered` -> `fill.simulated(sell)` -> `position.updated`)* -> `position.closed` ->
`portfolio.snapshot`. Within a workspace this order is reflected in `seq`.
