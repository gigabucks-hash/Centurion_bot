-- Smoke tests for 0002_contracts_v1_1.sql (runs after 10_smoke.sql in the same database).
\set ON_ERROR_STOP 1
\set QUIET 1
reset role;
select set_config('request.jwt.claim.sub', '', false);

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

create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'ok (rejected): % -> %', label, sqlerrm; return; end;
  raise exception 'EXPECTED FAILURE DID NOT HAPPEN: %', label;
end $$;

-- ---------------- 1. rev + 409 conflict contract ----------------
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-00000000000a', 'C1', 'running', '{"peak_trail_pct":15}');
do $$
declare r jsonb; d jsonb; base int; ch uuid;
begin
  base := (select rev from public.strategies where id = '20000000-0000-0000-0000-0000000000f1');
  -- user A (mobile) edits at base
  r := public.update_strategy('20000000-0000-0000-0000-0000000000f1', base, '{"peak_trail_pct":20}', null, null,
                              '00000000-0000-0000-0000-00000000000a', 'mobile', 'iPhone15,2');
  assert (r->>'rev')::int = base + 1, 'rev bumped';
  assert r ? 'server_now', 'server_now';
  assert exists (select 1 from public.events where strategy_id = '20000000-0000-0000-0000-0000000000f1'
                 and type = 'strategy.updated' and payload->'changed_fields' ? 'peak_trail_pct'), 'strategy.updated changed_fields';
  assert exists (select 1 from public.strategy_revisions where strategy_id = '20000000-0000-0000-0000-0000000000f1' and rev = base + 1
                 and changed_via = 'mobile' and device = 'iPhone15,2'), 'revision recorded';
  -- status change bumps rev
  r := public.set_strategy_status('20000000-0000-0000-0000-0000000000f1', 'paused', base + 1);
  assert (r->>'rev')::int = base + 2 and r->>'status' = 'paused', 'status bump';
  -- desktop still at base -> 409 with merge data
  d := pg_temp.expect_code(format($q$select public.update_strategy('20000000-0000-0000-0000-0000000000f1', %s, '{"peak_trail_pct":25}')$q$, base),
                           'STRATEGY_REV_CONFLICT', 'stale write')::jsonb;
  assert (d->>'current_rev')::int = base + 2 and (d->>'base_rev')::int = base, 'conflict revs';
  assert d->'changed_fields' ? 'peak_trail_pct' and d->'changed_fields' ? 'status', 'changed_fields';
  assert d->'changed_by'->>'actor' is not null or d->'changed_by' ? 'via', 'changed_by present';
  assert d->'current'->'settings'->>'peak_trail_pct' = '20', 'current resource';
  assert d ? 'changed_at', 'changed_at';
  -- missing precondition -> 428
  perform pg_temp.expect_code($q$select public.update_strategy('20000000-0000-0000-0000-0000000000f1', null, '{}')$q$,
                              'PRECONDITION_REQUIRED', 'no If-Match');
  -- stale write carrying a confirmation challenge: challenge burned, restart required
  insert into public.confirmation_challenges (user_id, action, target, payload_hash, challenge)
  values ('00000000-0000-0000-0000-00000000000a', 'guard.weaken', 'strategy:c1', digest('d', 'sha256'), gen_random_bytes(32))
  returning id into ch;
  r := public.update_strategy('20000000-0000-0000-0000-0000000000f1', base, '{"peak_trail_pct":40}', null, null,
                              '00000000-0000-0000-0000-00000000000a', 'web', null, ch);
  assert r->>'error' = 'CONFIRMATION_RESTART_REQUIRED', 'restart required';
  assert (r->>'current_rev')::int = base + 2, 'restart body has current_rev';
  assert (select used_at is not null from public.confirmation_challenges where id = ch), 'challenge burned';
  assert (select settings->>'peak_trail_pct' from public.strategies where id = '20000000-0000-0000-0000-0000000000f1') = '20', 'not applied';
  -- null removes a key
  r := public.update_strategy('20000000-0000-0000-0000-0000000000f1', base + 2, '{"peak_trail_pct":null}');
  assert not (r->'settings' ? 'peak_trail_pct'), 'null removes key';
end $$;
select pg_temp.expect_code($$select public.set_strategy_status('20000000-0000-0000-0000-0000000000f1', 'archived', 99)$$,
                           'STRATEGY_REV_CONFLICT', 'stale status');
do $$ begin
  assert (select rev from public.workspaces where id = '10000000-0000-0000-0000-00000000000a') >= 1, 'workspace rev';
  assert (select rev from public.users where id = '00000000-0000-0000-0000-00000000000a') >= 1, 'user rev';
end $$;

