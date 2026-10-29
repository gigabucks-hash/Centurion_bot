# Answers for Web (Phase 3 dashboard)

To: Web Design & Frontend Specialist. From: Backend API Specialist. Contract v1.
Note: `/workspace/solbot-dashboard/lib/types.ts` and `lib/api.ts` were **not on disk** when this was
written (only `app/` and the README survived the restore). The TradeEvent notes in (2) are based on the
dashboard README's described model (`<pickKey>:<epochMs>:<kind>` ids, actor/kind feed, exit reasons,
approval kinds). Please diff your actual `types.ts` against `packages/contracts/src/events.ts`.

## 1. Endpoints, auth scopes, event pagination
- Full list: `docs/API_ENDPOINTS.md`. REST under `/v1`, not RPC paths (Flutter uses one Supabase RPC,
  `decide_approval`, that wraps the same SQL function).
- Auth: Supabase Auth JWT (`Authorization: Bearer`) + `X-Workspace-Id`. Scopes `read` (all GETs + SSE +
  guard-impact) and `trade` (all mutations). MCP tokens use the same scopes via OAuth 2.1 PKCE.
- Lists: keyset `?cursor=&limit=` -> `{items, next_cursor}`. Events: `?after_seq=` (forward/resume) or
  `?before_seq=` (scroll back), `limit <= 500`, `{items, next_after_seq, next_before_seq, has_more}`.

## 2. Realtime transport and payload; is TradeEvent close?
- Transport: Supabase Realtime `postgres_changes` (INSERT on `events`, filter `workspace_id`) for the
  feed; Realtime **Broadcast** `marks:<workspace_id>` for mark prices; SSE `/v1/events/stream` as a
  fallback (and for Desktop/MCP). Your `RealtimeProvider` single-connection design fits; swap
  `subscribeActivity()` to Supabase Realtime and implement the resume loop (EVENTS_SCHEMA 3).
- Envelope: `{id, seq, type, version, workspace_id, strategy_id, ts, actor, mode, trail_key, payload}`.
- Changes vs your TradeEvent model:
  1. Your `id = <pickKey>:<epochMs>:<kind>` becomes `trail_key`; `id` is a UUID v7 and **`seq`** is the
     ordering/dedupe/resume key. Sort by `seq`, not by `ts`.
  2. `kind` (`found/passed/armed/bought/sold/...`) becomes dotted `type` (`coin.detected`,
     `screener.scored`, `pick.created`, `position.opened`, `position.closed`, ...). Map for display.
  3. Actor vocabulary: `ingest screener guard entry executor exit user system` (`user` renders "You").
  4. Amounts: `*_lamports` strings and decimal-string prices (no `number`).
  5. Exit reasons: add `stall`, `sell_floor`, `loss_stop`, `strategy_retired` to your list
     (`take_profit stop_loss trailing_stop time_out inactivity drain rug manual`); `time_out` and
     `inactivity` keep your names.
  6. Approval kinds collapse to `buy_pick | guard_change | team_action`; your `sell_all`, `resume_live`
     become `team_action` with `payload.action`; `strategy_settings`/`guard_weakening` become
     `guard_change` with `weakening: true|false`; `withdraw` is Phase 7 (not in v1).
  7. Token name/symbol stays under `untrusted` (matches your plain-text rule).
- `/api/stream` mock: emit `id: <seq>` and the envelope as `data` so the client code is the same.

## 3. Units
Agreed with Apex: lamports as strings, decimal strings for prices, **no floats**. Also: percentages are
decimal strings (`"-35"`), bps/counts/seconds/seq are integers, timestamps RFC 3339 UTC ms. Use
`lamportsToSol()` from `@solbot/contracts` for display. Rust mirrors this with `Lamports(u64)` /
`SignedLamports(i64)` serialized as strings and `rust_decimal` prices serialized as strings.

## 4. Funnel: precomputed or derived, which window?
**Derived from events, materialised hourly**: the worker folds events into `strategy_funnel_hourly`
(strategy_id, hour_utc, scanned, screened_pass, guard_pass, signaled, entered, exited, top rejection
reasons jsonb), tracking `last_seq` so it is idempotent and replayable. `GET /strategies/{id}/funnel?window=`
sums buckets. Windows: `1h | 24h (default) | 7d | 30d | all`, plus `since_rev=true` to count only
the current settings rev. Why: one source (events) means the funnel can never disagree with the feed
(the HOTBOT team-vs-stats mismatch we want to avoid), while reads stay O(hours) instead of scanning
events. Stage mapping matches your README: scanned = `screener.scored`; filtered = screener pass AND
guard != FAIL; signaled = `pick.created` with entry hit or `proposal.created`; entered = `position.opened`;
exited = `position.closed`.

## 5. Exit stats server-side with the same filters?
Yes. `GET /v1/stats/exits?strategy_id=&mode=&window=` aggregates closed positions per `exit_reason`
server-side (count, wins, win_rate_pct, avg/total pnl lamports, avg_pnl_pct, avg_hold_seconds, share_pct)
with the **same filter parser** as `/v1/positions`, so the table and the list always reconcile.

## 6. Approval endpoint: idempotency, version, expires_at
`POST /v1/approvals/{id}/decision` with `{decision, token, expected_version, reason, client}`; optional
`Idempotency-Key` header (the single-use `token` is the natural idempotency key; the header is stored in
`api_idempotency` too). Same token + same decision -> `200` replayed; different decision -> `409
APPROVAL_ALREADY_DECIDED`; stale version -> `409 VERSION_CONFLICT`; expired -> `409 APPROVAL_EXPIRED`
with `reason`. `expires_at` is set by the backend only (defaults: 10 min for pick proposals, 24 h for
guard changes, configurable per workspace); render the countdown from it, do not compute TTLs client-side.

## 7. Single source of truth for cash, equity, drawdown
`portfolio_snapshots` (written by the worker after every fill and every <= 60 s with fresh marks) and
the `portfolio_latest` view. `GET /portfolio/overview`, `GET /stats/strategies`, the equity chart and
the `portfolio.snapshot` event all read it, and each carries `as_of_seq` so you can tell which events are
already included. Definitions: cash = paper start + sum(sell proceeds) - sum(buy cost incl. fees);
invested = sum(open qty x mark); equity = cash + invested; drawdown_pct = (peak_equity - equity) / peak_equity.
