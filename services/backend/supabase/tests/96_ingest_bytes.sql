-- Tests for 0018: ingest bytes/day meter (additive upsert, service only, not readable by clients).
\set ON_ERROR_STOP 1
\set QUIET 1
do $$
declare r record; ok boolean;
begin
  delete from public.ingest_bytes_daily where source like 'sqltest%';
  perform public.ingest_bytes_add('2026-11-01', 'sqltest_helius', 1000, 3);
  perform public.ingest_bytes_add('2026-11-01', 'sqltest_helius', 24, 1);
  perform public.ingest_bytes_add('2026-11-02', 'sqltest_helius', 5, 1);
  perform public.ingest_bytes_add('2026-11-01', 'sqltest_pumpportal', -7, 1); -- negatives clamp to 0
  select bytes, frames into r from public.ingest_bytes_daily where day = '2026-11-01' and source = 'sqltest_helius';
  if r.bytes <> 1024 or r.frames <> 4 then raise exception 'additive upsert: %', r; end if;
  select bytes into r from public.ingest_bytes_daily where day = '2026-11-01' and source = 'sqltest_pumpportal';
  if r.bytes <> 0 then raise exception 'clamp: %', r; end if;
  begin
    perform public.ingest_bytes_add('2026-11-01', 'Bad Source!', 1, 1);
    raise exception 'source check missing';
  exception when check_violation then null;
  end;
  select has_function_privilege('authenticated', 'public.ingest_bytes_add(date,text,bigint,bigint)', 'execute') into ok;
  if ok then raise exception 'authenticated may write the meter'; end if;
  select has_table_privilege('authenticated', 'public.ingest_bytes_daily', 'select') into ok;
  if ok then raise exception 'authenticated may read the meter'; end if;
  select has_function_privilege('service_role', 'public.ingest_bytes_add(date,text,bigint,bigint)', 'execute') into ok;
  if not ok then raise exception 'service_role cannot write the meter'; end if;
  delete from public.ingest_bytes_daily where source like 'sqltest%';
  raise notice 'ok: ingest_bytes_daily';
end $$;
