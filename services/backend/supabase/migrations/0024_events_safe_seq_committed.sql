-- N1: events_safe_seq() exposed a seq whose writer was still in flight.
--
-- A snapshot cannot see an uncommitted row, so `min(seq)` over visible rows can
-- be one past an invisible row, and the watermark then equals that uncommitted
-- seq.  Advisory-lock the seq allocation below: a writer holds one
-- transaction-scoped lock from before it takes a seq until it commits, so a
-- writer that gets X always commits before any writer that gets X+1.  An
-- invisible seq is therefore always above the visible watermark, never below
-- it, and max(visible seq) is a safe resume point.
--
-- The append-only triggers are untouched.  The BEFORE INSERT trigger reassigns
-- the identity column after taking the lock (the identity default is consumed
-- first and becomes a permanent, harmless gap).  Lock ordering is intentional;
-- an event insert must not wait on a row lock another writer holds while it
-- waits for this advisory lock (see docs/EVENTS_SAFE_SEQ.md).
create or replace function public.events_serialize_insert()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(4910013);
  new.seq := nextval(pg_get_serial_sequence('public.events', 'seq'));
  return new;
end $$;
revoke execute on function public.events_serialize_insert() from public, anon, authenticated;
grant execute on function public.events_serialize_insert() to service_role;

drop trigger if exists events_serialize_insert on public.events;
create trigger events_serialize_insert before insert on public.events
  for each row execute function public.events_serialize_insert();

create or replace function public.events_safe_seq()
returns bigint language sql stable as $$
  select coalesce(max(seq), 0) from public.events
$$;