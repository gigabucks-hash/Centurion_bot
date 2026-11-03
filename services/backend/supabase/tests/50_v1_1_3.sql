-- Tests for 0006 (contracts 1.1.3): approval reject_reason.
\set ON_ERROR_STOP 1
\set QUIET 1
create or replace function pg_temp.expect_code(sql text, code text, label text) returns text language plpgsql as $$
declare m text; d text; st text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics m = message_text, d = pg_exception_detail, st = returned_sqlstate;
    if m <> code then raise exception '%: expected %, got % (%)', label, code, m, sqlerrm; end if;
    raise notice 'ok (% %): %', code, st, label;
    return coalesce(d, '');
  end;
  raise exception 'EXPECTED % DID NOT HAPPEN: %', code, label;
end $$;
create or replace function pg_temp.as_user(u text, client text default 'web') returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u, ''), false),
         set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'centurion_client', client)::text end, false);
$$;


insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009d1');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000009d1', 'ws D', '00000000-0000-0000-0000-0000000009d1');
insert into public.approvals (id, workspace_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-0000000009d1', '10000000-0000-0000-0000-0000000009d1', 'buy_pick', 'd1', 100000000, true, now() + interval '10 minutes'),
  ('30000000-0000-0000-0000-0000000009d2', '10000000-0000-0000-0000-0000000009d1', 'buy_pick', 'd2', 100000000, true, now() + interval '10 minutes'),
  ('30000000-0000-0000-0000-0000000009d3', '10000000-0000-0000-0000-0000000009d1', 'buy_pick', 'd3', 100000000, true, now() + interval '10 minutes');
create or replace function pg_temp.tok(a uuid) returns text language sql as $$
  select token from public.issue_approval_token(a, '00000000-0000-0000-0000-0000000009d1', 'web')
$$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000009d1', 'desktop');
do $$ begin
  assert not exists (select 1 from pg_proc where proname = 'decide_approval' and pronargs = 5), '5-arg overload dropped';
end $$;
do $$ declare t text := pg_temp.tok('30000000-0000-0000-0000-0000000009d1'); d jsonb; begin
  d := pg_temp.expect_code(format($q$select public.decide_approval('30000000-0000-0000-0000-0000000009d1', %L, 'reject', 1, 'rr-key-bad-01', 'bored')$q$, t), 'VALIDATION_FAILED', 'unknown reason')::jsonb;
  assert d->>'field' = 'reject_reason' and d->'allowed' = '["user_declined","not_tradeable","price_moved","other"]', format('allowed %s', d);
  d := pg_temp.expect_code(format($q$select public.decide_approval('30000000-0000-0000-0000-0000000009d1', %L, 'approve', 1, 'rr-key-bad-02', 'other')$q$, t), 'VALIDATION_FAILED', 'reason with approve')::jsonb;
  assert d->>'field' = 'reject_reason', 'field';
end $$;
-- explicit reason: stored, in the event and the audit, replay must match it
do $$ declare t text := pg_temp.tok('30000000-0000-0000-0000-0000000009d1'); r jsonb; begin
  r := public.decide_approval('30000000-0000-0000-0000-0000000009d1', t, 'reject', 1, 'rr-key-0001', 'price_moved');
  assert r->>'status' = 'rejected' and r->>'reject_reason' = 'price_moved' and not (r->>'replayed')::boolean, format('reject %s', r);
  assert (select reject_reason::text from public.approvals where id = '30000000-0000-0000-0000-0000000009d1') = 'price_moved', 'stored';
  assert (select payload->>'reject_reason' from public.events where type = 'proposal.rejected' and payload->>'proposal_id' = '30000000-0000-0000-0000-0000000009d1') = 'price_moved', 'event';
  assert (select after->>'reject_reason' from public.audit_log where action = 'approval.reject' and target = '30000000-0000-0000-0000-0000000009d1') = 'price_moved', 'audit';
  assert public.approval_wire((select a from public.approvals a where id = '30000000-0000-0000-0000-0000000009d1'))->>'reject_reason' = 'price_moved', 'wire';
  r := public.decide_approval('30000000-0000-0000-0000-0000000009d1', t, 'reject', 1, 'rr-key-0001', 'price_moved');
  assert (r->>'replayed')::boolean, 'same key + same reason replays';
end $$;
do $$ declare t text := (select pg_temp.tok('30000000-0000-0000-0000-0000000009d2')); begin
  -- same Idempotency-Key, different reason -> 422 (a different request); uses c2's own token, key of c2 below
  perform public.decide_approval('30000000-0000-0000-0000-0000000009d2', t, 'reject', 1, 'rr-key-0002', 'other');
  perform set_config('test.c2tok', t, false);
end $$;
do $$ begin
  perform pg_temp.expect_code(format($q$select public.decide_approval('30000000-0000-0000-0000-0000000009d2', %L, 'reject', 2, 'rr-key-0002', 'price_moved')$q$, current_setting('test.c2tok')),
    'IDEMPOTENCY_KEY_REUSED', 'same key, other reason');
end $$;
insert into public.approvals (id, workspace_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-0000000009d4', '10000000-0000-0000-0000-0000000009d1', 'buy_pick', 'd4', 100000000, true, now() + interval '10 minutes');
do $$ declare r jsonb; begin
  r := public.decide_approval('30000000-0000-0000-0000-0000000009d4', pg_temp.tok('30000000-0000-0000-0000-0000000009d4'), 'reject', 1, 'rr-key-0004');
  assert r->>'reject_reason' = 'user_declined', 'default user_declined';
end $$;
-- approve stores null
do $$ declare r jsonb; begin
  assert (select reject_reason::text from public.approvals where id = '30000000-0000-0000-0000-0000000009d2') = 'other', 'c2 stored other';
  r := public.decide_approval('30000000-0000-0000-0000-0000000009d3', pg_temp.tok('30000000-0000-0000-0000-0000000009d3'), 'approve', 1, 'rr-key-0003');
  assert r->'reject_reason' = 'null'::jsonb and (select reject_reason from public.approvals where id = '30000000-0000-0000-0000-0000000009d3') is null, 'approve -> null';
  assert (select payload->'reject_reason' from public.events where type = 'proposal.approved' and payload->>'proposal_id' = '30000000-0000-0000-0000-0000000009d3') = 'null'::jsonb, 'approved event null';
end $$;
do $$ begin
  assert exists (select 1 from pg_constraint where conname = 'approvals_reject_reason_only_on_reject'
                  and pg_get_constraintdef(oid) like '%reject_reason IS NULL%decision = ''reject''%'), 'constraint: reject only';
end $$;

\echo ALL v1.1.3 SQL TESTS PASSED
