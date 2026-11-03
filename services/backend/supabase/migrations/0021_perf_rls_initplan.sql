-- PERF_SECURITY (EXPLAIN ANALYZE 2026-11-01, 20k picks): every SELECT policy called the SECURITY DEFINER
-- is_workspace_member(workspace_id) once PER ROW (~40 us each; not inlinable), so a 50-row page of picks/coins
-- seq-scanned and checked all 20k rows (837 ms / 908 ms). Same semantics, evaluated once per statement: membership
-- as an array from a STABLE SECURITY DEFINER function wrapped in a scalar sub-select (InitPlan), compared with
-- = any(). Plus the missing keyset index for the picks list. RLS stays on for every table; only the USING
-- expression changes (roles, commands and names unchanged).
create or replace function public.my_workspace_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.workspace_id), '{}'::uuid[]) from public.workspace_members m where m.user_id = auth.uid()
$$;
revoke execute on function public.my_workspace_ids() from public, anon;
grant execute on function public.my_workspace_ids() to authenticated, service_role;

alter policy approvals_select on public.approvals using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy events_select on public.events using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy fills_select on public.fills using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy guard_changes_select on public.guard_changes using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy jobs_select on public.jobs using ((workspace_id = any ((select public.my_workspace_ids())::uuid[])));
alter policy orders_select on public.orders using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy picks_select on public.picks using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy snapshots_select on public.portfolio_snapshots using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy portfolios_select on public.portfolios using ((workspace_id = any ((select public.my_workspace_ids())::uuid[])));
alter policy positions_select on public.positions using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy practice_resets_select on public.practice_resets using ((workspace_id = any ((select public.my_workspace_ids())::uuid[])));
alter policy strat_select on public.strategies using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND (status <> 'deleted'::strategy_status) AND public.mode_visible(mode)));
alter policy funnel_select on public.strategy_funnel_hourly using (((workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(mode)));
alter policy strategy_revisions_select on public.strategy_revisions using ((EXISTS ( SELECT 1
   FROM public.strategies s
  WHERE ((s.id = strategy_revisions.strategy_id) AND (s.workspace_id = any ((select public.my_workspace_ids())::uuid[])) AND public.mode_visible(s.mode)))));
alter policy twins_select on public.strategy_twins using ((workspace_id = any ((select public.my_workspace_ids())::uuid[])));
alter policy wallets_select on public.wallets using ((workspace_id = any ((select public.my_workspace_ids())::uuid[])));
alter policy wm_select on public.workspace_members using ((workspace_id = any ((select public.my_workspace_ids())::uuid[])));
alter policy ws_select on public.workspaces using ((id = any ((select public.my_workspace_ids())::uuid[])));

-- picks list: keyset order (created_at desc, id desc) within a workspace + mode
create index if not exists picks_ws_mode_created_idx on public.picks (workspace_id, mode, created_at desc, id desc);
-- coins list: latest pick per mint within a workspace (index-only max(created_at) per mint)
create index if not exists picks_ws_mode_mint_created_idx on public.picks (workspace_id, mode, mint, created_at desc);
