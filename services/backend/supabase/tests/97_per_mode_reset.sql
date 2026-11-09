-- 0028: practice reset and portfolio/pnl reads are per-mode.
-- A real row must survive a practice reset and must not hide the practice overview.
-- The phase-7 constraints are dropped only inside this transaction and rolled back.
\set ON_ERROR_STOP 1
\set QUIET 1

-- act as a signed-in user (JWT sub + centurion_client claim), or as the service (no JWT)
create or replace function pg_temp.as_user(u text, client text default 'web') returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u, ''), false),
         set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'centurion_client', client)::text end, false);
$$;

begin;

alter table public.positions drop constraint positions_practice_only;
alter table public.portfolio_snapshots drop constraint portfolio_snapshots_mode_check;
alter table public.approvals drop constraint approvals_practice_only;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f9') on conflict do nothing;
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000000f9', 'ws per-mode', '00000000-0000-0000-0000-0000000000f9')
  on conflict (id) do nothing;
insert into public.coins (mint, venue, decimals, token_program) values
  ('MintPerMode111111111111111111111111111111111', 'curve', 6, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  on conflict (mint) do nothing;
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000f9', '10000000-0000-0000-0000-0000000000f9', 'PM', 'paused', '{}')
  on conflict (id) do nothing;

-- practice snapshot (older) + real snapshot (newer). The old view picked one row per workspace;
-- with a newer real snapshot the practice overview would have returned null.
insert into public.portfolio_snapshots (workspace_id, mode, ts, cash_lamports, positions_cost_lamports,
  positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports,
  unrealized_pnl_lamports, open_positions, as_of_seq)
values
  ('10000000-0000-0000-0000-0000000000f9', 'practice', now() - interval '1 hour',
   29750000000, 250000000, 200000000, 29950000000, 30000000000, 16, 0, -50000000, 1, 1),
  ('10000000-0000-0000-0000-0000000000f9', 'real', now() + interval '1 minute',
   5000000000, 0, 0, 5000000000, 5000000000, 0, 0, 0, 0, 1);

do $$
begin
  assert (select cash_lamports from public.portfolio_latest
           where workspace_id = '10000000-0000-0000-0000-0000000000f9' and mode = 'practice') = 29750000000,
    'practice overview hidden by a newer real snapshot';
  assert (select cash_lamports from public.portfolio_latest
           where workspace_id = '10000000-0000-0000-0000-0000000000f9' and mode = 'real') = 5000000000,
    'real overview missing';
end $$;

-- practice open position + pending buy approval (both must be reset)
insert into public.positions (id, position_key, strategy_id, workspace_id, mint, mode, qty_raw, sol_in_lamports, cost_basis_lamports)
values ('40000000-0000-0000-0000-0000000000f1', 'pm1.0', '20000000-0000-0000-0000-0000000000f9',
        '10000000-0000-0000-0000-0000000000f9', 'MintPerMode111111111111111111111111111111111', 'practice',
        1000000000, 250000000, 250000000);
insert into public.approvals (id, workspace_id, strategy_id, kind, mode, subject, amount_lamports, expires_at) values
  ('30000000-0000-0000-0000-00000000097a', '10000000-0000-0000-0000-0000000000f9',
   '20000000-0000-0000-0000-0000000000f9', 'buy_pick', 'practice', 'pm1.0', 250000000, now() + interval '10 minutes');

-- real rows that must not be touched (open position, pending approval, closed trade in epoch 0)
insert into public.positions (id, position_key, strategy_id, workspace_id, mint, mode, qty_raw, sol_in_lamports, cost_basis_lamports)
values ('40000000-0000-0000-0000-0000000000f2', 'pm2.0', '20000000-0000-0000-0000-0000000000f9',
        '10000000-0000-0000-0000-0000000000f9', 'MintPerMode111111111111111111111111111111111', 'real',
        1000000000, 250000000, 250000000);
insert into public.positions (id, position_key, strategy_id, workspace_id, mint, mode, status, qty_raw,
  sol_in_lamports, sol_out_lamports, cost_basis_lamports, exit_reason, closed_at)
values ('40000000-0000-0000-0000-0000000000f3', 'pm3.0', '20000000-0000-0000-0000-0000000000f9',
        '10000000-0000-0000-0000-0000000000f9', 'MintPerMode111111111111111111111111111111111', 'real', 'closed',
        1000000000, 1000000000, 1500000000, 1000000000, 'manual', now() - interval '5 minutes');
insert into public.approvals (id, workspace_id, strategy_id, kind, mode, subject, amount_lamports, expires_at) values
  ('30000000-0000-0000-0000-00000000097b', '10000000-0000-0000-0000-0000000000f9',
   '20000000-0000-0000-0000-0000000000f9', 'buy_pick', 'real', 'pm2.0', 250000000, now() + interval '10 minutes');

do $$
declare r jsonb;
begin
  assert (select practice_epoch from public.workspaces where id = '10000000-0000-0000-0000-0000000000f9') = 0,
    'fixture starts in epoch 0';
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000f9', 'web');
  r := public.reset_practice('10000000-0000-0000-0000-0000000000f9');
  perform pg_temp.as_user(null);
  assert (r->>'epoch')::int = 1, 'epoch bumped';

  -- practice side reset
  assert (select status from public.positions where id = '40000000-0000-0000-0000-0000000000f1') = 'closed',
    'practice open position not closed';
  assert (select exit_reason from public.positions where id = '40000000-0000-0000-0000-0000000000f1') = 'practice_reset',
    'practice close reason';
  assert (select status from public.approvals where id = '30000000-0000-0000-0000-00000000097a') = 'expired',
    'practice pending approval not expired';

  -- real side untouched
  assert (select status from public.positions where id = '40000000-0000-0000-0000-0000000000f2') = 'open',
    'practice reset closed a real position';
  assert (select archived_at from public.positions where id = '40000000-0000-0000-0000-0000000000f2') is null,
    'practice reset archived a real position';
  assert (select status from public.approvals where id = '30000000-0000-0000-0000-00000000097b') = 'pending',
    'practice reset expired a real approval';
  assert (select archived_at from public.positions where id = '40000000-0000-0000-0000-0000000000f3') is null,
    'practice reset archived a closed real trade';

  -- overview: fresh practice snapshot, real snapshot unchanged
  assert (select cash_lamports from public.portfolio_latest
           where workspace_id = '10000000-0000-0000-0000-0000000000f9' and mode = 'practice') = 30000000000,
    'practice overview not reset';
  assert (select cash_lamports from public.portfolio_latest
           where workspace_id = '10000000-0000-0000-0000-0000000000f9' and mode = 'real') = 5000000000,
    'real overview changed by practice reset';

  -- pnl: the bumped practice epoch must not hide the real closed trade (it sits in epoch 0)
  assert (select closed_count from public.pnl_summary('10000000-0000-0000-0000-0000000000f9', null, 'real')) = 1,
    'real pnl hidden by practice epoch';
  assert (select realized_pnl_lamports from public.pnl_summary('10000000-0000-0000-0000-0000000000f9', null, 'real')) = '500000000',
    'real realized pnl';
  assert (select closed_count from public.pnl_summary('10000000-0000-0000-0000-0000000000f9', null, 'practice')) = 0,
    'practice pnl must exclude real trades';
end $$;

rollback;
