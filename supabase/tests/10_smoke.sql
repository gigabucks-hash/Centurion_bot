-- Smoke tests for 0001_init.sql. Run after 00_local_shim.sql + the migration
-- (see scripts/check_sql.sh). Negative tests use pg_temp.expect_error().
\set ON_ERROR_STOP 1
\set QUIET 1

create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok (rejected): % -> %', label, sqlerrm;
    return;
  end;
  raise exception 'EXPECTED FAILURE DID NOT HAPPEN: %', label;
end $$;

-- ---------------- fixtures (backend / superuser) ----------------
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-00000000000a', 'ws A', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-00000000000b', 'ws B', '00000000-0000-0000-0000-00000000000b');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'A1', 'running',
   '{"name":"A1","budgetSol":5,"tradeSol":0.25,"maxOpen":3,"streams":["graduated"],"passMark":70,
     "exitPlan":"ladder","takeProfits":[{"gainPct":50,"sellPct":33}],"stopLossPct":15,"tradingDays":[1,2,3],
     "approvalMode":"ask_first_buy","sellFloors":{"enabled":true,"maxLossPct":35,"liquidityDropPct":80},
     "askFirst":true,"shield":{"bundlers":true}}'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', 'A2', 'running', '{}');
insert into public.coins (mint, stream, decimals) values ('7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'graduated', 6);
insert into public.picks (ck, workspace_id, strategy_id, mint, stage, score, pass_mark)
  values ('abc123', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
          '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'passed', 85, 70);
insert into public.events (id, workspace_id, strategy_id, ck, mint, ts, kind, actor, data)
  values ('abc123:1761700000000:coin.passed', '10000000-0000-0000-0000-00000000000a',
          '20000000-0000-0000-0000-00000000000a', 'abc123', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
          now(), 'coin.passed', 'screener', '{"summary":"Fit 85 / 70"}');
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
   'buy', 'abc123', 250000000, true, now() + interval '10 minutes'),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000c',
   'buy', 'abc123', 250000000, false, now() + interval '10 minutes'),
  ('30000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000c',
   'guard_weakening', '20000000-0000-0000-0000-00000000000c', null, false, now() + interval '24 hours'),
  ('30000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
   'buy', 'abc123', 100000000, false, now() + interval '1 second');
insert into public.jobs (workspace_id, kind, payload) values ('10000000-0000-0000-0000-00000000000a', 'entry.arm', '{}');

do $$ begin
  assert (select count(*) from public.workspace_members) = 2, 'owner memberships missing';
  assert (select rev from public.strategies where name = 'A1') = 1;
end $$;

-- ---------------- settings validation ----------------
select pg_temp.expect_error($$update public.strategies set settings = '{"maxOpen":50}' where name='A1'$$, 'maxOpen > 20');
select pg_temp.expect_error($$update public.strategies set settings = '{"passMark":10}' where name='A1'$$, 'passMark < 50');
select pg_temp.expect_error($$update public.strategies set settings = '{"budgetSol":1,"tradeSol":2}' where name='A1'$$, 'tradeSol > budgetSol');
select pg_temp.expect_error($$update public.strategies set settings = '{"bogusKey":1}' where name='A1'$$, 'unknown key');
select pg_temp.expect_error($$update public.strategies set settings = '{"exitPlan":"yolo"}' where name='A1'$$, 'unknown exit plan');
select pg_temp.expect_error($$update public.strategies set settings = '{"stopLossPct":3}' where name='A1'$$, 'stopLossPct 3');
select pg_temp.expect_error($$update public.strategies set settings = '{"streams":["moon"]}' where name='A1'$$, 'bad stream');
select pg_temp.expect_error($$update public.strategies set settings = '{"tradingDays":[7]}' where name='A1'$$, 'bad weekday');
select pg_temp.expect_error($$update public.strategies set settings = '{"takeProfits":[{"gainPct":10}]}' where name='A1'$$, 'rung missing sellPct');
select pg_temp.expect_error($$update public.strategies set settings = '{"approvalMode":"yolo"}' where name='A1'$$, 'bad approvalMode');
select pg_temp.expect_error($$update public.strategies set settings = '{"sellFloors":{"maxLossPct":150}}' where name='A1'$$, 'sellFloors range');
select pg_temp.expect_error($$update public.strategies set settings = '{"sellFloors":{"foo":1}}' where name='A1'$$, 'sellFloors unknown key');
select pg_temp.expect_error($$update public.strategies set settings = '"x"' where name='A1'$$, 'settings not object');
update public.strategies set settings = settings || '{"maxOpen":5}' where name = 'A1';
do $$ begin assert (select rev from public.strategies where name = 'A1') = 2, 'rev not bumped'; end $$;

