-- Tests for 0008: guard-change proposals (propose -> hold-confirmed approve -> applied; reject; expire; stale).
\set ON_ERROR_STOP 1
\set QUIET 1
create or replace function pg_temp.expect_code(sql text, code text, label text) returns text language plpgsql as $$
declare m text; d text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics m = message_text, d = pg_exception_detail;
    if m <> code then raise exception '%: expected %, got % (%)', label, code, m, sqlerrm; end if;
    raise notice 'ok (%): %', code, label;
    return coalesce(d, '');
  end;
  raise exception 'EXPECTED % DID NOT HAPPEN: %', code, label;
end $$;
create or replace function pg_temp.as_user(client text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009f1', false),
         set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000009f1', 'sentra_client', client)::text, false);
$$;
create or replace function pg_temp.tok(a uuid, via text default 'desktop') returns text language sql as $$
  select token from public.issue_approval_token(a, '00000000-0000-0000-0000-0000000009f1', via::public.decided_via)
$$;
create or replace function pg_temp.srev() returns int language sql as $$
  select rev from public.strategies where id = '20000000-0000-0000-0000-0000000009f1'
$$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009f1');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000009f1', 'ws F', '00000000-0000-0000-0000-0000000009f1');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000009f1', '10000000-0000-0000-0000-0000000009f1', 'GC', 'paused',
   '{"guard_checks":{"creator_share_pct_fail":15},"top_holders_share_pct_max":40}');
select pg_temp.as_user('desktop');

-- propose: 24 h approval + requested guard change; nothing applied; events + audit
do $$ declare r jsonb; a uuid; begin
  perform pg_temp.expect_code($q$select public.propose_guard_change('20000000-0000-0000-0000-0000000009f1', 1, '{"score_threshold":80}')$q$,
                              'VALIDATION_FAILED', 'not a weakening');
  perform pg_temp.expect_code($q$select public.propose_guard_change('20000000-0000-0000-0000-0000000009f1', 9, '{"top_holders_share_pct_max":60}')$q$,
                              'STRATEGY_REV_CONFLICT', 'stale propose');
  perform pg_temp.expect_code($q$select public.propose_guard_change('20000000-0000-0000-0000-0000000009f1', 1, '{"score_threshold":1}')$q$,
                              'VALIDATION_FAILED', 'invalid settings');
  r := public.propose_guard_change('20000000-0000-0000-0000-0000000009f1', 1,
         '{"top_holders_share_pct_max":60,"guard_checks":{"creator_share_pct_fail":10}}', 'MacBook');
  a := (r->'proposal'->>'id')::uuid;
  assert r->'proposal'->>'kind' = 'guard_change' and (r->'proposal'->>'weakening')::boolean and r->'proposal'->>'status' = 'pending', format('proposal %s', r);
  assert (r->'proposal'->>'base_rev')::int = 1 and r->'proposal'->>'risk' = 'medium', 'base_rev + risk';
  assert (select expires_at - created_at from public.approvals where id = a) = interval '24 hours', '24 h expiry';
  assert r->'guard_change'->>'status' = 'requested' and r->'guard_change'->'weakened_fields' = '["top_holders_share_pct_max"]', format('gc %s', r);
  assert pg_temp.srev() = 1, 'not applied yet';
  assert exists (select 1 from public.events where type = 'proposal.created' and payload->>'proposal_id' = a::text), 'proposal.created';
  assert exists (select 1 from public.events where type = 'guard.changed' and payload->>'status' = 'requested' and payload->>'proposal_id' = a::text), 'guard.changed requested';
  assert exists (select 1 from public.audit_log where action = 'guard_change.request' and approval_id = a and device = 'MacBook'), 'audit';
  perform set_config('test.gc1', a::text, false);
  perform set_config('test.gc1tok', pg_temp.tok(a), false);
end $$;

-- MCP cannot decide a weakening; approve needs the hold
select pg_temp.as_user('mcp');
do $$ begin
  perform pg_temp.expect_code(format($q$select public.decide_approval(%L, %L, 'approve', 1, 'gc-key-mcp-1', null, 1500)$q$,
    current_setting('test.gc1'), pg_temp.tok(current_setting('test.gc1')::uuid, 'mcp')), 'APPROVAL_REQUIRES_APP', 'mcp');
end $$;
select pg_temp.as_user('desktop');
do $$ begin
  perform pg_temp.expect_code(format($q$select public.decide_approval(%L, %L, 'approve', 1, 'gc-key-0001')$q$,
    current_setting('test.gc1'), current_setting('test.gc1tok')), 'CONFIRMATION_REQUIRED', 'no hold');
  perform pg_temp.expect_code(format($q$select public.decide_approval(%L, %L, 'approve', 1, 'gc-key-0002', null, 600)$q$,
    current_setting('test.gc1'), current_setting('test.gc1tok')), 'HOLD_TOO_SHORT', 'short hold');
