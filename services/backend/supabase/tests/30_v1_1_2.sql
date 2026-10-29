-- Tests for 0003_contracts_v1_1_2.sql and the 1.1.2 changes in 0001/0002.
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
    if code ~ '^[A-Z_]+$' and st !~ '^P0[45][0-9][0-9]$' then raise exception '%: sqlstate % is not P0xxx', label, st; end if;
    raise notice 'ok (% %): %', code, st, label;
    return coalesce(d, '');
  end;
  raise exception 'EXPECTED % DID NOT HAPPEN: %', code, label;
end $$;
create or replace function pg_temp.as_user(u text, client text default 'web') returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u, ''), false),
         set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'sentra_client', client)::text end, false);
$$;

-- fixtures: user E, ws E, one open practice position
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000000e1', 'ws E', '00000000-0000-0000-0000-0000000000e1');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', 'viewer');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', 'E1', 'running',
   '{"stop_loss_pct":30,"peak_trail_pct":15,"exit_rules":{"loss_guards":[{"at_loss_pct":20,"sell_portion_pct":50}]}}');
insert into public.coins (mint, venue, decimals, token_program, quote_mint) values
  ('Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump', 'curve', 6, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', null);
insert into public.positions (id, position_key, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports, cost_basis_lamports, entry_price_sol)
values ('60000000-0000-0000-0000-0000000000e1', 'e1pos.1', '20000000-0000-0000-0000-0000000000e1',
        '10000000-0000-0000-0000-0000000000e1', 'Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump',
        1000000000, 250000000, 250000000, '0.00000025');

-- ---------------- settings: stop_loss_pct restored next to peak_trail_pct; loss_guards items ----------------
do $$ begin
  assert public.strategy_settings_valid('{"stop_loss_pct":0}') and public.strategy_settings_valid('{"stop_loss_pct":5,"peak_trail_pct":49}'), 'stop_loss_pct ok';
end $$;
select pg_temp.expect_code($$select public.strategy_settings_valid('{"stop_loss_pct":3}')$$, 'settings.stop_loss_pct must be 0 (off) or 5-49', 'stop_loss_pct 3');
select pg_temp.expect_code($$select public.strategy_settings_valid('{"exit_rules":{"loss_guards":[{"at_loss_pct":20}]}}')$$,
  'settings.exit_rules.loss_guards entry invalid: {"at_loss_pct": 20}', 'loss guard missing sell_portion_pct');
select pg_temp.expect_code($$select public.strategy_settings_valid('{"exit_rules":{"loss_guards":[{"at_loss_pct":20,"sell_portion_pct":50,"x":1}]}}')$$,
  'settings.exit_rules.loss_guards entry invalid: {"x": 1, "at_loss_pct": 20, "sell_portion_pct": 50}', 'loss guard unknown key');

-- ---------------- positions.rev + practice_epoch ----------------
do $$ declare p public.positions; begin
  select * into p from public.positions where id = '60000000-0000-0000-0000-0000000000e1';
  assert p.rev = 1 and p.practice_epoch = 0, 'new position rev 1 / epoch 0';
  update public.positions set peak_price_sol = '0.0000003' where id = p.id;
  assert (select rev from public.positions where id = p.id) = 2, 'update bumps rev';
  assert (public.position_wire(p) ->> 'decimals')::int = 6 and public.position_wire(p) ->> 'qty_raw' = '1000000000', 'wire';
  assert public.position_wire(p) ? 'practice_epoch' and public.position_wire(p) ->> 'token_program' like 'Tokenz%', 'wire epoch/program';
end $$;

-- ---------------- close_position ----------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.expect_code($$select public.close_position('60000000-0000-0000-0000-0000000000e1', 2, 'key-viewer-01')$$, 'FORBIDDEN_ROLE', 'viewer cannot sell');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'desktop');
select pg_temp.expect_code($$select public.close_position('60000000-0000-0000-0000-0000000000e1', 2, 'key-frac-0001', 0)$$, 'INVALID_FRACTION', 'fraction 0');
select pg_temp.expect_code($$select public.close_position('60000000-0000-0000-0000-0000000000e1', 2, 'key-frac-0002', 10001)$$, 'INVALID_FRACTION', 'fraction > 10000');
select pg_temp.expect_code($$select public.close_position('60000000-0000-0000-0000-0000000000e1', null, 'key-norev-001')$$, 'PRECONDITION_REQUIRED', 'no rev');
do $$ declare d jsonb; begin
  d := pg_temp.expect_code($q$select public.close_position('60000000-0000-0000-0000-0000000000e1', 1, 'key-stale-001')$q$, 'VERSION_CONFLICT', 'stale rev')::jsonb;
  assert (d->>'current_rev')::int = 2 and d->'current'->>'id' = '60000000-0000-0000-0000-0000000000e1', 'conflict body carries current';
