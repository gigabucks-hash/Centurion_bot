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
   '{"name":"A1","bankroll_lamports":"5000000000","ticket_lamports":"250000000","max_concurrent_positions":3,"venues":["amm"],"score_threshold":70,
     "exit_preset":"three_step_ladder","profit_targets":[{"at_gain_pct":50,"sell_portion_pct":33}],"peak_trail_pct":15,"entry_weekdays_utc":[1,2,3],
     "approval_mode":"ask_first_buy","sell_floors":{"enabled":true,"max_loss_pct":35,"liquidity_drop_pct":80},
     "buy_to_sell_ratio_min":1.25,"guard_checks":{"bundled_share":true}}'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', 'A2', 'running', '{}');
insert into public.coins (mint, venue, decimals) values ('7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'amm', 6);
insert into public.picks (ck, workspace_id, strategy_id, mint, stage, score, score_threshold)
  values ('abc123', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
          '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 'passed', 85, 70);
insert into public.events (id, workspace_id, strategy_id, ck, mint, ts, type, actor, payload)
  values ('abc123:1761700000000:pick.created', '10000000-0000-0000-0000-00000000000a',
          '20000000-0000-0000-0000-00000000000a', 'abc123', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
          now(), 'pick.created', 'screener', '{"summary":"Fit 85 / 70"}');
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, is_first_buy, expires_at, base_rev) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
   'buy_pick', 'abc123', 250000000, true, now() + interval '10 minutes', null),
  ('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000c',
   'buy_pick', 'abc123', 250000000, false, now() + interval '10 minutes', null),
  ('30000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000c',
   'guard_change', '20000000-0000-0000-0000-00000000000c', null, false, now() + interval '24 hours', 1),
  ('30000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
   'buy_pick', 'abc123', 100000000, false, now() + interval '1 second', null),
  ('30000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a',
   'buy_pick', 'abc123', 100000000, false, now() + interval '10 minutes', null);
insert into public.jobs (workspace_id, kind, payload) values ('10000000-0000-0000-0000-00000000000a', 'entry.arm', '{}');

do $$ begin
  assert (select count(*) from public.workspace_members) = 2, 'owner memberships missing';
  assert (select rev from public.strategies where name = 'A1') = 1;
end $$;

-- ---------------- settings validation ----------------
select pg_temp.expect_error($$update public.strategies set settings = '{"max_concurrent_positions":50}' where name='A1'$$, 'max_concurrent_positions > 20');
select pg_temp.expect_error($$update public.strategies set settings = '{"score_threshold":10}' where name='A1'$$, 'score_threshold < 50');
select pg_temp.expect_error($$update public.strategies set settings = '{"bankroll_lamports":"1000000000","ticket_lamports":"2000000000"}' where name='A1'$$, 'ticket > bankroll');
select pg_temp.expect_error($$update public.strategies set settings = '{"ticket_lamports":0.25}' where name='A1'$$, 'lamports as float');
select pg_temp.expect_error($$update public.strategies set settings = '{"bogus_key":1}' where name='A1'$$, 'unknown key');
select pg_temp.expect_error($$update public.strategies set settings = '{"exit_preset":"yolo"}' where name='A1'$$, 'unknown exit preset');
select pg_temp.expect_error($$update public.strategies set settings = '{"maxOpen":3}' where name='A1'$$, 'v1.0 camelCase key rejected');
select pg_temp.expect_error($$update public.strategies set settings = '{"exit_preset":"ladder"}' where name='A1'$$, 'v1.0 preset id rejected');
select pg_temp.expect_error($$update public.strategies set settings = '{"peak_trail_pct":3}' where name='A1'$$, 'peak_trail_pct 3');
select pg_temp.expect_error($$update public.strategies set settings = '{"venues":["moon"]}' where name='A1'$$, 'bad venue');
select pg_temp.expect_error($$update public.strategies set settings = '{"entry_weekdays_utc":[7]}' where name='A1'$$, 'bad weekday');
select pg_temp.expect_error($$update public.strategies set settings = '{"profit_targets":[{"at_gain_pct":10}]}' where name='A1'$$, 'target missing sell_portion_pct');
select pg_temp.expect_error($$update public.strategies set settings = '{"approval_mode":"yolo"}' where name='A1'$$, 'bad approval_mode');
select pg_temp.expect_error($$update public.strategies set settings = '{"sell_floors":{"max_loss_pct":150}}' where name='A1'$$, 'sell_floors range');
select pg_temp.expect_error($$update public.strategies set settings = '{"sell_floors":{"foo":1}}' where name='A1'$$, 'sell_floors unknown key');
select pg_temp.expect_error($$update public.strategies set settings = '"x"' where name='A1'$$, 'settings not object');
update public.strategies set settings = settings || '{"max_concurrent_positions":5}' where name = 'A1';
do $$ begin assert (select rev from public.strategies where name = 'A1') = 2, 'rev not bumped'; end $$;