-- ---------------- paper-only invariants ----------------
select pg_temp.expect_error($$update public.workspaces set mode = 'live'$$, 'workspace live mode');
select pg_temp.expect_error($$insert into public.strategies (workspace_id, name, mode) values ('10000000-0000-0000-0000-00000000000a','x','live')$$, 'strategy live mode');
select pg_temp.expect_error($$insert into public.wallets (workspace_id, pubkey, is_active) values ('10000000-0000-0000-0000-00000000000a','7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', true)$$, 'active wallet');
select pg_temp.expect_error($$insert into public.guard_changes (workspace_id, strategy_id, mode, from_rev, diff, weakened_fields) values ('10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','live',1,'[]','{devPctFail}')$$, 'live guard weakening disabled');

-- ---------------- positions, fills, exit stats ----------------
insert into public.positions (id, position_key, pick_id, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports)
  select '40000000-0000-0000-0000-00000000000a', 'abc123.0', id, strategy_id, workspace_id, mint, 1000000000, 250000000
    from public.picks where ck = 'abc123';
insert into public.fills (position_id, workspace_id, side, sol_lamports, token_amount_raw, exec_price_sol, swap_fee_lamports, network_fee_lamports)
  values ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'buy', 250000000, 1000000000, 0.00025, 3125000, 25000);
select pg_temp.expect_error($$insert into public.fills (position_id, workspace_id, side, simulated, tx_sig, sol_lamports, token_amount_raw, exec_price_sol) values ('40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','buy',false,'sig',1,1,1)$$, 'real fill');
select pg_temp.expect_error($$update public.positions set status = 'closed', closed_at = now() where position_key = 'abc123.0'$$, 'close without exit_reason');
update public.positions set status = 'closed', closed_at = opened_at + interval '90 seconds', sol_out_lamports = 300000000, exit_reason = 'take_profit'
 where position_key = 'abc123.0';
do $$ declare r record; begin
  select * into r from public.exit_stats('10000000-0000-0000-0000-00000000000a');
  assert r.reason = 'take_profit' and r.count = 1 and r.wins = 1 and r.total_pnl_lamports = 50000000 and r.avg_hold_seconds = 90,
    format('exit_stats wrong: %s', r);
end $$;

-- ---------------- append-only ----------------
select pg_temp.expect_error($$update public.events set data = '{}'$$, 'update event');
select pg_temp.expect_error($$delete from public.events$$, 'delete event');
select pg_temp.expect_error($$truncate public.events$$, 'truncate events');
select pg_temp.expect_error($$update public.fills set sol_lamports = 9$$, 'update fill');
select pg_temp.expect_error($$insert into public.events (id, workspace_id, ts, kind, actor) values ('bad id','10000000-0000-0000-0000-00000000000a',now(),'alert','system')$$, 'bad event id');
select pg_temp.expect_error($$insert into public.events (id, workspace_id, ts, kind, actor, data) values ('p1:1:proposal.expired','10000000-0000-0000-0000-00000000000a',now(),'proposal.expired','system','{"reason":"bored"}')$$, 'bad expire reason');

