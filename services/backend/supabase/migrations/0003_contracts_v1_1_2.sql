-- Contracts v1.1.2 (practice only; no Real SOL path).
--   * coins: decimals (from the mint account, never assumed), token_program, quote_mint
--   * positions: rev (optimistic concurrency, If-Match on close), cost_basis_lamports
--   * orders: manual close (fraction_bps) with idempotency; async fill via jobs
--   * close_position / complete_order_fill / fail_order
--   * exit_stats(): one shape shared with GET /stats/exit-reasons
--   * portfolio_latest: explicit columns incl. practice_epoch

-- ---------------------------------------------------------------------------
-- 1. coin wire facts (Q1)
-- ---------------------------------------------------------------------------
alter table public.coins add column token_program text
  check (token_program is null or token_program in ('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                                                    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'));
alter table public.coins add column quote_mint text check (quote_mint is null or public.is_base58_address(quote_mint));
comment on column public.coins.decimals is 'From the mint account (getAccountInfo). NULL until read; clients never assume 6.';
comment on column public.coins.quote_mint is 'Curve/pool quote mint. NULL or wSOL = SOL. Anything else is not tradeable (UNSUPPORTED_QUOTE_MINT).';

-- ---------------------------------------------------------------------------
-- 2. positions.rev (Q9/Q16)
-- ---------------------------------------------------------------------------
alter table public.positions add column rev integer not null default 1 check (rev >= 1);
alter table public.positions add column cost_basis_lamports bigint not null default 0 check (cost_basis_lamports >= 0);
alter table public.fills add column mid_price_sol numeric(38, 18);
alter table public.fills add column price_impact_bps integer not null default 0;
alter table public.fills add column order_id uuid;

create or replace function public.positions_bump_rev()
returns trigger language plpgsql as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.rev := old.rev + 1;
  end if;
  return new;
end $$;
create trigger positions_rev before update on public.positions
  for each row execute function public.positions_bump_rev();

-- Wire shape of a position (REST, close response, position.* payloads). Lamports/qty = strings.
create or replace function public.position_wire(p public.positions)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'position_key', p.position_key, 'workspace_id', p.workspace_id, 'strategy_id', p.strategy_id,
    'mint', p.mint, 'mode', p.mode, 'status', p.status, 'rev', p.rev, 'practice_epoch', p.practice_epoch,
    'qty_raw', p.qty_raw::text, 'decimals', c.decimals, 'token_program', c.token_program,
    'cost_basis_lamports', p.cost_basis_lamports::text,
    'sol_in_lamports', p.sol_in_lamports::text, 'sol_out_lamports', p.sol_out_lamports::text,
    'fees_lamports', p.fees_lamports::text,
    'avg_entry_price_sol', p.entry_price_sol::text, 'peak_price_sol', p.peak_price_sol::text,
    'exit_price_sol', p.exit_price_sol::text, 'exit_reason', p.exit_reason,
    'opened_at', to_char(p.opened_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'closed_at', to_char(p.closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  from (select 1) one left join public.coins c on c.mint = p.mint
$$;

-- ---------------------------------------------------------------------------
-- 3. orders (Q7): one row per close request; filled asynchronously by the executor worker
-- ---------------------------------------------------------------------------
create type public.order_status as enum ('queued', 'filled', 'failed');
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id),
  position_id      uuid not null references public.positions (id),
  mint             text not null,
  mode             public.trade_mode not null default 'practice' constraint orders_practice_only check (mode = 'practice'),
  side             public.fill_side not null default 'sell',
  kind             text not null default 'manual_close' check (kind in ('manual_close')),
  fraction_bps     integer not null check (fraction_bps between 1 and 10000),
  status           public.order_status not null default 'queued',
  reason_code      text,
  job_id           bigint,
  fill_id          uuid,
  practice_epoch   integer not null default 0,
  requested_by     uuid,
  requested_via    text,
  idempotency_key  text not null check (length(idempotency_key) between 8 and 128),
  request_hash     text not null,
  response         jsonb,
  created_at       timestamptz not null default clock_timestamp(),
  updated_at       timestamptz not null default clock_timestamp(),
  unique (workspace_id, idempotency_key)
);
create index orders_position_idx on public.orders (position_id, created_at desc);
alter table public.orders enable row level security;
create policy orders_select on public.orders for select to authenticated
  using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
