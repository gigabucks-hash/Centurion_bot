-- Repro for BUG_HUNT_v1 F5: the closed ledger's keyset cursor is a bare (closed_at, id)
-- position. It is not bound to the range that produced it, and the range is recomputed from
-- `window` on every request (rules.ts:91-107). Two consequences, both silent:
--
--   A. page 2 of the same window is requested seconds later -> `from` moved forward ->
--      the oldest rows of the range disappear between pages.
--   B. a cursor from a 30d page is replayed with `window=7d` -> the 7d query starts below
--      that position and skips that filter's newest rows.
--
-- Run: psql -X -v ON_ERROR_STOP=1 -d bug_hunt_test -f docs/qa/repro/pnl_paging_window.sql
-- Rolled back; the database is left unchanged.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f3');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000000f3', 'paging window repro', '00000000-0000-0000-0000-0000000000f3');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-0000000000f3', 'F3', 'running', '{}');
insert into public.coins (mint, venue, decimals, token_program) values
  ('7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'amm', 9, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

-- 60 closes inside the last hour (one every 30 s, newest first) + 10 closes 8 days old.
insert into public.positions
  (position_key, strategy_id, workspace_id, mint, mode, status, qty_raw,
   sol_in_lamports, sol_out_lamports, opened_at, closed_at, exit_reason)
select 'pw' || g || '.1', '20000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-0000000000f3',
       '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'practice', 'closed', 0,
       100000000, 100000000 + g, now() - interval '1 day',
       now() - (g * interval '1 minute'), 'manual'
  from generate_series(1, 60) g;
insert into public.positions
  (position_key, strategy_id, workspace_id, mint, mode, status, qty_raw,
   sol_in_lamports, sol_out_lamports, opened_at, closed_at, exit_reason)
select 'pwold' || g || '.1', '20000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-0000000000f3',
       '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'practice', 'closed', 0,
       100000000, 100000000, now() - interval '9 days',
       now() - interval '8 days' - (g * interval '1 minute'), 'manual'
  from generate_series(1, 10) g;

do $$
declare
  ws uuid := '10000000-0000-0000-0000-0000000000f3';
  from1 timestamptz := now() - interval '1 hour';
  from2 timestamptz := now() - interval '50 minutes';   -- same window, 10 min of user time later
  cur_ts timestamptz;
  cur_id uuid;
  page1 int;
  page2_same int;
  page2_late int;
  lost int;
  cur30_ts timestamptz;
  cur30_id uuid;
  seven_newer int;
  seven_after_cursor int;
begin
  -- ---- A. same window, page 2 ten minutes later --------------------------------
  select count(*) into page1 from (
    select p.id from public.positions p
     where p.workspace_id = ws and p.mode = 'practice' and p.status = 'closed'
       and coalesce(p.closed_at, p.opened_at) >= from1
     order by coalesce(p.closed_at, p.opened_at) desc, p.id desc limit 50
  ) x;

  select p.closed_at, p.id into cur_ts, cur_id
    from public.positions p
   where p.workspace_id = ws and p.mode = 'practice' and p.status = 'closed'
     and coalesce(p.closed_at, p.opened_at) >= from1
   order by coalesce(p.closed_at, p.opened_at) desc, p.id desc
   offset 49 limit 1;

  select count(*) into page2_same from public.positions p
   where p.workspace_id = ws and p.mode = 'practice' and p.status = 'closed'
     and coalesce(p.closed_at, p.opened_at) >= from1
     and (coalesce(p.closed_at, p.opened_at), p.id) < (cur_ts, cur_id);

  select count(*) into page2_late from public.positions p
   where p.workspace_id = ws and p.mode = 'practice' and p.status = 'closed'
     and coalesce(p.closed_at, p.opened_at) >= from2        -- <-- recomputed `from`
     and (coalesce(p.closed_at, p.opened_at), p.id) < (cur_ts, cur_id);

  lost := page2_same - page2_late;
  raise notice 'A: page1=% rows, page2 immediately=% rows, page2 after 10 min=% rows -> lost=%',
    page1, page2_same, page2_late, lost;
  if lost <= 0 then raise exception 'expected the recomputed from to drop rows'; end if;

  -- ---- B. cursor from 30d replayed with window=7d ------------------------------
  select p.closed_at, p.id into cur30_ts, cur30_id
    from public.positions p
   where p.workspace_id = ws and p.mode = 'practice' and p.status = 'closed'
   order by coalesce(p.closed_at, p.opened_at) desc, p.id desc
   offset 49 limit 1;

  -- All 7d rows (the first request would show these):
  select count(*) into seven_newer from public.positions p
   where p.workspace_id = ws and p.mode = 'practice' and p.status = 'closed'
     and coalesce(p.closed_at, p.opened_at) >= now() - interval '7 days';

  -- Same request plus the 30d cursor: only rows below the cursor position are returned.
  select count(*) into seven_after_cursor from public.positions p
   where p.workspace_id = ws and p.mode = 'practice' and p.status = 'closed'
     and coalesce(p.closed_at, p.opened_at) >= now() - interval '7 days'
     and (coalesce(p.closed_at, p.opened_at), p.id) < (cur30_ts, cur30_id);

  raise notice 'B: 7d rows=% but with a 30d cursor only % are returned -> skipped=%',
    seven_newer, seven_after_cursor, seven_newer - seven_after_cursor;
  if seven_after_cursor >= seven_newer then raise exception 'expected the foreign cursor to skip rows'; end if;
end $$;

rollback;
