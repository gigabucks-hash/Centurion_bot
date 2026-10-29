-- Sentra contracts v1.1 (2026-10-29)
--   * rev on every mutable resource + 409 conflict detail + confirmation restart
--   * strategy revision history (3-way merge base for the UX conflict flow)
--   * last-login-method lock, login wallet != trading wallet
--   * practice reset (epoch archive, 30 SOL, 1 per 24 h)
--   * account deletion (request -> re-auth -> grace -> anonymize), audit_log actor anonymization
--   * device push tokens
-- Error convention: raise SQLSTATE P0<http> with MESSAGE = shared error code (packages/contracts/errors.json)
-- and DETAIL = JSON object (the API copies it into error.details / the 409 body).

-- outbox: also carries user-scoped deliveries (account / login-method emails) without an event row
alter table public.outbox alter column event_seq drop not null, alter column workspace_id drop not null,
  add column user_id uuid references public.users (id) on delete cascade,
  add column payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  add constraint outbox_scope check (event_seq is not null or user_id is not null);

-- ---------------------------------------------------------------------------
-- 1. rev everywhere
-- ---------------------------------------------------------------------------
create or replace function public.bump_rev()
returns trigger language plpgsql as $$
begin
  if to_jsonb(new) - 'rev' - 'updated_at' is distinct from to_jsonb(old) - 'rev' - 'updated_at' then
    new.rev := old.rev + 1;
  else
    new.rev := old.rev;
  end if;
  return new;
end $$;

alter table public.workspaces        add column rev integer not null default 1 check (rev >= 1);
alter table public.portfolios        add column rev integer not null default 1 check (rev >= 1);
alter table public.guard_changes     add column rev integer not null default 1 check (rev >= 1);
alter table public.wallets           add column rev integer not null default 1 check (rev >= 1);
alter table public.workspace_members add column rev integer not null default 1 check (rev >= 1);
alter table public.users             add column rev integer not null default 1 check (rev >= 1);
create trigger workspaces_bump_rev before update on public.workspaces for each row execute function public.bump_rev();
create trigger portfolios_bump_rev before update on public.portfolios for each row execute function public.bump_rev();
create trigger guard_changes_bump_rev before update on public.guard_changes for each row execute function public.bump_rev();
create trigger wallets_bump_rev before update on public.wallets for each row execute function public.bump_rev();
create trigger members_bump_rev before update on public.workspace_members for each row execute function public.bump_rev();
create trigger users_bump_rev before update on public.users for each row execute function public.bump_rev();

-- strategies: any user-visible change (settings, name, status) bumps rev
create or replace function public.strategies_bump_rev()
returns trigger language plpgsql as $$
begin
  if new.settings is distinct from old.settings or new.name is distinct from old.name
     or new.status is distinct from old.status then
    new.rev := old.rev + 1;
  else
    new.rev := old.rev;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Revision history: merge base for the 3-way conflict review (UX REVISION_CONFLICT S2)
create table public.strategy_revisions (
  strategy_id  uuid not null references public.strategies (id) on delete cascade,
  rev          integer not null,
  name         text not null,
  status       public.strategy_status not null,
  settings     jsonb not null,
  changed_by   uuid,
  changed_via  text,
  device       text check (length(device) <= 200),
  created_at   timestamptz not null default clock_timestamp(),
  primary key (strategy_id, rev)
);
create or replace function public.strategies_record_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.rev <> old.rev then
    insert into public.strategy_revisions (strategy_id, rev, name, status, settings, changed_by, changed_via, device)
    values (new.id, new.rev, new.name, new.status, new.settings,
            nullif(current_setting('sentra.actor', true), '')::uuid,
            nullif(current_setting('sentra.via', true), ''),
            nullif(current_setting('sentra.device', true), ''))
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger strategies_record_revision after insert or update on public.strategies
  for each row execute function public.strategies_record_revision();
insert into public.strategy_revisions (strategy_id, rev, name, status, settings)
  select id, rev, name, status, settings from public.strategies on conflict do nothing;

-- top-level keys whose value differs between two objects
create or replace function public.jsonb_changed_keys(a jsonb, b jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}')
    from (select jsonb_object_keys(coalesce(a, '{}')) k union select jsonb_object_keys(coalesce(b, '{}'))) ks
   where coalesce(a, '{}') -> k is distinct from coalesce(b, '{}') -> k
$$;