revoke all on public.orders from anon;
revoke insert, update, delete, truncate on public.orders from authenticated;
revoke select on public.orders from authenticated;
grant select (id, workspace_id, position_id, mint, mode, side, kind, fraction_bps, status, reason_code, job_id, fill_id,
              practice_epoch, created_at, updated_at) on public.orders to authenticated;

create or replace function public.order_wire(o public.orders)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', o.id, 'position_id', o.position_id, 'mint', o.mint, 'mode', o.mode,
    'side', o.side, 'kind', o.kind, 'fraction_bps', o.fraction_bps, 'status', o.status,
    'reason_code', o.reason_code, 'job_id', o.job_id::text, 'fill_id', o.fill_id,
    'practice_epoch', o.practice_epoch,
    'created_at', to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updated_at', to_char(o.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

create or replace function public.emit_ws_event(p_ws uuid, p_subject text, p_type text, p_strategy uuid,
                                               p_mint text, p_actor public.event_actor, p_payload jsonb)
returns void language sql as $$
  insert into public.events (id, workspace_id, strategy_id, mint, ts, type, actor, payload)
  values (p_subject || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint || ':' || p_type,
          p_ws, p_strategy, p_mint, clock_timestamp(), p_type, p_actor, p_payload)
$$;

-- Manual sell. Clients send: p_position_id, p_expected_rev (position rev; REST If-Match), p_idempotency_key
-- (REST Idempotency-Key), p_fraction_bps (1-10000, default 10000 = all). Actor = auth.uid().
-- Same key + same body -> original response with replayed=true; same key + other body -> 422 IDEMPOTENCY_KEY_REUSED.
-- Response: {position, order, order_id, fill:null, job_id, status:'queued', replayed, server_now}.
create or replace function public.close_position(
  p_position_id uuid, p_expected_rev integer, p_idempotency_key text, p_fraction_bps integer default 10000)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  p public.positions;
  o public.orders;
  h text;
  jid bigint;
  resp jsonb;
  t timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0401'; end if;
  select * into p from public.positions where id = p_position_id for update;
  if not found or not public.is_workspace_member(p.workspace_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0404';
  end if;
  if not public.has_workspace_role(p.workspace_id, '{owner,admin,trader}') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'P0403';
  end if;
  if p.mode <> 'practice' then raise exception 'MODE_NOT_ALLOWED' using errcode = 'P0403'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422',
      detail = '{"field":"idempotency_key","hint":"8-128 chars"}';
  end if;
  h := encode(digest(concat_ws('|', p_position_id, p_expected_rev, p_fraction_bps), 'sha256'), 'hex');
  select * into o from public.orders where workspace_id = p.workspace_id and idempotency_key = p_idempotency_key;
  if found then
    if o.request_hash = h then
      return o.response || jsonb_build_object('replayed', true, 'server_now', t);
    end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0422';
  end if;
  if p_fraction_bps is null or p_fraction_bps not between 1 and 10000 then
    raise exception 'INVALID_FRACTION' using errcode = 'P0422',
      detail = jsonb_build_object('fraction_bps', p_fraction_bps, 'min', 1, 'max', 10000)::text;
  end if;
  if p.status = 'closed' then
    raise exception 'POSITION_ALREADY_CLOSED' using errcode = 'P0409',
      detail = jsonb_build_object('position', public.position_wire(p))::text;
  end if;
  if p_expected_rev is null then
    raise exception 'PRECONDITION_REQUIRED' using errcode = 'P0428', detail = '{"hint":"If-Match: <position rev>"}';
  end if;
  if p_expected_rev <> p.rev then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0409',
      detail = jsonb_build_object('current_rev', p.rev, 'base_rev', p_expected_rev, 'current', public.position_wire(p))::text;
  end if;

  insert into public.orders (workspace_id, position_id, mint, fraction_bps, practice_epoch, requested_by, requested_via,
                             idempotency_key, request_hash)
  values (p.workspace_id, p.id, p.mint, p_fraction_bps, p.practice_epoch, uid, public.request_via(), p_idempotency_key, h)
  returning * into o;
  insert into public.jobs (workspace_id, kind, payload, dedupe_key)
  values (p.workspace_id, 'order.fill', jsonb_build_object('order_id', o.id), 'order:' || o.id)
  returning id into jid;
  update public.orders set job_id = jid where id = o.id returning * into o;

  perform public.emit_ws_event(p.workspace_id, o.id::text, 'order.submitted', p.strategy_id, p.mint, 'user',
    jsonb_build_object('order', public.order_wire(o), 'position_id', p.id, 'position_rev', p.rev,
                       'practice_epoch', p.practice_epoch));
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, after)
  values (p.workspace_id, uid, 'user', public.request_via(), 'position.close_requested', 'position', p.id::text,
          jsonb_build_object('order_id', o.id, 'fraction_bps', p_fraction_bps, 'rev', p.rev));

  resp := jsonb_build_object('position', public.position_wire(p), 'order', public.order_wire(o), 'order_id', o.id,
                             'fill', null, 'job_id', jid::text, 'status', 'queued');
  update public.orders set response = resp where id = o.id;
  return resp || jsonb_build_object('replayed', false, 'server_now', t);
