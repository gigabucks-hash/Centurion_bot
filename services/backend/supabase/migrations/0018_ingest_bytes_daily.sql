-- Ingest bytes/day meter: raw bytes and frames received per source per UTC day (cost visibility for
-- PumpPortal / Helius WS + RPC / future Yellowstone). Written by the ingest worker (service role) with
-- ingest_bytes_add (additive deltas), read by the API /readyz detail. No user data; not exposed to clients.
create table if not exists public.ingest_bytes_daily (
  day        date   not null,
  source     text   not null check (source ~ '^[a-z][a-z0-9_]{0,31}$'),
  bytes      bigint not null default 0 check (bytes >= 0),
  frames     bigint not null default 0 check (frames >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, source)
);
alter table public.ingest_bytes_daily enable row level security;
revoke all on public.ingest_bytes_daily from public, anon, authenticated;
grant select, insert, update, delete on public.ingest_bytes_daily to service_role;

create or replace function public.ingest_bytes_add(p_day date, p_source text, p_bytes bigint, p_frames bigint)
returns void language sql security definer set search_path = '' as $$
  insert into public.ingest_bytes_daily as d (day, source, bytes, frames)
  values (p_day, p_source, greatest(p_bytes, 0), greatest(p_frames, 0))
  on conflict (day, source) do update
    set bytes = d.bytes + excluded.bytes, frames = d.frames + excluded.frames, updated_at = now();
$$;
revoke execute on function public.ingest_bytes_add(date, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ingest_bytes_add(date, text, bigint, bigint) to service_role;
