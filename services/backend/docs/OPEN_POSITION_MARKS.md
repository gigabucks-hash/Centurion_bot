# Open position marks on `position_wire` (contracts 1.1.6, additive)

`GET /v1/workspaces/{ws}/positions` and `GET /v1/workspaces/{ws}/positions/{id}` now carry
three nullable keys for **open** positions:

| key | type | meaning |
|---|---|---|
| `mark_price_sol` | decimal string / null | latest SOL price per whole token |
| `unrealized_pnl_lamports` | integer string / null | `qty * mark - cost_basis`, lamports |
| `as_of` | UTC ISO-8601 / null | time of the pool observation used for the mark |

Rules:

- Null when the mark is unknown: no `pool_states` row, zero reserves, a non-SOL quote, or
  missing coin decimals. Unknown is never reported as `0`; a known zero stays `"0"`.
- Null on closed positions (`pnl_lamports`, `pnl_pct`, `hold_seconds` remain the realized
  fields there).
- `qty_raw` is raw base units; the value uses the coin's `decimals`, the same formula as
  the `position.updated` payload (migration 0003).
- No float on the wire: prices are decimal strings, PnL is an integer string.

## Source and access

`public.pool_states` holds the latest SOL-quoted pool per mint and is service-role only.
`position_wire()` runs as the caller, so it reads the mark through
`public.position_mark(text)`, a narrow security-definer function returning only price and
observation time (never reserves or venue). `authenticated` and `service_role` may execute
it; `anon` may not.

## Migration and tests

- `supabase/migrations/0025_open_position_marks.sql`
- `supabase/tests/98_open_position_marks.sql` (null-vs-zero, closed rows, quote/reserve guards, grants)
- `api/test/open_marks.test.ts` (REST shape on the real API + Postgres)