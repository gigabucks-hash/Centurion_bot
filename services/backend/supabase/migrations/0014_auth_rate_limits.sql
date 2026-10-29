-- B-2: shared counters for login limits. Counts one hit and returns the count in the current window so the
-- API can soft-delay the allow-listed owner instead of hard-blocking it. Service role only.
create or replace function public.rate_limit_count(p_bucket text, p_window_s integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := clock_timestamp();
  w timestamptz := to_timestamp(floor(extract(epoch from t) / p_window_s) * p_window_s);
  c integer;
begin
  if p_window_s < 1 or p_window_s > 86400 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"window_s"}';
  end if;
  insert into public.rate_limit_counters as r (bucket, window_start, n) values (left(p_bucket, 200), w, 1)
  on conflict (bucket, window_start) do update set n = r.n + 1
  returning n into c;
  return jsonb_build_object('n', c,
    'retry_after_s', greatest(1, ceil(extract(epoch from (w + make_interval(secs => p_window_s) - t)))::integer));
end $$;
revoke execute on function public.rate_limit_count(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_count(text, integer) to service_role;