end $$;
select pg_temp.expect_code($$select public.close_position('60000000-0000-0000-0000-0000000000e1', 2, 'short')$$, 'VALIDATION_FAILED', 'short idempotency key');
do $$ declare r jsonb; r2 jsonb; oid uuid; f jsonb; p public.positions; begin
  r := public.close_position('60000000-0000-0000-0000-0000000000e1', 2, 'key-half-0001', 5000);
  assert r->>'status' = 'queued' and r->'fill' = 'null'::jsonb and r ? 'job_id' and r ? 'order_id' and not (r->>'replayed')::boolean, format('close response %s', r);
  assert (r->'position'->>'rev')::int = 2 and r->'order'->>'fraction_bps' = '5000' and r ? 'server_now', 'response position/order';
  assert jsonb_typeof(r->'job_id') = 'string', 'job_id is an int64 string';
  oid := (r->>'order_id')::uuid;
  assert exists (select 1 from public.events where type = 'order.submitted' and payload->'order'->>'id' = oid::text), 'order.submitted';
  assert exists (select 1 from public.jobs where kind = 'order.fill' and payload->>'order_id' = oid::text), 'job queued';
  r2 := public.close_position('60000000-0000-0000-0000-0000000000e1', 2, 'key-half-0001', 5000);
  assert (r2->>'replayed')::boolean and r2->>'order_id' = oid::text, 'same key + same body replays';
  assert (select count(*) from public.orders where idempotency_key = 'key-half-0001') = 1, 'one order';
  perform pg_temp.expect_code($q$select public.close_position('60000000-0000-0000-0000-0000000000e1', 2, 'key-half-0001', 10000)$q$,
                              'IDEMPOTENCY_KEY_REUSED', 'same key + other body');
  -- worker fills half
  perform pg_temp.as_user(null);
  f := public.complete_order_fill(oid, 500000000, 140000000, '0.00000028', '0.000000285', 12, 18.5, 1750000, 5000, 420);
  select * into p from public.positions where id = '60000000-0000-0000-0000-0000000000e1';
  assert p.status = 'open' and p.qty_raw = 500000000 and p.cost_basis_lamports = 125000000 and p.rev = 3, format('partial %s', row_to_json(p));
  assert f->'fill'->>'mid_price_sol' = '0.000000285000000000' and f->'fill'->>'sol_lamports' = '140000000', format('fill wire %s', f);
  assert exists (select 1 from public.events where type = 'position.updated' and (payload->>'rev')::int = 3
                 and payload->>'qty_raw' = '500000000' and payload->>'cost_basis_lamports' = '125000000'), 'position.updated';
  assert exists (select 1 from public.events where type = 'fill.simulated' and payload->>'order_id' = oid::text), 'fill.simulated';
  assert exists (select 1 from public.events where type = 'order.filled' and payload->'order'->>'status' = 'filled'), 'order.filled';
end $$;
-- close the rest, then a closed position refuses
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'mobile');
do $$ declare r jsonb; p public.positions; begin
  r := public.close_position('60000000-0000-0000-0000-0000000000e1', 3, 'key-rest-0001');
  perform pg_temp.as_user(null);
  perform public.complete_order_fill((r->>'order_id')::uuid, 500000000, 150000000, '0.0000003', '0.0000003');
  select * into p from public.positions where id = '60000000-0000-0000-0000-0000000000e1';
  assert p.status = 'closed' and p.exit_reason = 'manual' and p.qty_raw = 0, 'closed manual';
  assert exists (select 1 from public.events where type = 'position.closed' and payload->>'exit_reason' = 'manual' and (payload->>'rev')::int = p.rev), 'position.closed with rev';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'mobile');
select pg_temp.expect_code($$select public.close_position('60000000-0000-0000-0000-0000000000e1', 5, 'key-again-001')$$, 'POSITION_ALREADY_CLOSED', 'already closed');
select pg_temp.as_user(null);

-- fail_order emits order.failed (N-05)
insert into public.positions (id, position_key, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports, cost_basis_lamports)
values ('60000000-0000-0000-0000-0000000000e2', 'e1pos.2', '20000000-0000-0000-0000-0000000000e1',
        '10000000-0000-0000-0000-0000000000e1', 'Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump', 10, 1000, 1000);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'web');