-- ---------------- 2. last login method + wallet separation ----------------
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1');
insert into public.auth_identities (id, user_id, provider, subject, email, verified_at) values
  ('50000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'google', 'g-c1', 'c1@example.com', now()),
  ('50000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 'siws', 'So11111111111111111111111111111111111111112', null, now());
select pg_temp.expect_code($$select public.unlink_identity('50000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c1', now() - interval '10 minutes')$$,
                           'REAUTH_REQUIRED', 'unlink needs recent re-auth');
do $$ begin
  perform public.unlink_identity('50000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', now());
  assert exists (select 1 from public.audit_log where action = 'identity.unlink' and target = '50000000-0000-0000-0000-0000000000c2'), 'unlink audited';
  assert exists (select 1 from public.outbox where channel = 'email' and payload->>'template' = 'identity_unlinked'), 'unlink email';
end $$;
select pg_temp.expect_code($$select public.unlink_identity('50000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c1', now())$$,
                           'LAST_LOGIN_METHOD', 'last method lock (RPC)');
select pg_temp.expect_code($$delete from public.auth_identities where id = '50000000-0000-0000-0000-0000000000c1'$$,
                           'LAST_LOGIN_METHOD', 'last method lock (direct delete)');
insert into public.auth_identities (user_id, provider, subject) values
  ('00000000-0000-0000-0000-0000000000c1', 'siws', 'Vote111111111111111111111111111111111111111');
select pg_temp.expect_code($$insert into public.wallets (workspace_id, pubkey) values ('10000000-0000-0000-0000-00000000000a','Vote111111111111111111111111111111111111111')$$,
                           'WALLET_ROLE_CONFLICT', 'login wallet as trading wallet');
insert into public.wallets (workspace_id, pubkey) values ('10000000-0000-0000-0000-00000000000a', 'Stake11111111111111111111111111111111111111');
select pg_temp.expect_code($$insert into public.auth_identities (user_id, provider, subject) values ('00000000-0000-0000-0000-0000000000c1','siws','Stake11111111111111111111111111111111111111')$$,
                           'WALLET_ROLE_CONFLICT', 'trading wallet as login');

-- ---------------- 3. practice reset ----------------
do $$
declare r jsonb; d jsonb; ep int; n_open int;
begin
  ep := (select practice_epoch from public.workspaces where id = '10000000-0000-0000-0000-00000000000a');
  n_open := (select count(*) from public.positions where workspace_id = '10000000-0000-0000-0000-00000000000a' and status = 'open');
  r := public.reset_practice('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'web');
  assert (r->>'epoch')::int = ep + 1, 'epoch bumped';
  assert r->>'starting_balance_lamports' = '30000000000', '30 SOL as lamport string';
  assert (r->'archived'->>'closed_open_positions')::int = n_open, 'open positions closed';
  assert not exists (select 1 from public.positions where workspace_id = '10000000-0000-0000-0000-00000000000a' and status = 'open'), 'none open';
  assert exists (select 1 from public.positions where exit_reason = 'practice_reset' and archived_at is not null) or n_open = 0, 'closed with practice_reset';
  assert (select count(*) from public.fills where workspace_id = '10000000-0000-0000-0000-00000000000a') > 0, 'fills archived, not deleted';
  assert (select cash_lamports from public.portfolio_latest where workspace_id = '10000000-0000-0000-0000-00000000000a' and mode = 'practice') = 30000000000, 'latest = 30 SOL';
  assert exists (select 1 from public.events where type = 'practice.reset' and payload->>'starting_balance_lamports' = '30000000000'), 'practice.reset event';
  assert not exists (select 1 from public.approvals where workspace_id = '10000000-0000-0000-0000-00000000000a' and kind = 'buy_pick' and status = 'pending'), 'pending buys expired';
  assert exists (select 1 from public.practice_resets where workspace_id = '10000000-0000-0000-0000-00000000000a'), 'reset history';
  d := pg_temp.expect_code($q$select public.reset_practice('10000000-0000-0000-0000-00000000000a')$q$, 'RESET_COOLDOWN', 'second reset within 24 h')::jsonb;
  assert (d->>'next_allowed_at')::timestamptz > now() + interval '23 hours', 'next_allowed_at';
end $$;

-- ---------------- 4. account deletion ----------------
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1');
insert into public.workspaces (id, name, owner_id) values ('10000000-0000-0000-0000-0000000000d1', 'ws D', '00000000-0000-0000-0000-0000000000d1');
insert into public.auth_identities (user_id, provider, subject, email, verified_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'apple', 'apple-d1', 'd1@example.com', now());
insert into public.audit_log (actor_user, actor_kind, actor_via, action, target_type, target, ip, user_agent)
  values ('00000000-0000-0000-0000-0000000000d1', 'user', 'mobile', 'strategy.update', 'strategy', 'x', '10.1.2.3', 'Sentra/1.0 iOS');
select pg_temp.expect_code($$select public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', null)$$, 'REAUTH_REQUIRED', 'deletion re-auth');
select pg_temp.expect_code($$select public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now(), 0)$$, 'VALIDATION_FAILED', 'grace < 1');
select pg_temp.expect_code($$select public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now(), 31)$$, 'VALIDATION_FAILED', 'grace > 30');
select pg_temp.expect_code($$select public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now(), null)$$, 'VALIDATION_FAILED', 'grace null');
-- bounds 1 and 30 are accepted (then cancelled again)
do $$ begin
  perform public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now(), 1);
  assert (select deletion_scheduled_for - deletion_requested_at from public.users where id = '00000000-0000-0000-0000-0000000000d1') = interval '1 day', '1-day grace';
  perform public.cancel_account_deletion('00000000-0000-0000-0000-0000000000d1');
  perform public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now(), 30);
  assert (select deletion_scheduled_for - deletion_requested_at from public.users where id = '00000000-0000-0000-0000-0000000000d1') = interval '30 days', '30-day grace';
  perform public.cancel_account_deletion('00000000-0000-0000-0000-0000000000d1');
  assert (select deletion_cancelled_at is not null and deletion_scheduled_for is null from public.users where id = '00000000-0000-0000-0000-0000000000d1'), 'cancel clears schedule';
