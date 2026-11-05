-- Latent (Phase 7) isolation risks in the PnL path. They are NOT reachable at HEAD 77a10e3:
-- every mode column is constrained to 'practice' (see the first DO block). This file drops those
-- constraints inside a rolled-back transaction only to show what the code will do once Real is on.
--
-- Run: psql -X -v ON_ERROR_STOP=1 -d bug_hunt_test -f docs/qa/repro/pnl_mode_isolation_latent.sql
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f4');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000000f4', 'mode isolation repro', '00000000-0000-0000-0000-0000000000f4');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000f4', '10000000-0000-0000-0000-0000000000f4', 'F4', 'running', '{}');
insert into public.coins (mint, venue, decimals, token_program) values
  ('7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'amm', 9, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

-- 1. Today these are impossible: every mode write is constrained to practice.
do $$
begin
  begin
    insert into public.portfolio_snapshots (workspace_id, mode, cash_lamports, positions_cost_lamports,
      positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps,
      realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq)
    values ('10000000-0000-0000-0000-0000000000f4', 'real', 1, 0, 0, 1, 1, 0, 0, 0, 0, 0);
    raise exception 'real snapshot was accepted (constraint missing)';
  exception when check_violation then
    raise notice 'BLOCKED TODAY: portfolio_snapshots_mode_check rejects mode=real';
  end;
end $$;

-- ---- L1: workspace_equity_latest collapses per workspace, not per (workspace, mode) ----------
alter table public.portfolio_snapshots drop constraint portfolio_snapshots_mode_check;

-- practice snapshot at T1, real snapshot 1 s later at T2
insert into public.portfolio_snapshots (workspace_id, mode, ts, cash_lamports, positions_cost_lamports,
  positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps,
  realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq)
values
  ('10000000-0000-0000-0000-0000000000f4', 'practice', now() - interval '1 second', 100, 10, 12, 112, 112, 0, 7, 2, 0, 0),
  ('10000000-0000-0000-0000-0000000000f4', 'real',     now(),                        1,   0,  0,   1,   1, 0, 0, 0, 0, 0);

do $$
declare ws uuid := '10000000-0000-0000-0000-0000000000f4';
begin
  raise notice 'L1: portfolio_latest rows for the workspace=% (mode filter applies to a single row)',
    (select count(*) from public.portfolio_latest where workspace_id = ws);
  raise notice 'L1: /stats/pnl style query  where mode=practice -> % row(s)',
    (select count(*) from public.portfolio_latest where workspace_id = ws and mode = 'practice');
  raise notice 'L1: the practice snapshot (realized 7 lamports) is invisible once a newer real snapshot exists';
  if (select count(*) from public.portfolio_latest where workspace_id = ws and mode = 'practice') <> 0 then
    raise exception 'expected the practice card row to disappear';
  end if;
end $$;

-- ---- L2: reset_practice() touches every mode in the workspace --------------------------------
alter table public.positions drop constraint positions_practice_only;

insert into public.positions
  (id, position_key, strategy_id, workspace_id, mint, mode, status, qty_raw,
   sol_in_lamports, sol_out_lamports, opened_at, closed_at, exit_reason)
values
  -- a real position the owner is holding
  ('40000000-0000-0000-0000-0000000000f4', 'f4real.1',
   '20000000-0000-0000-0000-0000000000f4', '10000000-0000-0000-0000-0000000000f4',
   '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'real', 'open', 1000,
   1000000000, 0, now() - interval '2 hours', null, null);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","centurion_client":"web"}', true);
select public.reset_practice('10000000-0000-0000-0000-0000000000f4');

do $$
declare ws uuid := '10000000-0000-0000-0000-0000000000f4';
begin
  raise notice 'L2: after one practice reset, the real position is status=% archived=% exit_reason=%',
    (select status from public.positions where id = '40000000-0000-0000-0000-0000000000f4'),
    (select archived_at is not null from public.positions where id = '40000000-0000-0000-0000-0000000000f4'),
    (select exit_reason from public.positions where id = '40000000-0000-0000-0000-0000000000f4');
  raise notice 'L2: workspace epoch=% but the real row stayed at epoch=%',
    (select practice_epoch from public.workspaces where id = ws),
    (select practice_epoch from public.positions where id = '40000000-0000-0000-0000-0000000000f4');
  raise notice 'L2: real rows are then filtered out by pnl_summary()/positions (epoch + archived_at)';
  if (select status from public.positions where id = '40000000-0000-0000-0000-0000000000f4') <> 'closed' then
    raise exception 'expected reset_practice to close the real position';
  end if;
end $$;

rollback;