-- 409 body for a stale strategy write: {current_rev, changed_fields, changed_by, changed_at, current}
create or replace function public.strategy_conflict_detail(s public.strategies, p_base_rev integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'current_rev', s.rev,
    'base_rev', p_base_rev,
    'changed_fields', to_jsonb(
        public.jsonb_changed_keys(b.settings, s.settings)
        || case when b.name is distinct from s.name then array['name'] else '{}' end
        || case when b.status is distinct from s.status then array['status'] else '{}' end),
    'changed_by', jsonb_build_object('actor', l.changed_by, 'via', l.changed_via, 'device', l.device),
    'changed_at', to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'current', jsonb_build_object('id', s.id, 'rev', s.rev, 'name', s.name, 'status', s.status,
                                  'mode', s.mode, 'settings', s.settings))
  from (select 1) one
  left join public.strategy_revisions b on b.strategy_id = s.id and b.rev = p_base_rev
  left join public.strategy_revisions l on l.strategy_id = s.id and l.rev = s.rev
$$;

-- The only write path for strategies (REST PATCH and Flutter RPC). Optimistic: p_expected_rev required.
-- p_challenge_id: confirmation challenge already issued for this write (Real guard weakening). A stale
-- write burns it and returns CONFIRMATION_RESTART_REQUIRED: the full confirmation must be redone.
create or replace function public.update_strategy(
  p_strategy uuid, p_expected_rev integer, p_patch jsonb default null, p_name text default null,
  p_status public.strategy_status default null, p_actor uuid default null, p_via text default 'api',
  p_device text default null, p_challenge_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.strategies;
  v_actor uuid := coalesce(auth.uid(), p_actor);
  v_settings jsonb;
begin
  if p_expected_rev is null then
    raise exception using errcode = 'P0428', message = 'PRECONDITION_REQUIRED',
      detail = '{"hint":"send If-Match: <rev> or expected_rev"}';
  end if;
  select * into s from public.strategies where id = p_strategy and status <> 'deleted' for update;
  if not found then
    raise exception using errcode = 'P0404', message = 'NOT_FOUND';
  end if;
  if auth.uid() is not null
     and not public.has_workspace_role(s.workspace_id, array['owner', 'admin', 'trader']::public.workspace_role[]) then
    raise exception using errcode = 'P0403', message = 'FORBIDDEN_ROLE';
  end if;
  if s.status = 'archived' then
    raise exception using errcode = 'P0409', message = 'STRATEGY_RETIRED';
  end if;
  if s.rev <> p_expected_rev then
    if p_challenge_id is not null then
      -- burn the challenge and RETURN (not raise): raising would roll the burn back.
      -- The API maps {"error":"CONFIRMATION_RESTART_REQUIRED"} to HTTP 409 with the same body as a conflict.
      update public.confirmation_challenges set used_at = coalesce(used_at, now()) where id = p_challenge_id;
      return jsonb_build_object('error', 'CONFIRMATION_RESTART_REQUIRED', 'server_now', now())
             || public.strategy_conflict_detail(s, p_expected_rev);
    end if;
    raise exception using errcode = 'P0409', message = 'STRATEGY_REV_CONFLICT',
      detail = public.strategy_conflict_detail(s, p_expected_rev)::text;
  end if;
  if p_status is not null and p_status not in ('draft', 'running', 'paused') then
    raise exception using errcode = 'P0422', message = 'VALIDATION_FAILED',
      detail = '{"field":"status","hint":"archive/delete use retire_strategy"}';
  end if;
  -- merge patch: a JSON null removes the key
  v_settings := s.settings;
  if p_patch is not null then
    v_settings := (v_settings || p_patch) - array(select k from jsonb_each(p_patch) e(k, v) where v = 'null'::jsonb);
  end if;
  perform set_config('sentra.actor', coalesce(v_actor::text, ''), true);
  perform set_config('sentra.via', coalesce(p_via, ''), true);
  perform set_config('sentra.device', coalesce(p_device, ''), true);
  update public.strategies
     set settings = v_settings, name = coalesce(p_name, name), status = coalesce(p_status, status)
   where id = p_strategy
  returning * into s;
  if s.rev <> p_expected_rev then
    insert into public.events (id, workspace_id, strategy_id, ts, type, actor, payload)
    values (s.id::text || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint || ':strategy.updated',
            s.workspace_id, s.id, clock_timestamp(), 'strategy.updated',
            (case when v_actor is null then 'system' else 'user' end)::public.event_actor,
            jsonb_build_object('rev', s.rev, 'base_rev', p_expected_rev, 'status', s.status,
                               'changed_fields', public.jsonb_changed_keys(
                                  (select settings from public.strategy_revisions where strategy_id = s.id and rev = p_expected_rev),
                                  s.settings)));
  end if;
  return jsonb_build_object('id', s.id, 'rev', s.rev, 'name', s.name, 'status', s.status, 'mode', s.mode,
                            'settings', s.settings, 'server_now', now());
end $$;

-- Flutter: set_strategy_status(strategy_id, status, expected_rev)
create or replace function public.set_strategy_status(p_strategy uuid, p_status text, p_expected_rev integer)
returns jsonb language sql security definer set search_path = public as $$
  select public.update_strategy(p_strategy, p_expected_rev, null, null, p_status::public.strategy_status,
                                null, 'mobile', null, null)
$$;

-- direct UPDATE from clients would bypass expected_rev: writes go through update_strategy only
drop policy if exists strat_update on public.strategies;
revoke update on public.strategies from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Login methods: last-method lock, login wallet != trading wallet
-- ---------------------------------------------------------------------------
create or replace function public.auth_identities_last_method_lock()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('sentra.account_deletion', true), '') <> 'on'
     and not exists (select 1 from public.auth_identities where user_id = old.user_id and id <> old.id) then
    raise exception using errcode = 'P0422', message = 'LAST_LOGIN_METHOD',
      detail = jsonb_build_object('identity_id', old.id, 'provider', old.provider)::text;
  end if;
  return old;