end $$;

-- Executor worker: record the simulated sell fill for a queued order. Service role only.
-- Emits fill.simulated, position.updated (partial) or position.closed (exit_reason manual), order.filled.
create or replace function public.complete_order_fill(
  p_order_id uuid, p_token_amount_raw numeric, p_sol_lamports bigint, p_exec_price_sol numeric,
  p_mid_price_sol numeric, p_price_impact_bps integer default 0, p_slippage_bps numeric default 0,
  p_swap_fee_lamports bigint default 0, p_network_fee_lamports bigint default 0, p_latency_ms integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  p public.positions;
  f public.fills;
  cost_out bigint;
  t timestamptz := clock_timestamp();
  closing boolean;
  fill_wire jsonb;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0404'; end if;
  if o.status <> 'queued' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"hint":"order not queued"}';
  end if;
  select * into p from public.positions where id = o.position_id for update;
  if p.status = 'closed' then
    return public.fail_order(o.id, 'POSITION_ALREADY_CLOSED', '{}');
  end if;
  if p_token_amount_raw <= 0 or p_token_amount_raw > p.qty_raw then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"token_amount_raw"}';
  end if;
  closing := p_token_amount_raw = p.qty_raw;
  cost_out := case when closing then p.cost_basis_lamports
                   else (p.cost_basis_lamports::numeric * p_token_amount_raw / p.qty_raw)::bigint end;

  insert into public.fills (position_id, workspace_id, side, sol_lamports, token_amount_raw, exec_price_sol,
                            mid_price_sol, price_impact_bps, swap_fee_lamports, network_fee_lamports, slippage_bps,
                            latency_ms, order_id)
  values (p.id, p.workspace_id, 'sell', p_sol_lamports, p_token_amount_raw, p_exec_price_sol, p_mid_price_sol,
          p_price_impact_bps, p_swap_fee_lamports, p_network_fee_lamports, p_slippage_bps, p_latency_ms, o.id)
  returning * into f;
  update public.positions
     set qty_raw = qty_raw - p_token_amount_raw, sol_out_lamports = sol_out_lamports + p_sol_lamports,
         fees_lamports = fees_lamports + p_swap_fee_lamports + p_network_fee_lamports,
         cost_basis_lamports = cost_basis_lamports - cost_out,
         status = case when closing then 'closed'::public.position_status else status end,
         closed_at = case when closing then t end,
         exit_reason = case when closing then 'manual'::public.exit_reason else exit_reason end,
         exit_price_sol = case when closing then p_exec_price_sol else exit_price_sol end
   where id = p.id returning * into p;
  update public.orders set status = 'filled', fill_id = f.id, updated_at = t where id = o.id returning * into o;

  fill_wire := public.fill_wire(f);
  perform public.emit_ws_event(p.workspace_id, f.id::text, 'fill.simulated', p.strategy_id, p.mint, 'executor',
    fill_wire || jsonb_build_object('position_key', p.position_key, 'position_id', p.id, 'order_id', o.id));
  if closing then
    perform public.emit_ws_event(p.workspace_id, p.position_key, 'position.closed', p.strategy_id, p.mint, 'executor',
      jsonb_build_object('position_key', p.position_key, 'position_id', p.id, 'rev', p.rev,
        'practice_epoch', p.practice_epoch, 'exit_reason', 'manual', 'exit_price_sol', p.exit_price_sol::text,
        'sol_out_lamports', p.sol_out_lamports::text,
        'pnl_lamports', (p.sol_out_lamports - p.sol_in_lamports - p.fees_lamports)::text,
        'pnl_pct', case when p.sol_in_lamports > 0 then round((p.sol_out_lamports - p.sol_in_lamports - p.fees_lamports)::numeric * 100 / p.sol_in_lamports, 2) end,
        'hold_seconds', extract(epoch from p.closed_at - p.opened_at)::bigint));
  else
    perform public.emit_ws_event(p.workspace_id, p.position_key, 'position.updated', p.strategy_id, p.mint, 'executor',
      public.position_updated_payload(p, null));
  end if;
  perform public.emit_ws_event(p.workspace_id, o.id::text, 'order.filled', p.strategy_id, p.mint, 'executor',
    jsonb_build_object('order', public.order_wire(o), 'fill', fill_wire, 'position_id', p.id, 'position_rev', p.rev,
                       'practice_epoch', p.practice_epoch));
  return jsonb_build_object('order', public.order_wire(o), 'fill', fill_wire, 'position', public.position_wire(p),
                            'server_now', t);