-- ---------------- portfolio snapshots (single source of truth) ----------------
insert into public.portfolio_snapshots (workspace_id, cash_lamports, positions_cost_lamports, positions_value_lamports,
  equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq)
values ('10000000-0000-0000-0000-00000000000a', 29750000000, 250000000, 200000000, 29950000000, 30000000000, 16, 0, -50000000, 1, 1);
select pg_temp.expect_error($$insert into public.portfolio_snapshots (workspace_id, cash_lamports, positions_cost_lamports, positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq) values ('10000000-0000-0000-0000-00000000000a', 1, 0, 0, 2, 2, 0, 0, 0, 0, 1)$$, 'inconsistent equity');
do $$ begin
  assert (select equity_lamports from public.workspace_equity_latest where workspace_id = '10000000-0000-0000-0000-00000000000a') = 29950000000;
end $$;

-- ---------------- approvals: version, transitions, retire_strategy, timeout ----------------
select pg_temp.expect_error($$update public.approvals set status = 'approved', decided_at = now() where id = '30000000-0000-0000-0000-00000000000a'$$, 'stale version');
update public.approvals set status = 'approved', decided_at = now(), version = version + 1,
       decided_by = '00000000-0000-0000-0000-00000000000a' where id = '30000000-0000-0000-0000-00000000000a';
select pg_temp.expect_error($$update public.approvals set status = 'rejected', version = version + 1 where id = '30000000-0000-0000-0000-00000000000a'$$, 'approved -> rejected');
select pg_temp.expect_error($$update public.approvals set expires_at = now() + interval '9 days', version = version + 1 where id = '30000000-0000-0000-0000-00000000000b'$$, 'client-moved expires_at');

-- delete A2: both of its open proposals expire atomically + events emitted
do $$ declare n int; begin
  n := public.retire_strategy('20000000-0000-0000-0000-00000000000c', 'delete', '00000000-0000-0000-0000-00000000000a');
  assert n = 2, format('expected 2 expired, got %s', n);
  assert (select count(*) from public.approvals where strategy_id = '20000000-0000-0000-0000-00000000000c'
            and status = 'expired' and expire_reason = 'strategy_deleted') = 2;
  assert (select count(*) from public.events where kind = 'proposal.expired' and data ->> 'reason' = 'strategy_deleted') = 2;
  assert (select count(*) from public.events where kind = 'strategy.deleted') = 1;
  assert (select status from public.strategies where id = '20000000-0000-0000-0000-00000000000c') = 'deleted';
  assert (select count(*) from public.audit_log where action = 'strategy.delete') = 1;
end $$;

select pg_sleep(1.1);
do $$ begin
  assert public.expire_due_proposals() = 1, 'timeout sweep';
  assert (select expire_reason from public.approvals where id = '30000000-0000-0000-0000-00000000000d') = 'timeout';
end $$;

do $$ begin
  assert public.events_safe_seq() = (select max(seq) from public.events), 'safe seq with no in-flight tx';
end $$;

-- ---------------- job queue ----------------
do $$ declare j public.jobs; begin
  select * into j from public.claim_job('w1', array['entry.arm']);
  assert j.status = 'running' and j.attempts = 1, 'claim_job failed';
  assert (select count(*) from public.claim_job('w2', array['entry.arm'])) = 0, 'double claim';
end $$;