end $$;
create trigger auth_identities_last_method_lock before delete on public.auth_identities
  for each row execute function public.auth_identities_last_method_lock();

-- Unlink: re-auth within 5 min, never the last one, audit + notification email to verified addresses.
create or replace function public.unlink_identity(p_identity uuid, p_user uuid, p_reauth_at timestamptz,
                                                  p_via text default 'api', p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i public.auth_identities;
begin
  if p_reauth_at is null or p_reauth_at < now() - interval '5 minutes' or p_reauth_at > now() + interval '5 seconds' then
    raise exception using errcode = 'P0401', message = 'REAUTH_REQUIRED';
  end if;
  delete from public.auth_identities where id = p_identity and user_id = p_user returning * into i;
  if not found then
    raise exception using errcode = 'P0404', message = 'NOT_FOUND';
  end if;
  insert into public.audit_log (actor_user, actor_kind, actor_via, action, target_type, target, before, ip)
  values (p_user, 'user', p_via, 'identity.unlink', 'auth_identity', i.id::text,
          jsonb_build_object('provider', i.provider), p_ip);
  insert into public.outbox (channel, user_id, payload)
  select 'email', p_user, jsonb_build_object('template', 'identity_unlinked', 'to', a.email, 'provider', i.provider)
    from public.auth_identities a where a.user_id = p_user and a.email is not null and a.verified_at is not null;
  return jsonb_build_object('unlinked', i.id, 'provider', i.provider, 'server_now', now());
end $$;

-- Trading wallet (custody reference) and login wallet (SIWS identity) are different roles: the same
-- address may never be both, and unlinking one never touches the other.
alter table public.wallets add column role text not null default 'trading' constraint wallets_trading_only check (role = 'trading');
create or replace function public.wallet_role_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'wallets' then
    if exists (select 1 from public.auth_identities where provider = 'siws' and subject = new.pubkey) then
      raise exception using errcode = 'P0409', message = 'WALLET_ROLE_CONFLICT',
        detail = '{"hint":"a login wallet cannot be used as a trading wallet"}';
    end if;
  elsif new.provider = 'siws' and exists (select 1 from public.wallets where pubkey = new.subject) then
    raise exception using errcode = 'P0409', message = 'WALLET_ROLE_CONFLICT',
      detail = '{"hint":"a trading wallet cannot be used to sign in"}';
  end if;
  return new;
end $$;
create trigger wallets_role_guard before insert or update of pubkey on public.wallets
  for each row execute function public.wallet_role_guard();
create trigger identities_wallet_role_guard before insert or update of subject, provider on public.auth_identities
  for each row execute function public.wallet_role_guard();

-- ---------------------------------------------------------------------------
-- 3. Practice reset: archive history by epoch, restore 30 SOL, at most once per 24 h
-- ---------------------------------------------------------------------------
alter table public.workspaces add column practice_epoch integer not null default 0 check (practice_epoch >= 0);
alter table public.workspaces alter column paper_start_lamports set default 30000000000;
alter table public.positions add column epoch integer not null default 0;
alter table public.positions add column archived_at timestamptz;
alter table public.fills add column epoch integer not null default 0;
alter table public.portfolio_snapshots add column epoch integer not null default 0;
create index positions_epoch_idx on public.positions (workspace_id, epoch);

create or replace function public.stamp_practice_epoch()
returns trigger language plpgsql as $$
begin
  select practice_epoch into new.epoch from public.workspaces where id = new.workspace_id;
  return new;
end $$;
create trigger positions_epoch before insert on public.positions for each row execute function public.stamp_practice_epoch();
create trigger fills_epoch before insert on public.fills for each row execute function public.stamp_practice_epoch();
create trigger snapshots_epoch before insert on public.portfolio_snapshots for each row execute function public.stamp_practice_epoch();

create table public.practice_resets (
  id                   bigint generated always as identity primary key,
  workspace_id         uuid not null references public.workspaces (id),
  from_epoch           integer not null,
  to_epoch             integer not null check (to_epoch = from_epoch + 1),
  starting_lamports    bigint not null check (starting_lamports > 0),
  actor_user           uuid,
  archived             jsonb not null,
  created_at           timestamptz not null default clock_timestamp()
);
create index practice_resets_ws_idx on public.practice_resets (workspace_id, created_at desc);

-- current-epoch views (archived history stays queryable with ?epoch=)
create or replace view public.workspace_equity_latest with (security_invoker = true) as
  select distinct on (s.workspace_id) s.*
    from public.portfolio_snapshots s
    join public.workspaces w on w.id = s.workspace_id and s.epoch = w.practice_epoch
   order by s.workspace_id, s.ts desc, s.id desc;
create or replace view public.portfolio_latest with (security_invoker = true) as
  select * from public.workspace_equity_latest;

create or replace function public.reset_practice(p_workspace uuid, p_actor uuid default null, p_via text default 'api')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  w public.workspaces;
  v_actor uuid := coalesce(auth.uid(), p_actor);
  last_at timestamptz;
  t timestamptz := clock_timestamp();
  n_open integer; n_pos integer; n_fills integer; n_snaps integer; n_exp integer := 0;
  r record;
  archived jsonb;
  next_at timestamptz := t + interval '24 hours';
begin
  select * into w from public.workspaces where id = p_workspace and deleted_at is null for update;
  if not found then
    raise exception using errcode = 'P0404', message = 'NOT_FOUND';
  end if;
  if auth.uid() is not null
     and not public.has_workspace_role(p_workspace, array['owner', 'admin', 'trader']::public.workspace_role[]) then
    raise exception using errcode = 'P0403', message = 'FORBIDDEN_ROLE';
  end if;
  if w.mode <> 'practice' then
    raise exception using errcode = 'P0403', message = 'MODE_NOT_ALLOWED';
  end if;
  select max(created_at) into last_at from public.practice_resets where workspace_id = p_workspace;
  if last_at is not null and last_at > t - interval '24 hours' then
    raise exception using errcode = 'P0429', message = 'RESET_COOLDOWN',
      detail = jsonb_build_object('next_allowed_at',
                 to_char((last_at + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                 'last_reset_at', to_char(last_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text;
  end if;

  -- pending buys of the old epoch can never execute
  for r in select a.id from public.approvals a
            where a.workspace_id = p_workspace and a.kind = 'buy_pick' and a.status in ('pending', 'approved')
            for update loop
    n_exp := n_exp + public.expire_proposal(r.id, 'practice_reset')::int;
  end loop;
  update public.positions set status = 'closed', closed_at = t, exit_reason = 'practice_reset'
   where workspace_id = p_workspace and status = 'open';
  get diagnostics n_open = row_count;
  update public.positions set archived_at = t where workspace_id = p_workspace and archived_at is null;
  get diagnostics n_pos = row_count;
  select count(*) into n_fills from public.fills where workspace_id = p_workspace and epoch = w.practice_epoch;
  select count(*) into n_snaps from public.portfolio_snapshots where workspace_id = p_workspace and epoch = w.practice_epoch;

  update public.workspaces set practice_epoch = practice_epoch + 1 where id = p_workspace;
  update public.strategies set first_buy_at = null where workspace_id = p_workspace and first_buy_at is not null;
  update public.portfolios set first_buy_at = null where workspace_id = p_workspace and first_buy_at is not null;

  insert into public.portfolio_snapshots (workspace_id, ts, cash_lamports, positions_cost_lamports,
      positions_value_lamports, equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports,
      unrealized_pnl_lamports, open_positions, as_of_seq)
  values (p_workspace, t, w.paper_start_lamports, 0, 0, w.paper_start_lamports, w.paper_start_lamports, 0, 0, 0, 0,
          coalesce((select max(seq) from public.events), 0));

  archived := jsonb_build_object('positions', n_pos, 'closed_open_positions', n_open, 'fills', n_fills,
                                 'snapshots', n_snaps, 'expired_proposals', n_exp);
  insert into public.practice_resets (workspace_id, from_epoch, to_epoch, starting_lamports, actor_user, archived, created_at)
  values (p_workspace, w.practice_epoch, w.practice_epoch + 1, w.paper_start_lamports, v_actor, archived, t);

  insert into public.events (id, workspace_id, ts, type, actor, payload)
  values (p_workspace::text || ':' || (extract(epoch from t) * 1000)::bigint || ':practice.reset',
          p_workspace, t, 'practice.reset', (case when v_actor is null then 'system' else 'user' end)::public.event_actor,
          jsonb_build_object('epoch', w.practice_epoch + 1, 'previous_epoch', w.practice_epoch,
                             'starting_balance_lamports', w.paper_start_lamports::text, 'archived', archived,
                             'next_allowed_at', to_char(next_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                             'at', to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, before, after)
  values (p_workspace, v_actor, (case when v_actor is null then 'system' else 'user' end)::public.event_actor,
          p_via, 'practice.reset', 'workspace', p_workspace::text,
          jsonb_build_object('epoch', w.practice_epoch), jsonb_build_object('epoch', w.practice_epoch + 1) || archived);
  return jsonb_build_object('epoch', w.practice_epoch + 1, 'starting_balance_lamports', w.paper_start_lamports::text,
                            'archived', archived, 'next_allowed_at', next_at, 'server_now', t);
end $$;

-- exit stats: current epoch only (archived history excluded)
create or replace function public.exit_stats(
  p_workspace uuid, p_strategy uuid default null, p_mode public.trade_mode default null,
  p_from timestamptz default null, p_to timestamptz default null)
returns table (
  reason public.exit_reason, count bigint, wins bigint, win_rate numeric,
  avg_pnl_lamports bigint, avg_pnl_pct numeric, total_pnl_lamports bigint, avg_hold_seconds bigint)
language sql stable security invoker as $$
  select p.exit_reason,
         count(*),
         count(*) filter (where p.sol_out_lamports > p.sol_in_lamports),
         round(avg((p.sol_out_lamports > p.sol_in_lamports)::int)::numeric, 4),
         round(avg(p.sol_out_lamports - p.sol_in_lamports))::bigint,
         round(avg(case when p.sol_in_lamports > 0
                   then (p.sol_out_lamports - p.sol_in_lamports)::numeric * 100 / p.sol_in_lamports end), 2),
         sum(p.sol_out_lamports - p.sol_in_lamports)::bigint,
         round(avg(extract(epoch from p.closed_at - p.opened_at)))::bigint
    from public.positions p
   where p.workspace_id = p_workspace and p.status = 'closed' and p.archived_at is null
     and p.exit_reason <> 'practice_reset'
     and (p_strategy is null or p.strategy_id = p_strategy)
     and (p_mode is null or p.mode = p_mode)
     and (p_from is null or p.closed_at >= p_from)
     and (p_to is null or p.closed_at < p_to)
   group by p.exit_reason
   order by count(*) desc
$$;

-- ---------------------------------------------------------------------------
-- 4. Account deletion: request (re-auth) -> grace (default 7 d, cancellable) -> anonymize
-- ---------------------------------------------------------------------------
alter table public.users
  add column deletion_state text not null default 'active'
      check (deletion_state in ('active', 'pending_deletion', 'deleted')),
  add column deletion_requested_at timestamptz,
  add column deletion_scheduled_for timestamptz,
  add column deletion_cancelled_at timestamptz,
  add column deleted_at timestamptz,
  add constraint users_deletion_consistent check (
    (deletion_state = 'active' and deletion_scheduled_for is null)
    or (deletion_state = 'pending_deletion' and deletion_scheduled_for is not null
        and deletion_scheduled_for between deletion_requested_at + interval '7 days' and deletion_requested_at + interval '30 days')
    or (deletion_state = 'deleted' and deleted_at is not null and display_name is null));

-- audit_log stays append-only; the single exception is actor anonymization during account deletion
-- (ip / user_agent / device -> null), allowed only inside finalize_account_deletion().
drop trigger audit_log_append_only on public.audit_log;
create or replace function public.audit_log_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('sentra.audit_anonymize', true), '') = 'on'
     and new.ip is null and new.user_agent is null and new.device is null
     and (to_jsonb(new) - 'ip' - 'user_agent' - 'device') = (to_jsonb(old) - 'ip' - 'user_agent' - 'device') then
    return new;
  end if;
  raise exception '% is append-only (% blocked)', tg_table_name, tg_op using errcode = 'insufficient_privilege';
end $$;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.audit_log_guard();

create or replace function public.emit_user_event(p_user uuid, p_type text, p_payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record; t timestamptz := clock_timestamp();
begin
  for r in select id from public.workspaces where owner_id = p_user loop
    insert into public.events (id, workspace_id, ts, type, actor, payload)
    values (p_user::text || ':' || (extract(epoch from t) * 1000)::bigint || ':' || p_type, r.id, t, p_type,
            'user', p_payload || jsonb_build_object('at', to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    on conflict (id) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.request_account_deletion(
  p_user uuid, p_reauth_at timestamptz, p_grace_days integer default 7, p_via text default 'api', p_ip inet default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u public.users;
  t timestamptz := clock_timestamp();
begin
  select * into u from public.users where id = p_user for update;
  if not found or u.deletion_state = 'deleted' then
    raise exception using errcode = 'P0404', message = 'NOT_FOUND';
  end if;
  if p_reauth_at is null or p_reauth_at < t - interval '5 minutes' or p_reauth_at > t + interval '5 seconds' then
    raise exception using errcode = 'P0401', message = 'REAUTH_REQUIRED';
  end if;
  if u.deletion_state = 'pending_deletion' then
    raise exception using errcode = 'P0409', message = 'ACCOUNT_DELETION_PENDING',
      detail = jsonb_build_object('scheduled_for', u.deletion_scheduled_for)::text;
  end if;
  if p_grace_days not between 7 and 30 then
    raise exception using errcode = 'P0422', message = 'VALIDATION_FAILED', detail = '{"field":"grace_days","range":"7-30"}';
  end if;
  -- Real funds must be out first (always true before Phase 7: real is rejected by the schema)
  if exists (select 1 from public.positions p join public.workspaces w on w.id = p.workspace_id
              where w.owner_id = p_user and p.mode = 'real' and p.status = 'open')
     or exists (select 1 from public.wallets wl join public.workspaces w on w.id = wl.workspace_id
                 where w.owner_id = p_user and wl.is_active) then
    raise exception using errcode = 'P0409', message = 'ACCOUNT_DELETION_BLOCKED',
      detail = '{"hint":"close Real SOL positions and withdraw the trading wallet first"}';
  end if;
  update public.users
     set deletion_state = 'pending_deletion', deletion_requested_at = t,
         deletion_scheduled_for = t + make_interval(days => p_grace_days), deletion_cancelled_at = null
   where id = p_user returning * into u;
  perform public.emit_user_event(p_user, 'account.deletion_scheduled',
    jsonb_build_object('scheduled_for', to_char(u.deletion_scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                       'grace_days', p_grace_days));
  insert into public.audit_log (actor_user, actor_kind, actor_via, action, target_type, target, after, ip)
  values (p_user, 'user', p_via, 'account.deletion_requested', 'user', p_user::text,
          jsonb_build_object('scheduled_for', u.deletion_scheduled_for), p_ip);
  insert into public.outbox (channel, user_id, payload)
  select 'email', p_user, jsonb_build_object('template', 'account_deletion_scheduled', 'to', a.email,
                                     'scheduled_for', u.deletion_scheduled_for)
    from public.auth_identities a where a.user_id = p_user and a.email is not null and a.verified_at is not null;
  return jsonb_build_object('state', u.deletion_state, 'scheduled_for', u.deletion_scheduled_for,
                            'rev', u.rev, 'server_now', t);
end $$;

create or replace function public.cancel_account_deletion(p_user uuid, p_via text default 'api')
returns jsonb language plpgsql security definer set search_path = public as $$
declare u public.users; t timestamptz := clock_timestamp();
begin
  update public.users
     set deletion_state = 'active', deletion_scheduled_for = null, deletion_cancelled_at = t
   where id = p_user and deletion_state = 'pending_deletion' and deletion_scheduled_for > t
  returning * into u;
  if not found then
    raise exception using errcode = 'P0409', message = 'VALIDATION_FAILED', detail = '{"hint":"no cancellable deletion"}';
  end if;
  perform public.emit_user_event(p_user, 'account.deletion_cancelled', '{}');
  insert into public.audit_log (actor_user, actor_kind, actor_via, action, target_type, target)
  values (p_user, 'user', p_via, 'account.deletion_cancelled', 'user', p_user::text);
  return jsonb_build_object('state', u.deletion_state, 'rev', u.rev, 'server_now', t);
end $$;

-- Anonymize (worker, after the grace period). Personal data is deleted; trading history and the audit
-- trail stay under the now non-identifying user id. The API then deletes the auth.users row.
create or replace function public.finalize_account_deletion(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u public.users;
  t timestamptz := clock_timestamp();
  r record;
  n_ws integer := 0; n_audit integer; n_ident integer;
begin
  select * into u from public.users where id = p_user for update;
  if not found or u.deletion_state <> 'pending_deletion' or u.deletion_scheduled_for > t then
    raise exception using errcode = 'P0409', message = 'VALIDATION_FAILED', detail = '{"hint":"not due"}';
  end if;
  perform set_config('sentra.account_deletion', 'on', true);
  perform set_config('sentra.audit_anonymize', 'on', true);

  perform public.emit_user_event(p_user, 'account.deleted', '{}');
  for r in select id from public.workspaces where owner_id = p_user and deleted_at is null loop
    for r in select a.id from public.approvals a where a.workspace_id = r.id and a.status in ('pending', 'approved') loop
      perform public.expire_proposal(r.id, 'account_deleted');
    end loop;
  end loop;
  update public.strategies set status = 'archived', archived_at = coalesce(archived_at, t)
   where workspace_id in (select id from public.workspaces where owner_id = p_user) and status in ('draft', 'running', 'paused');
  update public.workspaces set deleted_at = t where owner_id = p_user and deleted_at is null;
  get diagnostics n_ws = row_count;

  delete from public.email_otps where email_norm in (select lower(email) from public.auth_identities where user_id = p_user);
  delete from public.auth_identities where user_id = p_user;
  get diagnostics n_ident = row_count;
  delete from public.webauthn_credentials where user_id = p_user;
  delete from public.confirmation_challenges where user_id = p_user;
  delete from public.approval_tokens where user_id = p_user;
  delete from public.device_tokens where user_id = p_user;
  delete from public.workspace_members where user_id = p_user;
  update public.audit_log set ip = null, user_agent = null, device = null
   where actor_user = p_user and (ip is not null or user_agent is not null or device is not null);
  get diagnostics n_audit = row_count;
  update public.users set display_name = null, disabled_at = t, deletion_state = 'deleted', deleted_at = t
   where id = p_user;
  insert into public.audit_log (actor_kind, actor_via, action, target_type, target, after)
  values ('system', 'worker', 'account.deleted', 'user', p_user::text,
          jsonb_build_object('workspaces_closed', n_ws, 'identities_removed', n_ident, 'audit_rows_anonymized', n_audit));
  return jsonb_build_object('state', 'deleted', 'workspaces_closed', n_ws, 'identities_removed', n_ident,
                            'audit_rows_anonymized', n_audit, 'server_now', t);
end $$;

create or replace function public.finalize_due_account_deletions()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  for r in select id from public.users where deletion_state = 'pending_deletion' and deletion_scheduled_for <= now()
            order by deletion_scheduled_for limit 50 for update skip locked loop
    perform public.finalize_account_deletion(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Device push tokens (FCM / APNs / Web Push). Token plaintext is backend-only.
-- ---------------------------------------------------------------------------
create table public.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  device_id     text not null check (device_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  platform      text not null check (platform in ('ios', 'android', 'web', 'desktop')),
  provider      text not null check (provider in ('fcm', 'apns', 'webpush')),
  token         text not null check (length(token) between 16 and 4096),
  token_sha256  bytea not null unique check (length(token_sha256) = 32),
  app_version   text not null check (app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][A-Za-z0-9.]+)?$'),
  locale        text not null default 'id-ID' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  rev           integer not null default 1,
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, device_id),
  check (provider <> 'apns' or platform = 'ios'),
  check (provider <> 'webpush' or platform in ('web', 'desktop'))
);
create trigger device_tokens_bump_rev before update on public.device_tokens for each row execute function public.bump_rev();

-- Register or rotate (same device_id, new token replaces the old one). A token seen under another
-- user (shared device, re-login) moves to the caller.
create or replace function public.register_device(
  p_device_id text, p_platform text, p_provider text, p_token text, p_app_version text,
  p_locale text default 'id-ID', p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user);
  h bytea := digest(p_token, 'sha256');
  d public.device_tokens;
begin
  if v_user is null then
    raise exception using errcode = 'P0401', message = 'UNAUTHENTICATED';
  end if;
  delete from public.device_tokens where token_sha256 = h and (user_id <> v_user or device_id <> p_device_id);
  insert into public.device_tokens (user_id, device_id, platform, provider, token, token_sha256, app_version, locale)
  values (v_user, p_device_id, p_platform, p_provider, p_token, h, p_app_version, p_locale)
  on conflict (user_id, device_id) do update
     set platform = excluded.platform, provider = excluded.provider, token = excluded.token,
         token_sha256 = excluded.token_sha256, app_version = excluded.app_version, locale = excluded.locale,
         last_seen_at = now(), revoked_at = null
  returning * into d;
  return jsonb_build_object('id', d.id, 'device_id', d.device_id, 'platform', d.platform, 'rev', d.rev,
                            'last_seen_at', d.last_seen_at, 'server_now', now());
exception when check_violation then
  raise exception using errcode = 'P0422', message = 'DEVICE_TOKEN_INVALID';
end $$;

create or replace function public.revoke_device(p_device_id text, p_user uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.device_tokens set revoked_at = now()
   where user_id = coalesce(auth.uid(), p_user) and device_id = p_device_id and revoked_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- ---------------------------------------------------------------------------
-- RLS + privileges for the new objects
-- ---------------------------------------------------------------------------
alter table public.strategy_revisions enable row level security;
alter table public.practice_resets enable row level security;
alter table public.device_tokens enable row level security;
create policy strategy_revisions_select on public.strategy_revisions for select to authenticated
  using (exists (select 1 from public.strategies s where s.id = strategy_id and public.is_workspace_member(s.workspace_id)
                 and public.mode_visible(s.mode)));
create policy practice_resets_select on public.practice_resets for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy device_tokens_self_select on public.device_tokens for select to authenticated using (user_id = auth.uid());
revoke all on public.strategy_revisions, public.practice_resets, public.device_tokens from anon;
revoke insert, update, delete, truncate on public.strategy_revisions, public.practice_resets, public.device_tokens
  from authenticated;
-- the push token itself is never readable by clients
revoke select on public.device_tokens from authenticated;
grant select (id, device_id, platform, provider, app_version, locale, rev, last_seen_at, revoked_at, created_at)
  on public.device_tokens to authenticated;

do $$
declare f text;
begin
  -- worker / API (service role) only
  foreach f in array array[
    'finalize_account_deletion(uuid)', 'finalize_due_account_deletions()',
    'request_account_deletion(uuid, timestamptz, integer, text, inet)', 'cancel_account_deletion(uuid, text)',
    'unlink_identity(uuid, uuid, timestamptz, text, inet)', 'emit_user_event(uuid, text, jsonb)',
    'strategy_conflict_detail(public.strategies, integer)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- client-callable (auth.uid() + role checks inside)
  foreach f in array array[
    'update_strategy(uuid, integer, jsonb, text, public.strategy_status, uuid, text, text, uuid)',
    'set_strategy_status(uuid, text, integer)', 'reset_practice(uuid, uuid, text)',
    'register_device(text, text, text, text, text, text, uuid)', 'revoke_device(text, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Telegram OIDC login (DESIGN-ONLY; Edge Function behind AUTH_TELEGRAM_OIDC_ENABLED=false)
-- ---------------------------------------------------------------------------
create table public.telegram_login_nonces (
  nonce_hash  bytea primary key check (length(nonce_hash) = 32),   -- sha256(nonce); plaintext never stored
  device_id   text not null check (device_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  ip_prefix   cidr,
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '5 minutes',
  consumed_at timestamptz,
  check (expires_at <= issued_at + interval '5 minutes')
);
create index telegram_login_nonces_expiry_idx on public.telegram_login_nonces (expires_at) where consumed_at is null;

-- one row per accepted id_token: the same token can never be exchanged twice
create table public.telegram_id_token_uses (
  token_sha256 bytea primary key check (length(token_sha256) = 32),
  tg_sub       text not null,
  iat          timestamptz not null,
  used_at      timestamptz not null default now()
);

create or replace function public.consume_telegram_nonce(p_nonce text, p_device_id text, p_id_token text,
                                                         p_tg_sub text, p_iat timestamptz)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  update public.telegram_login_nonces set consumed_at = now()
   where nonce_hash = digest(p_nonce, 'sha256') and device_id = p_device_id
     and consumed_at is null and expires_at > now()
  returning true into ok;
  if ok is null then
    raise exception using errcode = 'P0401', message = 'AUTH_TG_REPLAY', detail = '{"what":"nonce"}';
  end if;
  if p_iat < now() - interval '120 seconds' or p_iat > now() + interval '30 seconds' then
    raise exception using errcode = 'P0401', message = 'AUTH_TG_INVALID', detail = '{"what":"iat"}';
  end if;
  begin
    insert into public.telegram_id_token_uses (token_sha256, tg_sub, iat) values (digest(p_id_token, 'sha256'), p_tg_sub, p_iat);
  exception when unique_violation then
    raise exception using errcode = 'P0401', message = 'AUTH_TG_REPLAY', detail = '{"what":"id_token"}';
  end;
  return true;
end $$;
alter table public.telegram_login_nonces enable row level security;
alter table public.telegram_id_token_uses enable row level security;
revoke all on public.telegram_login_nonces, public.telegram_id_token_uses from anon, authenticated;
revoke execute on function public.consume_telegram_nonce(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_telegram_nonce(text, text, text, text, timestamptz) to service_role;