end $$;

-- Executor worker: reject a queued order (simulated fill refused). Emits order.failed (N-05).
create or replace function public.fail_order(p_order_id uuid, p_reason_code text, p_detail jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  p public.positions;
  t timestamptz := clock_timestamp();
begin
  if p_reason_code not in ('SLIPPAGE_EXCEEDED', 'INSUFFICIENT_PRACTICE_BALANCE', 'GUARD_FAILED', 'UNSUPPORTED_QUOTE_MINT',
                           'POOL_STALE', 'POSITION_ALREADY_CLOSED', 'VALIDATION_FAILED', 'MODE_NOT_ALLOWED') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"reason_code"}';
  end if;
  update public.orders set status = 'failed', reason_code = p_reason_code, updated_at = t
   where id = p_order_id and status = 'queued' returning * into o;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0404'; end if;
  select * into p from public.positions where id = o.position_id;
  perform public.emit_ws_event(o.workspace_id, o.id::text, 'order.failed', p.strategy_id, o.mint, 'executor',
    jsonb_build_object('order_id', o.id, 'proposal_id', null, 'position_id', o.position_id, 'mint', o.mint,
      'side', o.side, 'amount_lamports', null, 'fraction_bps', o.fraction_bps, 'reason_code', p_reason_code,
      'detail', coalesce(p_detail, '{}'), 'mode', o.mode, 'practice_epoch', o.practice_epoch,
      'server_now', to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  return jsonb_build_object('order', public.order_wire(o), 'server_now', t);
end $$;

create or replace function public.fill_wire(f public.fills)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', f.id, 'side', f.side, 'simulated', true, 'practice_epoch', f.practice_epoch,
    'sol_lamports', f.sol_lamports::text, 'token_amount_raw', f.token_amount_raw::text,
    'exec_price_sol', f.exec_price_sol::text, 'mid_price_sol', coalesce(f.mid_price_sol, f.exec_price_sol)::text,
    'price_impact_bps', f.price_impact_bps, 'slippage_bps', f.slippage_bps,
    'swap_fee_lamports', f.swap_fee_lamports::text, 'network_fee_lamports', f.network_fee_lamports::text,
    'latency_ms', f.latency_ms,
    'created_at', to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

-- position.updated payload (Q3): qty_raw, cost_basis_lamports, avg_entry_price_sol, unrealized_pnl_lamports, rev.
create or replace function public.position_updated_payload(p public.positions, p_mark_price_sol numeric)
returns jsonb language sql stable as $$
  select jsonb_build_object('position_key', p.position_key, 'position_id', p.id, 'rev', p.rev,
    'practice_epoch', p.practice_epoch, 'qty_raw', p.qty_raw::text,
    'cost_basis_lamports', p.cost_basis_lamports::text, 'avg_entry_price_sol', p.entry_price_sol::text,
    'peak_price_sol', p.peak_price_sol::text,
    'realized_lamports', (p.sol_out_lamports)::text,
    'unrealized_pnl_lamports', case when p_mark_price_sol is null or c.decimals is null then null
         else (trunc(p.qty_raw * p_mark_price_sol * 1000000000 / power(10, c.decimals)) - p.cost_basis_lamports)::text end,
    'plan_state', null)
  from (select 1) one left join public.coins c on c.mint = p.mint
$$;

-- ---------------------------------------------------------------------------
-- 4. exit_stats(): ONE shape with GET /stats/exit-reasons (Q13)
-- ---------------------------------------------------------------------------
drop function if exists public.exit_stats(uuid, uuid, public.trade_mode, timestamptz, timestamptz);
create function public.exit_stats(
  p_workspace uuid, p_strategy uuid default null, p_mode public.trade_mode default null,
  p_from timestamptz default null, p_to timestamptz default null)
returns table (exit_reason public.exit_reason, count bigint, pnl_lamports text, avg_pnl_pct numeric,
               win_rate_pct numeric, avg_hold_s bigint)
language sql stable security invoker as $$
  select p.exit_reason,
         count(*),
         sum(p.sol_out_lamports - p.sol_in_lamports)::text,
         round(avg(case when p.sol_in_lamports > 0
                   then (p.sol_out_lamports - p.sol_in_lamports)::numeric * 100 / p.sol_in_lamports end), 2),
         round(avg((p.sol_out_lamports > p.sol_in_lamports)::int)::numeric * 100, 2),
         round(avg(extract(epoch from p.closed_at - p.opened_at)))::bigint
    from public.positions p
   where p.workspace_id = p_workspace and p.status = 'closed' and p.archived_at is null
     and p.exit_reason <> 'practice_reset'
     and (p_strategy is null or p.strategy_id = p_strategy)
     and (p_mode is null or p.mode = p_mode)
     and (p_from is null or p.closed_at >= p_from)
     and (p_to is null or p.closed_at < p_to)
   group by p.exit_reason
   order by count(*) desc
$$;

-- ---------------------------------------------------------------------------
-- 5. portfolio_latest with explicit wire columns (Q18)
-- ---------------------------------------------------------------------------
drop view if exists public.portfolio_latest;
create view public.portfolio_latest with (security_invoker = true) as
  select workspace_id, mode, practice_epoch, ts, cash_lamports, positions_cost_lamports, positions_value_lamports,
         equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports,
         open_positions, as_of_seq
    from public.workspace_equity_latest;
grant select on public.portfolio_latest to authenticated;

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'complete_order_fill(uuid, numeric, bigint, numeric, numeric, integer, numeric, bigint, bigint, integer)',
    'fail_order(uuid, text, jsonb)', 'emit_ws_event(uuid, text, text, uuid, text, public.event_actor, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['close_position(uuid, integer, text, integer)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
