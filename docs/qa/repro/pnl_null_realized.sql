-- Repro data for BUG_HUNT_v1 F1: /stats/pnl reports a null all-time realized
-- (no portfolio snapshot) while the current window has a real closed trade.
--
-- Run against a throwaway database that has 00_local_shim.sql + every migration:
--   psql -X -v ON_ERROR_STOP=1 -d bug_hunt_test -f docs/qa/repro/pnl_null_realized.sql
-- Everything is rolled back; the database is left unchanged.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000000f1', 'null-realized repro', '00000000-0000-0000-0000-0000000000f1');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'F1', 'running', '{}');
insert into public.coins (mint, venue, decimals, token_program) values
  ('7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'amm', 9, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

-- One closed trade in the current epoch. No portfolio_snapshots row is written for this
-- workspace, which is the state of a fresh practice account before the engine's first tick
-- (or after a snapshot write failure).
insert into public.positions
  (id, position_key, strategy_id, workspace_id, mint, mode, status, qty_raw,
   sol_in_lamports, sol_out_lamports, fees_lamports, opened_at, closed_at, exit_reason)
values
  ('40000000-0000-0000-0000-0000000000f1', 'f1repro.1',
   '20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1',
   '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'practice', 'closed', 0,
   500000000, 650000000, 6250000, now() - interval '2 hours', now() - interval '1 hour', 'manual');

-- 1. Exactly what routes.ts:352 runs for the card (portfolio_latest, workspace + mode).
select count(*) as portfolio_rows
  from public.portfolio_latest
 where workspace_id = '10000000-0000-0000-0000-0000000000f1' and mode = 'practice';

-- 2. Exactly what routes.ts:344 runs for the range strip (pnl_summary over 7d, no strategy).
select closed_count, realized_pnl_lamports, win_count
  from public.pnl_summary(
    '10000000-0000-0000-0000-0000000000f1', null, 'practice', now() - interval '7 days', null);

-- Result: portfolio_rows = 0 -> the API sends realized_pnl_lamports: null,
--         pnl_summary -> realized_pnl_window_lamports: "150000000", closed_count: 1.
-- The /pnl page then formats `realizedPnlSol ?? 0` in the reconciliation note (page.tsx:140)
-- and prints "0.00" for an all-time result the server never reported.

rollback;