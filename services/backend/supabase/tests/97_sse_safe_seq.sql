-- N1 regression: a second writer cannot take the seq after an in-flight one, so
-- events_safe_seq() never reaches an uncommitted seq.  Two sessions: this psql
-- connection (fast writer / reader) and one dblink backend (slow writer).
-- Needs the dblink contrib module (present in postgres:17 and local PG 17).
\set ON_ERROR_STOP 1
\set QUIET 1
create extension if not exists dblink;

create or replace function pg_temp.n1_assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'N1 FAIL: %', msg; end if;
end $$;

-- Inserts one event; returns its seq, or 'blocked' when statement_timeout fired
-- while waiting for the seq lock.  Any other error propagates.
create or replace function pg_temp.n1_insert(p_id text) returns text language plpgsql as $$
declare s bigint;
begin
  begin
    insert into public.events (id, workspace_id, ts, type, actor)
      values (p_id, '10000000-0000-0000-0000-0000000000c1', now(), 'system.notice', 'system')
      returning seq into s;
  exception when query_canceled then
    return 'blocked';
  end;
  return s::text;
end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1') on conflict do nothing;
insert into public.workspaces (id, name, owner_id)
  values ('10000000-0000-0000-0000-0000000000c1', 'n1 safe-seq race', '00000000-0000-0000-0000-0000000000c1')
  on conflict (id) do nothing;

-- check_sql.sh passes a complete connection string: dblink runs in the server
-- process and cannot inherit the client's PGHOST/PGPASSWORD environment.
select dblink_connect('n1_slow', :'n1_conn');

select coalesce(max(seq), 0) as baseline_seq from public.events \gset
select public.events_safe_seq() as baseline_safe \gset
select pg_temp.n1_assert(:baseline_safe = :baseline_seq, format('baseline safe %s = max seq %s', :baseline_safe, :baseline_seq));

-- Slow writer: takes the next seq and keeps its transaction open.
select dblink_exec('n1_slow', 'begin');
select 'n1slow:' || (extract(epoch from clock_timestamp()) * 1000)::bigint || ':system.notice' as slow_id \gset
select format(
  'insert into public.events (id, workspace_id, ts, type, actor) values (%L, %L, now(), %L, %L) returning seq',
  :'slow_id', '10000000-0000-0000-0000-0000000000c1', 'system.notice', 'system') as slow_sql \gset
select seq as slow_seq from dblink('n1_slow', :'slow_sql') as t(seq bigint) \gset
select pg_temp.n1_assert(:slow_seq > :baseline_seq, format('slow writer took %s after %s', :slow_seq, :baseline_seq));

-- The watermark must not reach the uncommitted seq.
select public.events_safe_seq() as race_safe \gset
select pg_temp.n1_assert(:race_safe < :slow_seq, format('safe %s must stay below in-flight %s', :race_safe, :slow_seq));
select pg_temp.n1_assert(
  (select count(*) from public.events where seq = :slow_seq) = 0,
  format('seq %s is invisible before commit', :slow_seq));

-- Fast writer: with the fix it blocks on the seq lock instead of committing
-- X+1 ahead of the slow transaction.  statement_timeout turns that wait into a
-- testable outcome instead of a hung smoke run.
set statement_timeout = '400ms';
select 'n1fast:' || ((extract(epoch from clock_timestamp()) * 1000)::bigint + 1) || ':system.notice' as fast_id \gset
select pg_temp.n1_insert(:'fast_id') as fast_attempt \gset
select pg_temp.n1_assert(:'fast_attempt' = 'blocked',
  format('second writer must block behind in-flight %s, got %s', :slow_seq, :'fast_attempt'));
reset statement_timeout;

-- Commit the slow row, then the fast row may take the following seq.
select dblink_exec('n1_slow', 'commit');
select public.events_safe_seq() as after_commit_safe \gset
select pg_temp.n1_assert(:after_commit_safe >= :slow_seq, format('safe %s reaches committed %s', :after_commit_safe, :slow_seq));

select pg_temp.n1_insert(:'fast_id') as fast_seq \gset
select pg_temp.n1_assert(:fast_seq > :slow_seq, format('fast writer took %s after committed %s', :fast_seq, :slow_seq));

-- Resume from the watermark captured while the slow row was in flight must
-- still return both events: no gap is lost.
select pg_temp.n1_assert(
  (select count(*) from public.events
    where seq > :race_safe and seq <= public.events_safe_seq()) = 2,
  format('resume from %s returns both rows (safe %s)', :race_safe, public.events_safe_seq()));

select dblink_disconnect('n1_slow');
\echo 'ok: events_safe_seq never exposes an uncommitted seq'