# Ranged keyset cursors: frozen range + cursor binding (additive)

Status: implemented in `services/backend/api`, contract **1.1.6 unchanged** (no field removed, no type
changed, no new required input). Paper mode only.

## Defect (F4)

A ranged list resolved `window` per request (`rules.ts` `timeRange`: `from = now - window`). Page 2
sent the same `window=7d` minutes later, so its lower bound moved forward and the oldest rows of the
range disappeared. A cursor minted under `window=30d` replayed against `window=7d` silently skipped
rows across ranges.

## Wire behaviour

1. Page 1 resolves `window`/`from`/`to` once and freezes `[from, to)`.
2. The response carries the frozen bounds as `range_from` / `range_to` (both optional, `null` open).
3. `next_cursor` now embeds the frozen bounds and the `window` key it came from:
   `base64url("ts|id|from|to|window")`. Empty parts mean open/absent. A legacy 2-part cursor
   (`ts|id`) is still accepted and upgraded to the bound form on the next page.
4. Page 2+:
   - same `window=7d` (or no range params at all) → the frozen range is reused; `range_from` is
     byte-identical to page 1.
   - a different `window` (`30d`, `1h`, `all`) → `400 CURSOR_INVALID`,
     `reason: "cursor belongs to another range"`.
   - explicit `from`/`to` that equal the frozen bounds → accepted; anything that narrows or moves the
     range → `400 CURSOR_INVALID`.
   - unknown `window` inside a forged cursor → `400 CURSOR_INVALID` at decode.
5. Only the range is frozen. Filters (`state`, `strategy_id`, `position_id`, `action`, `stage`, …)
   are still the caller's responsibility; a filter change with the same range is the existing
   client-side cursor-drop rule.

Applied to `GET /positions` (ranged when `window`/`from`/`to` is present, otherwise unbounded),
`GET /coins`, `GET /fills`, `GET /audit-log`. `picks`, `guard-changes`, `approvals`, `devices`,
`resets` and `events` are not time-ranged and keep 2-part cursors.

Example (values truncated):

```json
{
  "items": [ ... ],
  "next_cursor": "MjAyNi0xMS0wNlQwMDowMDowMC4wMDBafDYwMDAwMDAw...",
  "range_from": "2026-10-30T00:00:00.000Z",
  "range_to": null
}
```

## Malformed cursors (F5)

`CURSOR_ID.uuid` is now the canonical `8-4-4-4-12` hex form. The old `^[0-9a-f-]{36}$` accepted 36
hyphens, which passed decoding and then failed `$9::uuid` with a 500. Any malformed or wrong-kind
cursor is `400 CURSOR_INVALID` before SQL.

## Proof

- `api/test/paging_range.test.ts`: range echoed and identical after a delay; a full 7d walk returns
  every in-range row once; foreign window/range → 400; explicit equal `from` accepted; legacy cursor
  still pages; 36-hyphen and near-miss uuids → 400 on `/positions`, `/picks`, `/fills`,
  `/guard-changes`.
- `api/test/ledger_index.test.ts`: `EXPLAIN` for the frozen-range + cursor page still seeks
  `positions_closed_ws_mode_sort_idx` with `Limit` and no `Sort`.

## Limits

The frozen range removes the recompute loss, not concurrent inserts: a row committed with a close
time newer than page 1 does not appear in that walk (standard keyset semantics). `to` stays open by
default, so new closes at the top of a `window` walk are likewise not back-filled.