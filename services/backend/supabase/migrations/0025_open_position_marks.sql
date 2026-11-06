-- 0025: per-row mark on OPEN positions (additive to contracts 1.1.6).
--
--   mark_price_sol           text|null  latest SOL price per whole token
--   unrealized_pnl_lamports  text|null  qty * mark - cost_basis, integer lamports as a string
--   as_of                    text|null  UTC ISO-8601 timestamp of the pool observation
--
-- All three are null for closed positions and whenever the mark is unknown:
-- no pool state, zero reserves, a non-SOL quote, or missing coin decimals.
-- A known zero remains "0"; unknown is never reported as 0.
--
-- Source: public.pool_states (latest SOL-quoted pool per mint, written by the
-- ingest worker). That table is service-role only and position_wire() runs as
-- the caller (RLS), so the read goes through a narrow security-definer helper
-- that returns the price and observation time only, never reserves or venue.
create or replace function public.position_mark(p_mint text)
returns table (mark_price_sol numeric, observed_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select round(ps.sol_reserve::numeric / ps.token_reserve::numeric, 18), ps.observed_at
    from public.pool_states ps
   where ps.mint = p_mint
     and ps.sol_reserve > 0 and ps.token_reserve > 0
     and (ps.quote_mint is null
          or ps.quote_mint = 'So11111111111111111111111111111111111111112')
$$;
revoke execute on function public.position_mark(text) from public, anon;
grant execute on function public.position_mark(text) to authenticated, service_role;

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
                         then extract(epoch from p.closed_at - p.opened_at)::bigint end,
    -- 0025: open-row mark. Same value as the position.updated payload (003).
    'mark_price_sol', case when p.status = 'open' then m.mark_price_sol::text end,
    'unrealized_pnl_lamports', case when p.status = 'open' and m.mark_price_sol is not null and c.decimals is not null
      then (trunc(p.qty_raw * m.mark_price_sol * 1000000000 / power(10, c.decimals))
            - p.cost_basis_lamports)::text end,
    'as_of', case when p.status = 'open' and m.mark_price_sol is not null and m.observed_at is not null
                  then to_char(m.observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end)
  from (select 1) one
  left join public.coins c on c.mint = p.mint
  left join lateral public.position_mark(p.mint) m on true
$$;