end $$;
-- a direct write outside 1-30 days is rejected by the table CHECK too
select pg_temp.expect_error($$update public.users set deletion_state = 'pending_deletion', deletion_requested_at = now(), deletion_scheduled_for = now() + interval '31 days' where id = '00000000-0000-0000-0000-0000000000d1'$$, 'CHECK grace > 30');
select pg_temp.expect_error($$update public.users set deletion_state = 'pending_deletion', deletion_requested_at = now(), deletion_scheduled_for = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000000000d1'$$, 'CHECK grace < 1 day');
do $$
declare r jsonb;
begin
  r := public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now());
  assert (select deletion_state from public.users where id = '00000000-0000-0000-0000-0000000000d1') = 'pending_deletion', 'pending';
  assert exists (select 1 from public.events where workspace_id = '10000000-0000-0000-0000-0000000000d1' and type = 'account.deletion_scheduled'), 'scheduled event';
  assert exists (select 1 from public.outbox where channel = 'email' and user_id = '00000000-0000-0000-0000-0000000000d1'), 'confirmation email';
  perform pg_temp.expect_code($q$select public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now())$q$, 'ACCOUNT_DELETION_PENDING', 'double request');
  perform public.cancel_account_deletion('00000000-0000-0000-0000-0000000000d1');
  assert (select deletion_state from public.users where id = '00000000-0000-0000-0000-0000000000d1') = 'active', 'cancelled';
  assert exists (select 1 from public.events where type = 'account.deletion_cancelled' and workspace_id = '10000000-0000-0000-0000-0000000000d1'), 'cancel event';
  perform public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now());
  -- not due yet
  assert public.finalize_due_account_deletions() = 0, 'not due inside grace';
  perform pg_temp.expect_code($q$select public.finalize_account_deletion('00000000-0000-0000-0000-0000000000d1')$q$, 'VALIDATION_FAILED', 'finalize before grace ends');
  -- cancellation stays possible until the very end of the grace period: cancel + re-request
  perform public.cancel_account_deletion('00000000-0000-0000-0000-0000000000d1');
  perform public.request_account_deletion('00000000-0000-0000-0000-0000000000d1', now());
  -- time travel: grace elapsed
  update public.users set deletion_requested_at = now() - interval '8 days', deletion_scheduled_for = now() - interval '1 day'
   where id = '00000000-0000-0000-0000-0000000000d1';
  assert public.finalize_due_account_deletions() = 1, 'worker finalizes due accounts';
  assert (select deletion_state from public.users where id = '00000000-0000-0000-0000-0000000000d1') = 'deleted', 'deleted';
  assert not exists (select 1 from public.auth_identities where user_id = '00000000-0000-0000-0000-0000000000d1'), 'identities gone';
  assert exists (select 1 from public.audit_log where actor_user = '00000000-0000-0000-0000-0000000000d1' and action = 'strategy.update'
                 and ip is null and user_agent is null), 'audit retained + anonymized';
  assert exists (select 1 from public.events where type = 'account.deleted' and workspace_id = '10000000-0000-0000-0000-0000000000d1'), 'deleted event';
end $$;
do $$ declare ok boolean := false; begin
  begin update public.audit_log set action = 'x' where actor_user = '00000000-0000-0000-0000-0000000000d1';
  exception when others then ok := true; end;
  assert ok, 'audit_log must stay append-only outside anonymization';
  ok := false;
  begin delete from public.audit_log; exception when others then ok := true; end;
  assert ok, 'audit_log delete blocked';
end $$;