end $$;
-- a fresh token is too young even with a long reported hold
do $$ declare t text := pg_temp.tok(current_setting('test.gc1')::uuid); begin
  perform pg_temp.expect_code(format($q$select public.decide_approval(%L, %L, 'approve', 1, 'gc-key-0003', null, 5000)$q$,
    current_setting('test.gc1'), t), 'HOLD_TOO_SHORT', 'token younger than 1.2 s');
end $$;
select pg_sleep(1.25);
do $$ declare r jsonb; s jsonb; begin
  r := public.decide_approval(current_setting('test.gc1')::uuid, current_setting('test.gc1tok'), 'approve', 1, 'gc-key-0004', null, 1300);
  assert r->>'status' = 'approved', format('approve %s', r);
  select settings into s from public.strategies where id = '20000000-0000-0000-0000-0000000009f1';
  assert pg_temp.srev() = 2 and s->>'top_holders_share_pct_max' = '60' and s->'guard_checks'->>'creator_share_pct_fail' = '10', format('applied %s', s);
  assert (select status from public.guard_changes where approval_id = current_setting('test.gc1')::uuid) = 'applied', 'gc applied';
  assert exists (select 1 from public.events where type = 'guard.changed' and payload->>'status' = 'applied' and (payload->>'to_rev')::int = 2), 'guard.changed applied';
  assert exists (select 1 from public.events where type = 'strategy.updated' and payload->>'proposal_id' = current_setting('test.gc1')), 'strategy.updated';
  assert (select changed_via from public.strategy_revisions where strategy_id = '20000000-0000-0000-0000-0000000009f1' and rev = 2) = 'desktop', 'revision via';
  assert exists (select 1 from public.audit_log where action = 'guard_change.apply' and approval_id = current_setting('test.gc1')::uuid), 'apply audit';
  -- replay is harmless
  r := public.decide_approval(current_setting('test.gc1')::uuid, current_setting('test.gc1tok'), 'approve', 1, 'gc-key-0004', null, 1300);
  assert (r->>'replayed')::boolean and pg_temp.srev() = 2, 'replay does not re-apply';
end $$;

-- reject -> rejected; stale base -> STRATEGY_REV_CONFLICT; expiry -> expired
do $$ declare r jsonb; a uuid; b uuid; c uuid; begin
  a := (public.propose_guard_change('20000000-0000-0000-0000-0000000009f1', 2, '{"top_holders_share_pct_max":70}')->'proposal'->>'id')::uuid;
  b := (public.propose_guard_change('20000000-0000-0000-0000-0000000009f1', 2, '{"top_holders_share_pct_max":0}')->'proposal'->>'id')::uuid;
  c := (public.propose_guard_change('20000000-0000-0000-0000-0000000009f1', 2, '{"guard_checks":{"allow_mint_authority":true}}')->'proposal'->>'id')::uuid;
  assert (select risk from public.approvals where id = c) = 'critical', 'critical risk';
  r := public.decide_approval(a, pg_temp.tok(a), 'reject', 1, 'gc-key-0005', 'other');
  assert r->>'status' = 'rejected' and (select status from public.guard_changes where approval_id = a) = 'rejected', 'rejected';
  assert pg_temp.srev() = 2, 'reject applies nothing';
  -- someone strengthens the strategy: b is now stale
  perform public.update_strategy('20000000-0000-0000-0000-0000000009f1', 2, '{"top_holders_share_pct_max":50}');
  perform set_config('test.b', b::text, false);
  perform set_config('test.btok', pg_temp.tok(b), false);
  perform public.expire_proposal(c, 'timeout');
  assert (select status from public.guard_changes where approval_id = c) = 'expired', 'expired';
  assert exists (select 1 from public.events where type = 'guard.changed' and payload->>'status' = 'expired' and payload->>'proposal_id' = c::text), 'guard.changed expired';
end $$;
select pg_sleep(1.25);
do $$ declare d jsonb; begin
  d := pg_temp.expect_code(format($q$select public.decide_approval(%L, %L, 'approve', 1, 'gc-key-0006', null, 1300)$q$,
    current_setting('test.b'), current_setting('test.btok')), 'STRATEGY_REV_CONFLICT', 'stale base')::jsonb;
  assert (d->>'current_rev')::int = 3 and d->'current' is not null, format('stale detail %s', d);
  assert (select status from public.guard_changes where approval_id = current_setting('test.b')::uuid) = 'requested', 'stale not applied';
end $$;
-- Real stays rejected by the schema
do $$ begin
  perform pg_temp.expect_code($q$insert into public.guard_changes (workspace_id, strategy_id, mode, from_rev, diff) values ('10000000-0000-0000-0000-0000000009f1', '20000000-0000-0000-0000-0000000009f1', 'real', 1, '[]')$q$,
    'new row for relation "guard_changes" violates check constraint "guard_changes_practice_only"', 'real guard change');
end $$;
select 'ALL 0008 GUARD CHANGE FLOW SQL TESTS PASSED';
