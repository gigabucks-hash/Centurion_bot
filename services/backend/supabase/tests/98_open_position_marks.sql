-- 0025: position_wire() carries a per-row mark for OPEN positions only, and
-- reports unknown marks as null (never 0).
\set ON_ERROR_STOP 1
\set QUIET 1

insert into public.coins (mint, venue, decimals, token_program)
  values ('MintMark111111111111111111111111111111111111', 'curve', 6, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  on conflict (mint) do nothing;

insert into public.positions
  (id, position_key, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports, cost_basis_lamports, entry_price_sol)
values
  ('60000000-0000-0000-0000-0000000000d1', 'markopen.1', '20000000-0000-0000-0000-00000000000a',
   '10000000-0000-0000-0000-00000000000a', 'MintMark111111111111111111111111111111111111',
   1000000000, 250000000, 250000000, '0.00000025')
on conflict (id) do nothing;

do $$
declare w jsonb;
begin
  -- no pool state yet: unknown, not 0
  select public.position_wire(p) into w from public.positions p where p.id = '60000000-0000-0000-0000-0000000000d1';
  if (w ->> 'mark_price_sol') is not null then raise exception 'mark missing pool: %', w -> 'mark_price_sol'; end if;
  if (w ->> 'unrealized_pnl_lamports') is not null then raise exception 'upnl missing pool: %', w -> 'unrealized_pnl_lamports'; end if;
  if (w ->> 'as_of') is not null then raise exception 'as_of missing pool: %', w -> 'as_of'; end if;
end $$;

insert into public.pool_states (mint, venue, sol_reserve, token_reserve, quote_mint, slot, observed_at)
  values ('MintMark111111111111111111111111111111111111', 'curve', 15, 1000000,
          'So11111111111111111111111111111111111111112', 7, '2026-11-06T01:02:03.456Z')
  on conflict (mint) do update set sol_reserve = excluded.sol_reserve,
    token_reserve = excluded.token_reserve, quote_mint = excluded.quote_mint,
    slot = excluded.slot, observed_at = excluded.observed_at;

do $$
declare w jsonb;
begin
  select public.position_wire(p) into w from public.positions p where p.id = '60000000-0000-0000-0000-0000000000d1';
  if (w ->> 'mark_price_sol') <> '0.000015000000000000' then raise exception 'mark: %', w -> 'mark_price_sol'; end if;
  -- 1000 whole tokens * 0.000015 SOL = 15,000,000 lamports - 250,000,000 cost
  if (w ->> 'unrealized_pnl_lamports') <> '-235000000' then raise exception 'upnl: %', w -> 'unrealized_pnl_lamports'; end if;
  if (w ->> 'as_of') <> '2026-11-06T01:02:03.456Z' then raise exception 'as_of: %', w -> 'as_of'; end if;
  -- realized keys stay null while open
  if (w ->> 'pnl_lamports') is not null then raise exception 'open realized: %', w -> 'pnl_lamports'; end if;
end $$;

-- a closed row never carries a mark, even with a fresh pool state
update public.positions set status = 'closed', closed_at = now(), exit_reason = 'manual',
  sol_out_lamports = 260000000 where id = '60000000-0000-0000-0000-0000000000d1';
do $$
declare w jsonb;
begin
  select public.position_wire(p) into w from public.positions p where p.id = '60000000-0000-0000-0000-0000000000d1';
  if (w ->> 'mark_price_sol') is not null or (w ->> 'unrealized_pnl_lamports') is not null
     or (w ->> 'as_of') is not null then raise exception 'closed row carries a mark: %', w; end if;
  if (w ->> 'pnl_lamports') <> '10000000' then raise exception 'closed realized: %', w -> 'pnl_lamports'; end if;
end $$;

-- non-SOL quote and zero reserves are unknown marks, not 0
update public.positions set status = 'open', closed_at = null, exit_reason = null
  where id = '60000000-0000-0000-0000-0000000000d1';
update public.pool_states set quote_mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  where mint = 'MintMark111111111111111111111111111111111111';
do $$
declare w jsonb;
begin
  select public.position_wire(p) into w from public.positions p where p.id = '60000000-0000-0000-0000-0000000000d1';
  if (w ->> 'mark_price_sol') is not null then raise exception 'non-SOL quote mark: %', w -> 'mark_price_sol'; end if;
end $$;
update public.pool_states set quote_mint = 'So11111111111111111111111111111111111111112', token_reserve = 0
  where mint = 'MintMark111111111111111111111111111111111111';
do $$
declare w jsonb;
begin
  select public.position_wire(p) into w from public.positions p where p.id = '60000000-0000-0000-0000-0000000000d1';
  if (w ->> 'mark_price_sol') is not null then raise exception 'zero reserve mark: %', w -> 'mark_price_sol'; end if;
end $$;

-- the narrow security-definer read is callable by clients, never by anon
do $$
begin
  if not has_function_privilege('authenticated', 'public.position_mark(text)', 'execute') then
    raise exception 'authenticated cannot read the mark';
  end if;
  if has_function_privilege('anon', 'public.position_mark(text)', 'execute') then
    raise exception 'anon can read the mark';
  end if;
end $$;

\echo 'ok: open position marks'