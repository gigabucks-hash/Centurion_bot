-- Tests for 0005: `current` on every 409, strategy user write paths.
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

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000000f1', 'ws F', '00000000-0000-0000-0000-0000000000f1');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('10000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'viewer');

-- ---------------- create_strategy ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect_code($$select public.create_strategy('10000000-0000-0000-0000-0000000000f1', 'V', '{}')$$, 'FORBIDDEN_ROLE', 'viewer cannot create');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'mobile');
select pg_temp.expect_code($$select public.create_strategy('10000000-0000-0000-0000-0000000000f1', 'R', '{}', 'running')$$, 'VALIDATION_FAILED', 'cannot create running');
select pg_temp.expect_code($$select public.create_strategy('10000000-0000-0000-0000-0000000000f1', 'Bad', '{"stop_loss_pct":3}')$$,
  'settings.stop_loss_pct must be 0 (off) or 5-49', 'settings CHECK applies');
do $$ declare r jsonb; begin
  r := public.create_strategy('10000000-0000-0000-0000-0000000000f1', 'F1', '{"peak_trail_pct":15}', 'draft', 'Pixel 9');
  assert r->>'status' = 'draft' and (r->>'rev')::int = 1 and r ? 'server_now' and r->>'created_by' = '00000000-0000-0000-0000-0000000000f1', format('create %s', r);
  assert exists (select 1 from public.strategy_revisions where strategy_id = (r->>'id')::uuid and rev = 1 and changed_via = 'mobile' and device = 'Pixel 9'), 'revision records via/device';
  assert exists (select 1 from public.events where type = 'strategy.created' and strategy_id = (r->>'id')::uuid), 'strategy.created';
  assert exists (select 1 from public.audit_log where action = 'strategy.create' and target = r->>'id' and actor_via = 'mobile'), 'audited';
  perform set_config('test.sid', r->>'id', false);
end $$;

-- ---------------- retire_strategy_by_user ----------------
select pg_temp.expect_code($$select public.retire_strategy_by_user(current_setting('test.sid')::uuid, null)$$, 'PRECONDITION_REQUIRED', 'retire needs rev');
do $$ declare d jsonb; begin
  d := pg_temp.expect_code($q$select public.retire_strategy_by_user(current_setting('test.sid')::uuid, 9)$q$, 'STRATEGY_REV_CONFLICT', 'retire stale')::jsonb;
  assert (d->>'current_rev')::int = 1 and d->'current'->>'id' = current_setting('test.sid'), 'retire conflict carries current';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
select pg_temp.expect_code($$select public.retire_strategy_by_user(current_setting('test.sid')::uuid, 1)$$, 'FORBIDDEN_ROLE', 'viewer cannot retire');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'desktop');
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', current_setting('test.sid')::uuid,
   'buy_pick', 'f1pick', 100000000, true, now() + interval '10 minutes');
do $$ declare r jsonb; begin
  r := public.retire_strategy_by_user(current_setting('test.sid')::uuid, 1, 'archive');
  assert r->>'status' = 'archived' and (r->>'expired_proposals')::int = 1 and (r->>'rev')::int > 1, format('retire %s', r);
  assert (select expire_reason::text from public.approvals where id = '30000000-0000-0000-0000-0000000000f1') = 'strategy_archived', 'proposal expired';
  assert exists (select 1 from public.audit_log where action = 'strategy.archive' and actor_user = '00000000-0000-0000-0000-0000000000f1'), 'retire audited with actor';
end $$;
select pg_temp.expect_code($$select public.retire_strategy_by_user(current_setting('test.sid')::uuid, (select rev from public.strategies where id = current_setting('test.sid')::uuid), 'archive')$$, 'STRATEGY_RETIRED', 'already archived');
do $$ begin
  assert not has_function_privilege('authenticated', 'public.retire_strategy(uuid, text, uuid)', 'execute'), 'old retire is service-only';
end $$;

-- ---------------- decide_approval: 409 carries current ----------------
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f1', 'F2', 'running', '{}');
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-0000000000f2',
   'buy_pick', 'f2pick', 100000000, true, now() + interval '10 minutes');
do $$ declare tok text; d jsonb; begin
  select token into tok from public.issue_approval_token('30000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'web');
  perform set_config('test.tok', tok, false);
end $$;
do $$ declare d jsonb; begin
  d := pg_temp.expect_code(format($q$select public.decide_approval('30000000-0000-0000-0000-0000000000f2', %L, 'approve', 4, 'decide-f2-0001')$q$, current_setting('test.tok')),
                           'VERSION_CONFLICT', 'stale approval rev')::jsonb;
  assert (d->>'current_rev')::int = 1 and (d->>'base_rev')::int = 4, 'revs';
  assert d->'current'->>'id' = '30000000-0000-0000-0000-0000000000f2' and (d->'current'->>'rev')::int = 1
     and d->'current'->>'status' = 'pending' and d->'current'->>'amount_lamports' = '100000000', format('current %s', d);
end $$;

\echo ALL PHASE 2 API SQL TESTS PASSED
