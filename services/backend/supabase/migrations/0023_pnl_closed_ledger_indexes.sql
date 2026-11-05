-- PnL closed-ledger access paths (contracts 1.1.6; additive only, no policy or gate change).
--
-- 1) Ledger order: GET /positions?state=closed orders by coalesce(closed_at, opened_at) desc, id desc
--    within one workspace+mode. Partial: only closed rows are in the ledger.
--
--    Measured 2026-11-06 with 20k closed positions: an internal (service-role) read uses this index and
--    returns the first 51 rows in 0.04 ms with no Sort. A read through the API still top-N sorts (8 ms),
--    because positions_select adds `workspace_id = any(my_workspace_ids())` and a ScalarArrayOp stops the
--    planner from proving the single-workspace equality that index order needs. Fixing that needs a policy
--    or security-definer read path (separate decision); the index is correct either way.
create index if not exists positions_closed_ws_mode_sort_idx
  on public.positions (
    workspace_id,
    mode,
    (coalesce(closed_at, opened_at)) desc,
    id desc
  )
  where status = 'closed';

-- 2) Close-time lookups: pnl_summary()/exit_stats() and the report's window filter range over closed_at.
create index if not exists positions_closed_ws_mode_close_idx
  on public.positions (workspace_id, mode, closed_at desc, id desc)
  where status = 'closed';