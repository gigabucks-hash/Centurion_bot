-- Contracts v1.1.2 follow-up: account-deletion grace is 7-30 days, default 7 (Apex's decision as lead;
-- UX i18n v0.4.1 uses 7-30). Replaces the 1-30 range from 0002 (function + table CHECK).

alter table public.users drop constraint users_deletion_consistent;
alter table public.users add constraint users_deletion_consistent check (
  (deletion_state = 'active' and deletion_scheduled_for is null)
  or (deletion_state = 'pending_deletion' and deletion_scheduled_for is not null
      and deletion_scheduled_for between deletion_requested_at + interval '7 days' and deletion_requested_at + interval '30 days')
  or (deletion_state = 'deleted' and deleted_at is not null and display_name is null));

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
  -- server-side setting (ACCOUNT_DELETION_GRACE_DAYS, default 7, allowed 7-30; Apex's decision as lead); clients cannot choose it
  if p_grace_days is null or p_grace_days not between 7 and 30 then
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
