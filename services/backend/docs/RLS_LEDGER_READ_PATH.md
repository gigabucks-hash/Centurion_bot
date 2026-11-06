# Proposal: a security-definer read path for the closed ledger (not implemented)

Status: **proposal only.** No RLS policy, grant, role or migration is changed by this document or by
the 0023 work. Owner approval is required before any SQL lands.

## Problem

`0023_pnl_closed_ledger_indexes.sql` adds `positions_closed_ws_mode_sort_idx` and
`positions_closed_ws_mode_close_idx` (partial, `where status = 'closed'`). Executed as the table owner
the planner uses them: first page, keyset page and windows all produce `Limit` + index order, no
`Sort` (`api/test/ledger_index.test.ts`). Through the API, every read runs as the caller
(`asUser`), so `positions_select` applies:

```sql
workspace_id = any(public.my_workspace_ids())
```

`my_workspace_ids()` is a `ScalarArrayOp` on the right-hand side. The planner cannot prove that the
array has exactly one element, so it cannot use `workspace_id` as the leading equality of the index
order. Measured at 20k closed rows (2026-11-06):

| Path | Plan | Time |
|---|---|---|
| owner (no RLS) | index scan, no Sort | ~0.04 ms |
| `positions_select` | index + Sort (or seq + Sort) | ~8 ms |

Rewriting the policy as `workspace_id in (select …)` was measured and does **not** change the
plan. The options are (a) leave it as documented, (b) change the policy (rejected for now: wider
security surface, needs a migration review), or (c) route this one read through a security-definer
function — proposed below.

## Proposed shape

A single `STABLE SECURITY DEFINER` function that performs the whole page, so the planner runs the
query as the owner while membership is checked once, explicitly, inside the function:

```sql
create function public.positions_page(
  p_workspace uuid,
  p_mode public.trade_mode,
  p_state public.position_status,
  p_strategy uuid,
  p_epoch int,
  p_from timestamptz,
  p_to timestamptz,
  p_cursor_ts timestamptz,
  p_cursor_id uuid,
  p_limit int
)
returns setof public.positions
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
    from public.positions p
   where p_workspace = any(public.my_workspace_ids())   -- the only authorization check
     and p.workspace_id = p_workspace
     and p.mode = p_mode
     and (p_state is null or p.status = p_state)
     and (p_strategy is null or p.strategy_id = p_strategy)
     and p.practice_epoch = coalesce(p_epoch, (select practice_epoch from public.workspaces where id = p_workspace))
     and (p_from is null or coalesce(p.closed_at, p.opened_at) >= p_from)
     and (p_to is null or coalesce(p.closed_at, p.opened_at) < p_to)
     and (p_cursor_ts is null or (coalesce(p.closed_at, p.opened_at), p.id) < (p_cursor_ts, p_cursor_id))
   order by coalesce(p.closed_at, p.opened_at) desc, p.id desc
   limit p_limit;
$$;

revoke all on function public.positions_page(uuid, public.trade_mode, public.position_status, uuid, int,
  timestamptz, timestamptz, timestamptz, uuid, int) from public, anon;
grant execute on function public.positions_page(...) to authenticated, service_role;
```

### Why this is safe enough to consider

- `security definer` bypasses RLS inside the function, so the **first** predicate must be the
  authorization predicate; it uses the same `my_workspace_ids()` the policy uses, evaluated once as
  an `InitPlan`.
- `set search_path = ''` and fully-qualified names prevent object shadowing.
- `stable` (no writes), `returns setof`, no dynamic SQL, no caller-controlled SQL text.
- Inputs are scalars; the function cannot read another workspace by construction (the membership
  check is on the same id it filters).
- `anon` and `public` lose execute; only `authenticated` (the API's `asUser` role) and
  `service_role` may call it.

### Costs / open questions

1. **A second read path.** The route would call the function instead of the table; anything that
   later reads `positions` directly keeps the slow plan. Either accept the split or move all ledger
   reads behind similar functions.
2. **RLS is bypassed for that table inside the function.** Every future column added to
   `positions` becomes readable through this function; column-level grants are not applied because
   the function returns the table type today. Returning an explicit column list (or the
   `position_wire` jsonb) narrows that surface but grows the migration.
3. **`my_workspace_ids()` must stay the single source of truth.** If the policy ever gains extra
   conditions (epoch, archived), the function must mirror them in the same migration.
4. **`security definer` functions are a privilege boundary.** Security review should sign off the
   owner, `search_path`, grants and the exact predicate before it is created; the SQL tests should
   prove that a non-member calling it gets zero rows and that a member cannot pass another
   workspace id.

## Recommendation

Keep 0023 and the current RLS policy. Treat the ~8 ms sort as acceptable for the paper ledger (50
rows/page, no hot loop) and document it. Revisit the security-definer path only if the ledger becomes
a measured bottleneck after real data volume, with the security review above attached to the
migration.