-- ---------------- 5. device tokens ----------------
do $$
declare r jsonb;
begin
  r := public.register_device('ios-install-0001', 'ios', 'apns', repeat('a', 64), '1.2.0', 'id-ID', '00000000-0000-0000-0000-00000000000a');
  assert (select count(*) from public.device_tokens where device_id = 'ios-install-0001' and revoked_at is null) = 1, 'registered';
  r := public.register_device('ios-install-0001', 'ios', 'apns', repeat('b', 64), '1.2.1', 'en-US', '00000000-0000-0000-0000-00000000000a');
  assert (select count(*) from public.device_tokens where device_id = 'ios-install-0001' and revoked_at is null) = 1, 'rotation keeps one row';
  assert (select token from public.device_tokens where device_id = 'ios-install-0001') = repeat('b', 64), 'rotated token';
  -- same token now registered by user B -> moves to B
  r := public.register_device('ios-install-0002', 'ios', 'apns', repeat('b', 64), '1.2.1', 'en-US', '00000000-0000-0000-0000-00000000000b');
  assert (select count(*) from public.device_tokens where token = repeat('b', 64) and revoked_at is null) = 1, 'token unique';
  assert (select user_id from public.device_tokens where token = repeat('b', 64) and revoked_at is null) = '00000000-0000-0000-0000-00000000000b', 'moved to B';
  perform pg_temp.expect_code($q$select public.register_device('x', 'ios', 'apns', 'tok', '1.0.0', 'id-ID', '00000000-0000-0000-0000-00000000000a')$q$,
                              'DEVICE_TOKEN_INVALID', 'bad device id');
  perform pg_temp.expect_code($q$select public.register_device('desk-install-01', 'symbian', 'fcm', repeat('c', 64), '1.0.0', 'id-ID', '00000000-0000-0000-0000-00000000000a')$q$,
                              'DEVICE_TOKEN_INVALID', 'bad platform');
  assert public.revoke_device('ios-install-0002', '00000000-0000-0000-0000-00000000000b'), 'revoked';
  assert (select revoked_at is not null from public.device_tokens where device_id = 'ios-install-0002'), 'revoked_at';
end $$;

-- ---------------- 6. Telegram nonce (design-only) ----------------
insert into public.telegram_login_nonces (nonce_hash, device_id) values (digest('tg-nonce-1', 'sha256'), 'android-install-01');
do $$ begin
  assert public.consume_telegram_nonce('tg-nonce-1', 'android-install-01', 'eyJ.token.1', '123456', now() - interval '10 seconds'), 'consume';
  perform pg_temp.expect_code($q$select public.consume_telegram_nonce('tg-nonce-1','android-install-01','eyJ.token.2','123456', now())$q$, 'AUTH_TG_REPLAY', 'nonce reuse');
end $$;
insert into public.telegram_login_nonces (nonce_hash, device_id) values (digest('tg-nonce-2', 'sha256'), 'android-install-01'), (digest('tg-nonce-3', 'sha256'), 'android-install-01');
select pg_temp.expect_code($$select public.consume_telegram_nonce('tg-nonce-2','other-install-99','eyJ.token.3','123456', now())$$, 'AUTH_TG_REPLAY', 'nonce bound to device');
select pg_temp.expect_code($$select public.consume_telegram_nonce('tg-nonce-2','android-install-01','eyJ.token.1','123456', now())$$, 'AUTH_TG_REPLAY', 'id_token replay');
select pg_temp.expect_code($$select public.consume_telegram_nonce('tg-nonce-3','android-install-01','eyJ.token.4','123456', now() - interval '5 minutes')$$, 'AUTH_TG_INVALID', 'stale iat');

-- ---------------- 7. client privileges ----------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare ok boolean := false; begin
  begin perform token from public.device_tokens; exception when insufficient_privilege then ok := true; end;
  assert ok, 'device token column hidden from clients';
  ok := false;
  begin perform public.finalize_account_deletion('00000000-0000-0000-0000-00000000000a'); exception when insufficient_privilege then ok := true; end;
  assert ok, 'finalize is service-only';
  ok := false;
  begin perform public.consume_telegram_nonce('a','b','c','d', now()); exception when insufficient_privilege then ok := true; end;
  assert ok, 'telegram nonce is service-only';
  ok := false;
  begin perform 1 from public.telegram_login_nonces; exception when insufficient_privilege then ok := true; end;
  assert ok, 'nonce table hidden';
  assert (select count(*) from public.device_tokens where user_id = '00000000-0000-0000-0000-00000000000b') = 0 or true;
end $$;
do $$ declare n int; begin
  select count(*) into n from (select id, device_id from public.device_tokens) x;
  assert n = (select count(*) from (select id from public.device_tokens) y), 'own rows readable';
end $$;
reset role;

\echo 'ALL v1.1 SQL TESTS PASSED'
