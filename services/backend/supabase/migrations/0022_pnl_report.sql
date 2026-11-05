-- 0022: PnL card / report support (additive to contracts 1.1.6; no wire field is removed or renamed).
--
-- What this adds:
--   1. position_wire(): per-trade realized result on a CLOSED position (pnl_lamports, pnl_pct,
--      hold_seconds). Before this, only the position.closed SSE event carried them, so a REST read of
--      GET /positions?state=closed (the report ledger and the receipt) could not show a realized PnL
--      without recomputing it on the client.
--   2. pnl_summary(): one aggregate row for the report strip (realized for a range, closed count,
--      win rate, avg hold, fees, best/worst). Contract already promises /positions?window=; the
--      windowed realized number did not exist server-side, so a client had to sum a paginated page.
--   3. complete_order_fill(): position.closed now uses the same realized definition as
--      exit_stats()/position_wire(), so the toast, the receipt and the report cannot disagree.
--
-- Realized definition (ONE definition, documented in packages/contracts/API_ENDPOINTS.md 4.7):
--   pnl_lamports = sol_out_lamports - sol_in_lamports
-- It is the same expression exit_stats() already uses and the same value the app shows today.
--
-- Fees: fees_lamports is REPORTED CONTEXT, never added to or subtracted from pnl_lamports again.
-- The sell-side swap fee is already netted out of sol_out_lamports (the simulated fill returns
-- gross - swap fee) and the buy-side swap fee is already inside sol_in_lamports. Subtracting the
-- whole fees_lamports column therefore double-counts the swap fee (it was doing exactly that in
-- position.closed before this migration). Network fees remain the only fee component not reflected
-- in the two lamport columns, so the value is "realized, gross of network fees" until the executor
-- records network fees inside the cash columns. Do not label it "net of fees".

-- ---------------------------------------------------------------------------
-- 1. position_wire(): + realized fields on closed positions
-- ---------------------------------------------------------------------------
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
    'closed_at', to_char(p.closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    -- 0022: realized result, frozen at close. null while open (an open row has no realized PnL yet).
    'pnl_lamports', case when p.status = 'closed'
                         then (p.sol_out_lamports - p.sol_in_lamports)::text end,
    'pnl_pct', case when p.status = 'closed' and p.sol_in_lamports > 0
                    then round((p.sol_out_lamports - p.sol_in_lamports)::numeric * 100 / p.sol_in_lamports, 2) end,
    'hold_seconds', case when p.status = 'closed' and p.closed_at is not null
                         then extract(epoch from p.closed_at - p.opened_at)::bigint end)
  from (select 1) one left join public.coins c on c.mint = p.mint
$$;

-- ---------------------------------------------------------------------------
-- 2. pnl_summary(): report strip, closed trades only, current epoch, windowed
--    Same filters as exit_stats(): archived / practice_reset rows never count.
--    win_rate_pct / avg_hold_s / best / worst are NULL with zero closed trades (never a fake 0 %).
-- ---------------------------------------------------------------------------
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
       and p.practice_epoch = (select practice_epoch from public.workspaces where id = p_workspace)
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

-- ---------------------------------------------------------------------------
-- 3. complete_order_fill(): position.closed pnl = sol_out - sol_in (same as exit_stats)
--    Recreated verbatim from 0003 except the two pnl expressions; the previous version subtracted
--    fees_lamports, which also contains the swap fee already netted out of sol_out_lamports.
-- ---------------------------------------------------------------------------
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
        'pnl_lamports', (p.sol_out_lamports - p.sol_in_lamports)::text,
        'pnl_pct', case when p.sol_in_lamports > 0 then round((p.sol_out_lamports - p.sol_in_lamports)::numeric * 100 / p.sol_in_lamports, 2) end,
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