do $$ declare r jsonb; begin
  r := public.close_position('60000000-0000-0000-0000-0000000000e2', 1, 'key-fail-0001');
  perform pg_temp.as_user(null);
  perform public.fail_order((r->>'order_id')::uuid, 'SLIPPAGE_EXCEEDED', '{"max_slippage_bps":100}');
  assert exists (select 1 from public.events where type = 'order.failed' and payload->>'reason_code' = 'SLIPPAGE_EXCEEDED'
                 and payload->>'mode' = 'practice' and payload ? 'server_now'), 'order.failed';
  assert (select status from public.orders where id = (r->>'order_id')::uuid) = 'failed', 'order failed';
  assert (select status from public.positions where id = '60000000-0000-0000-0000-0000000000e2') = 'open', 'position untouched';
  perform pg_temp.expect_code(format($q$select public.fail_order(%L, 'BOGUS')$q$, r->>'order_id'), 'VALIDATION_FAILED', 'reason_code from errors.json only');
end $$;
-- client cannot call worker functions
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'web');
set role authenticated;
do $$ declare ok boolean := false; begin
  begin perform public.fail_order(gen_random_uuid(), 'POOL_STALE'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'fail_order is service-only';
  ok := false;
  begin perform 1 from public.orders where idempotency_key is not null; exception when insufficient_privilege then ok := true; end;
  assert ok, 'idempotency columns hidden from clients';
end $$;
reset role;
select pg_temp.as_user(null);

-- ---------------- exit_stats shape ----------------
do $$ declare r record; begin
  select * into r from public.exit_stats('10000000-0000-0000-0000-0000000000e1') where exit_reason = 'manual';
  assert r.count = 1 and r.pnl_lamports = '40000000' and r.win_rate_pct = 100 and r.avg_hold_s >= 0, format('exit_stats %s', row_to_json(r));
  assert pg_typeof(r.pnl_lamports)::text = 'text', 'pnl_lamports is a string';
end $$;

-- ---------------- portfolio_latest carries practice_epoch ----------------
do $$ begin
  assert exists (select 1 from information_schema.columns where table_name = 'portfolio_latest' and column_name = 'practice_epoch'), 'portfolio_latest.practice_epoch';
end $$;

-- ---------------- proposal.expired reasons: practice_reset + account_deleted ----------------
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1',
   'buy_pick', 'e1pick', 100000000, true, now() + interval '10 minutes'),
  ('30000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1',
   'buy_pick', 'e1pick2', 100000000, false, now() + interval '10 minutes');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1', 'mobile');
do $$ begin
  perform public.reset_practice('10000000-0000-0000-0000-0000000000e1');
  assert (select status = 'expired' and expire_reason = 'practice_reset' from public.approvals where id = '30000000-0000-0000-0000-0000000000e1'), 'reset expires with practice_reset';
  assert exists (select 1 from public.events where type = 'proposal.expired' and payload->>'proposal_id' = '30000000-0000-0000-0000-0000000000e1'
                 and payload->>'reason' = 'practice_reset' and (payload->>'rev')::int = 2), 'proposal.expired practice_reset event';
  assert (select practice_epoch from public.workspaces where id = '10000000-0000-0000-0000-0000000000e1') = 1, 'epoch 1';
end $$;
select pg_temp.as_user(null);
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-0000000000e1',
   'buy_pick', 'e1pick3', 100000000, false, now() + interval '10 minutes');
do $$ begin
  perform public.request_account_deletion('00000000-0000-0000-0000-0000000000e1', now(), 1);
  update public.users set deletion_requested_at = now() - interval '2 days', deletion_scheduled_for = now() - interval '1 day'
   where id = '00000000-0000-0000-0000-0000000000e1';
  perform public.finalize_account_deletion('00000000-0000-0000-0000-0000000000e1');
  assert (select status = 'expired' and expire_reason = 'account_deleted' from public.approvals where id = '30000000-0000-0000-0000-0000000000e3'), 'deletion expires with account_deleted';
  assert exists (select 1 from public.events where type = 'proposal.expired' and payload->>'proposal_id' = '30000000-0000-0000-0000-0000000000e3'
                 and payload->>'reason' = 'account_deleted'), 'proposal.expired account_deleted event';
end $$;

-- ---------------- decide_approval: expected_rev required for every channel, incl. push ----------------
do $$ begin
  assert (select count(*) from pg_proc where proname = 'decide_approval') = 1, 'one decide_approval signature';
  assert not exists (select 1 from pg_proc p where proname in ('decide_approval','update_strategy','reset_practice','close_position','register_device','revoke_device')
                     and (proargnames && array['p_actor','p_via','p_client','p_user'])), 'no client-supplied actor/via';
  assert public.request_client() = 'web', 'no claim -> web';
end $$;

\echo 'ALL v1.1.2 SQL TESTS PASSED'
