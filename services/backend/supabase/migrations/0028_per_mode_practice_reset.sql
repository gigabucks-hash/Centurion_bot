-- Per-mode isolation for paper reset and portfolio snapshots.
-- Real remains locked: this only makes future real-mode rows non-destructive/read-isolated.

create or replace view public.workspace_equity_latest with (security_invoker = true) as
  select distinct on (s.workspace_id, s.mode) s.*
    from public.portfolio_snapshots s
    join public.workspaces w on w.id = s.workspace_id
      and (s.mode = 'real' or (s.mode = 'practice' and s.practice_epoch = w.practice_epoch))
   order by s.workspace_id, s.mode, s.ts desc, s.id desc;

-- Same column list/order as 0003 (CREATE OR REPLACE cannot rename or reorder).
create or replace view public.portfolio_latest with (security_invoker = true) as
  select workspace_id, mode, practice_epoch, ts, cash_lamports, positions_cost_lamports, positions_value_lamports,
         equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports,
         open_positions, as_of_seq
    from public.workspace_equity_latest;

-- pnl_summary: the practice epoch only pins practice rows; a real row is not hidden by a later
-- practice reset (same shape as 0022, only the epoch predicate changes).
create or replace function public.pnl_summary(
  p_workspace uuid, p_strategy uuid default null, p_mode public.trade_mode default null,
  p_from timestamptz default null, p_to timestamptz default null)
returns table (closed_count bigint, win_count bigint, win_rate_pct numeric, realized_pnl_lamports text,
               fees_lamports text, avg_hold_s bigint, best_pnl_lamports text, worst_pnl_lamports text)
language sql stable security invoker as $$
  with closed as (
    select (p.sol_out_lamports - p.sol_in_lamports)::bigint as pnl,
           p.fees_lamports,
           extract(epoch from (p.closed_at - p.opened_at))::bigint as hold_s
      from public.positions p
     where p.workspace_id = p_workspace and p.status = 'closed' and p.archived_at is null
       and (p.mode <> 'practice' or p.practice_epoch = (select practice_epoch from public.workspaces where id = p_workspace))
       and p.exit_reason <> 'practice_reset'
       and (p_strategy is null or p.strategy_id = p_strategy)
       and (p_mode is null or p.mode = p_mode)
       and (p_from is null or p.closed_at >= p_from)
       and (p_to is null or p.closed_at < p_to)
  )
  select count(*),
         count(*) filter (where pnl > 0),
         case when count(*) = 0 then null
              else round(count(*) filter (where pnl > 0)::numeric * 100 / count(*), 2) end,
         coalesce(sum(pnl), 0)::text,
         coalesce(sum(fees_lamports), 0)::text,
         case when count(*) = 0 then null else round(avg(hold_s))::bigint end,
         case when count(*) = 0 then null else max(pnl)::text end,
         case when count(*) = 0 then null else min(pnl)::text end
    from closed
$$;

create or replace function public.reset_practice(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w public.workspaces;
  v_actor uuid := auth.uid();
  last_at timestamptz;
  t timestamptz := clock_timestamp();
  n_open integer; n_pos integer; n_fills integer; n_snaps integer; n_exp integer := 0;
  r record;
  archived jsonb;
  next_at timestamptz := t + interval '24 hours';
begin
  select * into w from public.workspaces where id = p_workspace and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0404', message = 'NOT_FOUND'; end if;
  if auth.uid() is not null and not public.has_workspace_role(p_workspace, array['owner', 'admin', 'trader']::public.workspace_role[]) then
    raise exception using errcode = 'P0403', message = 'FORBIDDEN_ROLE';
  end if;
  if w.mode <> 'practice' then raise exception using errcode = 'P0403', message = 'MODE_NOT_ALLOWED'; end if;
  select max(created_at) into last_at from public.practice_resets where workspace_id = p_workspace;
  if last_at is not null and last_at > t - interval '24 hours' then
    raise exception using errcode = 'P0429', message = 'RESET_COOLDOWN',
      detail = jsonb_build_object('next_allowed_at', to_char((last_at + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                                  'last_reset_at', to_char(last_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text;
  end if;

  for r in select a.id from public.approvals a
    where a.workspace_id = p_workspace and a.mode = 'practice' and a.kind = 'buy_pick' and a.status in ('pending', 'approved') for update
  loop n_exp := n_exp + public.expire_proposal(r.id, 'practice_reset')::int; end loop;

  update public.positions set status = 'closed', closed_at = t, exit_reason = 'practice_reset'
    where workspace_id = p_workspace and mode = 'practice' and status = 'open';
  get diagnostics n_open = row_count;
  update public.positions set archived_at = t
    where workspace_id = p_workspace and mode = 'practice' and archived_at is null;
  get diagnostics n_pos = row_count;
  select count(*) into n_fills from public.fills where workspace_id = p_workspace and mode = 'practice' and practice_epoch = w.practice_epoch;
  select count(*) into n_snaps from public.portfolio_snapshots where workspace_id = p_workspace and mode = 'practice' and practice_epoch = w.practice_epoch;

  update public.workspaces set practice_epoch = practice_epoch + 1 where id = p_workspace;
  update public.strategies set first_buy_at = null where workspace_id = p_workspace and mode = 'practice' and first_buy_at is not null;
  update public.portfolios set first_buy_at = null where workspace_id = p_workspace and mode = 'practice' and first_buy_at is not null;
  insert into public.portfolio_snapshots (workspace_id, mode, ts, cash_lamports, positions_cost_lamports, positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq)
    values (p_workspace, 'practice', t, w.practice_start_lamports, 0, 0, w.practice_start_lamports, w.practice_start_lamports, 0, 0, 0, 0, coalesce((select max(seq) from public.events), 0));
  archived := jsonb_build_object('positions', n_pos, 'closed_open_positions', n_open, 'fills', n_fills, 'snapshots', n_snaps, 'expired_proposals', n_exp);
  insert into public.practice_resets (workspace_id, from_epoch, to_epoch, starting_lamports, actor_user, archived, created_at) values (p_workspace, w.practice_epoch, w.practice_epoch + 1, w.practice_start_lamports, v_actor, archived, t);
  insert into public.events (id, workspace_id, ts, type, actor, payload) values (p_workspace::text || ':' || (extract(epoch from t) * 1000)::bigint || ':practice.reset', p_workspace, t, 'practice.reset', (case when v_actor is null then 'system' else 'user' end)::public.event_actor, jsonb_build_object('epoch', w.practice_epoch + 1, 'previous_epoch', w.practice_epoch, 'starting_balance_lamports', w.practice_start_lamports::text, 'archived', archived, 'next_allowed_at', to_char(next_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'at', to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, before, after) values (p_workspace, v_actor, (case when v_actor is null then 'system' else 'user' end)::public.event_actor, public.request_via(), 'practice.reset', 'workspace', p_workspace::text, jsonb_build_object('epoch', w.practice_epoch), jsonb_build_object('epoch', w.practice_epoch + 1) || archived);
  return jsonb_build_object('epoch', w.practice_epoch + 1, 'starting_balance_lamports', w.practice_start_lamports::text, 'archived', archived, 'next_allowed_at', next_at, 'server_now', t);
end $$;