-- ---------------- auth identities & SIWS nonce ----------------
insert into public.auth_identities (user_id, provider, subject) values
  ('00000000-0000-0000-0000-00000000000a', 'google', 'google-sub-1'),
  ('00000000-0000-0000-0000-00000000000a', 'siws', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr');
select pg_temp.expect_error($$insert into public.auth_identities (user_id, provider, subject) values ('00000000-0000-0000-0000-00000000000b','google','google-sub-1')$$, 'identity stolen by second user');
select pg_temp.expect_error($$insert into public.auth_identities (user_id, provider, subject) values ('00000000-0000-0000-0000-00000000000b','siws','not-a-pubkey')$$, 'bad siws subject');
insert into public.siws_nonces (nonce, address, domain) values ('abcdef0123456789abcd', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'app.solbot.local');
do $$ begin
  assert public.consume_siws_nonce('abcdef0123456789abcd', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'app.solbot.local');
  assert not public.consume_siws_nonce('abcdef0123456789abcd', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'app.solbot.local'), 'nonce replay';
end $$;

-- ---------------- funnel roll-up ----------------
insert into public.strategy_funnel_hourly (strategy_id, workspace_id, bucket, scanned, filtered, signaled, entered, exited, rejections, last_seq) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', date_trunc('hour', now()) - interval '1 hour', 100, 10, 4, 2, 1, '{"liquidity":50,"top10":40}', 10),
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', date_trunc('hour', now()), 50, 5, 1, 1, 0, '{"liquidity":45}', 20);
do $$ declare f record; begin
  select * into f from public.strategy_funnel('20000000-0000-0000-0000-00000000000a', now() - interval '24 hours');
  assert f.scanned = 150 and f.entered = 3 and (f.rejections ->> 'liquidity')::int = 95 and f.as_of_seq = 20, format('funnel %s', f);
end $$;

-- ---------------- RLS as user A ----------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.workspaces) = 1, 'A should see exactly 1 workspace';
  assert (select count(*) from public.strategies) = 1, 'A sees own non-deleted strategy only';
  assert (select count(*) from public.events) >= 1, 'A should see own events';
  assert (select count(*) from public.coins) = 1, 'coins are globally readable';
  assert (select count(*) from public.auth_identities) = 2, 'A sees own identities';
  assert (select count(*) from public.workspace_equity_latest) = 1, 'A sees own equity';
  assert (select count(*) from public.exit_stats('10000000-0000-0000-0000-00000000000a')) = 1, 'exit_stats under RLS';
end $$;
select pg_temp.expect_error($$insert into public.events (id, workspace_id, ts, kind, actor) values ('x:1:alert','10000000-0000-0000-0000-00000000000a',now(),'alert','user')$$, 'client insert event');
select pg_temp.expect_error($$insert into public.strategies (workspace_id, name) values ('10000000-0000-0000-0000-00000000000b','steal')$$, 'insert into other ws');
select pg_temp.expect_error($$select public.claim_job('x', array['entry.arm'])$$, 'client claim_job');
select pg_temp.expect_error($$select public.retire_strategy('20000000-0000-0000-0000-00000000000a','delete',null)$$, 'client retire_strategy');
select pg_temp.expect_error($$update public.approvals set status = 'rejected', version = version + 1 where id = '30000000-0000-0000-0000-00000000000b'$$, 'client decides approval directly');
select pg_temp.expect_error($$delete from public.strategies$$, 'client hard delete strategy');
select pg_temp.expect_error($$select * from public.siws_nonces$$, 'client reads nonces');

-- ---------------- RLS as user B ----------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.workspaces) = 1, 'B sees only ws B';
  assert (select count(*) from public.strategies) = 0, 'B must not see A strategies';
  assert (select count(*) from public.picks) = 0, 'B must not see A picks';
  assert (select count(*) from public.events) = 0, 'B must not see A events';
  assert (select count(*) from public.approvals) = 0, 'B must not see A approvals';
  assert (select count(*) from public.workspace_equity_latest) = 0, 'B must not see A equity';
  assert (select count(*) from public.exit_stats('10000000-0000-0000-0000-00000000000a')) = 0, 'B exit_stats leak';
  assert (select count(*) from public.auth_identities) = 0, 'B must not see A identities';
end $$;
update public.strategies set name = 'hacked';  -- affects 0 rows under RLS
reset role;
do $$ begin
  assert (select name from public.strategies where id = '20000000-0000-0000-0000-00000000000a') = 'A1', 'B modified A';
end $$;

\echo 'ALL SQL SMOKE TESTS PASSED'
