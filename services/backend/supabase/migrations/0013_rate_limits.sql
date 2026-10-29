-- Shared rate-limit counters so limits hold across API instances (RATE_LIMIT_STORE=postgres).
-- Fixed windows; UNLOGGED (losing counters on a crash only resets limits). Backend only.
create unlogged table public.rate_limit_counters (
  bucket       text not null check (length(bucket) <= 200),
  window_start timestamptz not null,
  n            integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

-- One hit. Returns 0 when allowed, else the seconds until the window ends (Retry-After).
create or replace function public.rate_limit_hit(p_bucket text, p_max integer, p_window_s integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := clock_timestamp();
  w timestamptz := to_timestamp(floor(extract(epoch from t) / p_window_s) * p_window_s);
  c integer;
begin
  insert into public.rate_limit_counters as r (bucket, window_start, n) values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set n = r.n + 1
  returning n into c;
  if random() < 0.01 then
    delete from public.rate_limit_counters where window_start < t - interval '2 hours';
  end if;
  if c <= p_max then return 0; end if;
  return greatest(1, ceil(extract(epoch from (w + make_interval(secs => p_window_s) - t)))::integer);
end $$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
