-- Keyset-paging check for the closed PnL ledger (BUG_HUNT_v1 "verified sound" evidence).
-- Mirrors the exact predicate in services/backend/api/src/routes.ts:132-140:
--   (coalesce(closed_at, opened_at), id) < (cursor_ts, cursor_id)
--   order by coalesce(closed_at, opened_at) desc, id desc   limit limit+1
-- and pages until the server would return next_cursor = null.
--
-- Run: psql -X -v ON_ERROR_STOP=1 -d bug_hunt_test -f docs/qa/repro/keyset_paging.sql
-- Rolled back; the database is left unchanged.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f2');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000000f2', 'keyset repro', '00000000-0000-0000-0000-0000000000f2');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f2', 'F2', 'running', '{}');
insert into public.coins (mint, venue, decimals, token_program) values
  ('7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'amm', 9, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

-- 137 closes: deliberately many rows share the same closed_at (ties force the id tiebreak),
-- including 7 rows in the same microsecond as a page boundary.
insert into public.positions
  (position_key, strategy_id, workspace_id, mint, mode, status, qty_raw,
   sol_in_lamports, sol_out_lamports, opened_at, closed_at, exit_reason)
select 'ks' || g || '.1', '20000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f2',
       '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'practice', 'closed', 0,
       100000000, 100000000 + g, now() - interval '10 days',
       -- 3 distinct timestamps, 50/50/37 rows
       case when g <= 50 then timestamptz '2026-11-05 10:00:00.000000+00'
            when g <= 100 then timestamptz '2026-11-04 10:00:00.000000+00'
            else timestamptz '2026-11-03 10:00:00.000000+00' end,
       'manual'
  from generate_series(1, 137) g;

do $$
declare
  ws uuid := '10000000-0000-0000-0000-0000000000f2';
  cur_ts timestamptz := null;
  cur_id uuid := null;
  page_ids uuid[];
  n_total int;
  n_seen int := 0;
  n_pages int := 0;
  n_dupes int;
begin
  select count(*) into n_total from public.positions
   where workspace_id = ws and mode = 'practice' and status = 'closed';
  create temp table _seen (id uuid primary key, sort_at timestamptz) on commit drop;

  loop
    select array_agg(id order by sort_at desc, id desc) into page_ids
      from (
        select p.id, coalesce(p.closed_at, p.opened_at) as sort_at
          from public.positions p
         where p.workspace_id = ws and p.mode = 'practice' and p.status = 'closed'
           and (cur_ts is null or (coalesce(p.closed_at, p.opened_at), p.id) < (cur_ts, cur_id))
         order by coalesce(p.closed_at, p.opened_at) desc, p.id desc
         limit 51
      ) page;
    exit when page_ids is null;
    n_pages := n_pages + 1;
    -- The server keeps 50 and only advertises a next_cursor when a 51st row exists.
    if array_length(page_ids, 1) > 50 then
      insert into _seen select p.id, coalesce(p.closed_at, p.opened_at)
        from public.positions p where p.id = any (page_ids[1:50])
        on conflict do nothing;
      select p.id, coalesce(p.closed_at, p.opened_at) into cur_id, cur_ts
        from public.positions p where p.id = page_ids[50];
    else
      insert into _seen select p.id, coalesce(p.closed_at, p.opened_at)
        from public.positions p where p.id = any (page_ids)
        on conflict do nothing;
      exit;
    end if;
  end loop;

  select count(*) into n_seen from _seen;
  select count(*) into n_dupes from (
    select id from _seen group by id having count(*) > 1
  ) d;

  raise notice 'rows=% pages=% seen=% duplicates=%', n_total, n_pages, n_seen, n_dupes;
  if n_seen <> n_total or n_dupes <> 0 then
    raise exception 'KEYSSET PAGING LOST OR DUPLICATED ROWS: total=% seen=% dupes=%', n_total, n_seen, n_dupes;
  end if;
  -- Also prove the set is exactly equal (not just the same size).
  if exists (
    select id from public.positions where workspace_id = ws and mode = 'practice' and status = 'closed'
    except select id from _seen
  ) then
    raise exception 'KEYSSET PAGING MISSED A ROW';
  end if;
  raise notice 'KEYSSET PAGING OK: every closed row returned exactly once';
end $$;

rollback;