-- ---------------- paper-only invariants ----------------
select pg_temp.expect_error($$update public.workspaces set mode = 'real'$$, 'workspace live mode');
select pg_temp.expect_error($$insert into public.strategies (workspace_id, name, mode) values ('10000000-0000-0000-0000-00000000000a','x','real')$$, 'strategy live mode');
select pg_temp.expect_error($$insert into public.wallets (workspace_id, pubkey, is_active) values ('10000000-0000-0000-0000-00000000000a','7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', true)$$, 'active wallet');
select pg_temp.expect_error($$insert into public.guard_changes (workspace_id, strategy_id, mode, from_rev, diff, weakened_fields) values ('10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','real',1,'[]','{devPctFail}')$$, 'real guard weakening disabled');

-- ---------------- positions, fills, exit stats ----------------
insert into public.positions (id, position_key, pick_id, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports)
  select '40000000-0000-0000-0000-00000000000a', 'abc123.0', id, strategy_id, workspace_id, mint, 1000000000, 250000000
    from public.picks where ck = 'abc123';
insert into public.fills (position_id, workspace_id, side, sol_lamports, token_amount_raw, exec_price_sol, swap_fee_lamports, network_fee_lamports)
  values ('40000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'buy', 250000000, 1000000000, 0.00025, 3125000, 25000);
select pg_temp.expect_error($$insert into public.fills (position_id, workspace_id, side, simulated, tx_sig, sol_lamports, token_amount_raw, exec_price_sol) values ('40000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','buy',false,'sig',1,1,1)$$, 'real fill');
select pg_temp.expect_error($$update public.positions set status = 'closed', closed_at = now() where position_key = 'abc123.0'$$, 'close without exit_reason');
update public.positions set status = 'closed', closed_at = opened_at + interval '90 seconds', sol_out_lamports = 300000000, exit_reason = 'profit_target'
 where position_key = 'abc123.0';
do $$ declare r record; begin
  select * into r from public.exit_stats('10000000-0000-0000-0000-00000000000a');
  assert r.exit_reason = 'profit_target' and r.count = 1 and r.win_rate_pct = 100 and r.pnl_lamports = '50000000' and r.avg_hold_s = 90,
    format('exit_stats wrong: %s', r);
end $$;

-- ---------------- append-only ----------------
select pg_temp.expect_error($$update public.events set payload = '{}'$$, 'update event');
select pg_temp.expect_error($$delete from public.events$$, 'delete event');
select pg_temp.expect_error($$truncate public.events$$, 'truncate events');
select pg_temp.expect_error($$update public.fills set sol_lamports = 9$$, 'update fill');
select pg_temp.expect_error($$insert into public.events (id, workspace_id, ts, type, actor) values ('bad id','10000000-0000-0000-0000-00000000000a',now(),'system.notice','system')$$, 'bad event id');
select pg_temp.expect_error($$insert into public.events (id, workspace_id, ts, type, actor, payload) values ('p1:1:proposal.expired','10000000-0000-0000-0000-00000000000a',now(),'proposal.expired','system','{"reason":"bored","proposal_id":"x","at":"y"}')$$, 'bad expire reason');

-- ---------------- portfolio snapshots (single source of truth) ----------------
insert into public.portfolio_snapshots (workspace_id, cash_lamports, positions_cost_lamports, positions_value_lamports,
  equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq)
values ('10000000-0000-0000-0000-00000000000a', 29750000000, 250000000, 200000000, 29950000000, 30000000000, 16, 0, -50000000, 1, 1);
select pg_temp.expect_error($$insert into public.portfolio_snapshots (workspace_id, cash_lamports, positions_cost_lamports, positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq) values ('10000000-0000-0000-0000-00000000000a', 1, 0, 0, 2, 2, 0, 0, 0, 0, 1)$$, 'inconsistent equity');
do $$ begin
  assert (select equity_lamports from public.workspace_equity_latest where workspace_id = '10000000-0000-0000-0000-00000000000a') = 29950000000;
end $$;

-- ---------------- approvals: rev, transitions, retire_strategy, timeout ----------------
select pg_temp.expect_error($$update public.approvals set status = 'approved', decision = 'approve', decided_at = now() where id = '30000000-0000-0000-0000-00000000000a'$$, 'stale rev');
update public.approvals set status = 'approved', decision = 'approve', decided_at = now(), rev = rev + 1,
       decided_by = '00000000-0000-0000-0000-00000000000a' where id = '30000000-0000-0000-0000-00000000000a';
select pg_temp.expect_error($$update public.approvals set status = 'rejected', decision = 'reject', rev = rev + 1 where id = '30000000-0000-0000-0000-00000000000a'$$, 'approved -> rejected');
select pg_temp.expect_error($$update public.approvals set expires_at = now() + interval '9 days', rev = rev + 1 where id = '30000000-0000-0000-0000-00000000000b'$$, 'client-moved expires_at');

-- delete A2: both of its open proposals expire atomically + events emitted
do $$ declare n int; begin
  n := public.retire_strategy('20000000-0000-0000-0000-00000000000c', 'delete', '00000000-0000-0000-0000-00000000000a');
  assert n = 2, format('expected 2 expired, got %s', n);
  assert (select count(*) from public.approvals where strategy_id = '20000000-0000-0000-0000-00000000000c'
            and status = 'expired' and expire_reason = 'strategy_deleted') = 2;
  assert (select count(*) from public.events where type = 'proposal.expired' and payload ->> 'reason' = 'strategy_deleted'
            and payload ? 'at' and payload ? 'proposal_id') = 2;
  assert (select count(*) from public.events where type = 'strategy.deleted') = 1;
  assert (select status from public.strategies where id = '20000000-0000-0000-0000-00000000000c') = 'deleted';
  assert (select count(*) from public.audit_log where action = 'strategy.delete' and target_type = 'strategy'
            and before ->> 'status' = 'running' and server_now is not null) = 1;
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

-- ---------------- decision tokens (backend issues; plaintext returned once) ----------------
create temp table tok as select * from public.issue_approval_token('30000000-0000-0000-0000-00000000000e',
  '00000000-0000-0000-0000-00000000000a', 'web');
grant select on tok to authenticated;
do $$ begin
  assert (select token from tok) ~ '^apt_[A-Za-z0-9_-]{22}$', 'token is 128-bit base64url';
  assert (select count(*) from public.approval_tokens where approval_id = '30000000-0000-0000-0000-00000000000e') = 1;
  assert (select expires_at from public.approval_tokens) <= (select expires_at from public.approvals where id = '30000000-0000-0000-0000-00000000000e'),
    'token TTL must not exceed approval expires_at';
  assert not exists (select 1 from public.approval_tokens t, tok where t.token_hash = convert_to(tok.token, 'UTF8')), 'plaintext stored';
end $$;
select pg_temp.expect_error($$select public.issue_approval_token('30000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-00000000000b','web')$$, 'token for non-member');

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
select pg_temp.expect_error($$update public.approvals set status = 'rejected', rev = rev + 1 where id = '30000000-0000-0000-0000-00000000000b'$$, 'client decides approval directly');
select pg_temp.expect_error($$delete from public.strategies$$, 'client hard delete strategy');
select pg_temp.expect_error($$select * from public.siws_nonces$$, 'client reads nonces');
select pg_temp.expect_error($$select * from public.email_otps$$, 'client reads otp hashes');
select pg_temp.expect_error($$select * from public.approval_tokens$$, 'client reads token hashes');
select pg_temp.expect_error($$select public.issue_approval_token('30000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-00000000000a','web')$$, 'client mints token');
-- decide_approval (same path as REST + Flutter RPC)
select pg_temp.expect_error($$select public.decide_approval('30000000-0000-0000-0000-00000000000e','apt_wrong','approve',1)$$, 'bad token');
select pg_temp.expect_error($$select public.decide_approval('30000000-0000-0000-0000-00000000000e',(select token from tok),'approve',7)$$, 'stale expected_rev');
do $$ declare r jsonb; r2 jsonb; begin
  r := public.decide_approval('30000000-0000-0000-0000-00000000000e', (select token from tok), 'approve', 1, 'idem-key-0001');
  assert r ->> 'status' = 'approved' and (r ->> 'rev')::int = 2 and not (r ->> 'replayed')::boolean and r ? 'server_now', format('decide %s', r);
  r2 := public.decide_approval('30000000-0000-0000-0000-00000000000e', (select token from tok), 'approve', 1);
  assert (r2 ->> 'replayed')::boolean and (r2 ->> 'rev')::int = 2, format('replay %s', r2);
  assert (select count(*) from public.events where type = 'proposal.approved') = 1, 'one approved event only';
end $$;
select pg_temp.expect_error($$select public.decide_approval('30000000-0000-0000-0000-00000000000e',(select token from tok),'reject',2)$$, 'conflicting decision same token');
-- mode gate: practice visible, nothing real can exist
do $$ begin assert public.mode_visible('practice') and not public.mode_visible('real'), 'real needs trade:real'; end $$;

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
do $$ begin
  update public.strategies set name = 'hacked';
  raise exception 'direct strategy UPDATE must be revoked (writes go through update_strategy)';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  assert (select name from public.strategies where id = '20000000-0000-0000-0000-00000000000a') = 'A1', 'B modified A';
end $$;

-- proof-of-confirmation challenge: single use, bound to action/target/payload hash
do $$
declare u uuid := (select id from public.users order by id limit 1); c uuid; ok boolean;
begin
  insert into public.confirmation_challenges (user_id, action, target, payload_hash, challenge)
  values (u, 'guard.weaken', 'strategy:x', digest('diff', 'sha256'), gen_random_bytes(32)) returning id into c;
  begin perform public.consume_confirmation_challenge(c, u, 'guard.weaken', 'strategy:x', digest('other', 'sha256'));
    ok := false; exception when sqlstate 'P0403' then ok := true; end;
  assert ok, 'swapped payload hash must be rejected';
  assert length(public.consume_confirmation_challenge(c, u, 'guard.weaken', 'strategy:x', digest('diff', 'sha256'))) = 32, 'consume';
  begin perform public.consume_confirmation_challenge(c, u, 'guard.weaken', 'strategy:x', digest('diff', 'sha256'));
    ok := false; exception when sqlstate 'P0403' then ok := true; end;
  assert ok, 'challenge must be single use';
end $$;

\echo 'ALL SQL SMOKE TESTS PASSED'
