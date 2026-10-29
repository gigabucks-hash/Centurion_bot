-- Contracts 1.1.2 follow-up (Phase 2 API, milestone 2).
-- 1. `current` is REQUIRED on every 409 VERSION_CONFLICT / STRATEGY_REV_CONFLICT (API_ENDPOINTS 2.1):
--    decide_approval now sends the current approval (approval_wire) and, for guard changes, the strategy
--    conflict detail. close_position and update_strategy already did.
-- 2. strategy_wire(), create_strategy() and retire_strategy_by_user(): the user write paths for strategies
--    (actor = auth.uid(), via = JWT claim; the old retire_strategy(p_strategy, p_action, p_actor) becomes
--    service-only, for workers).

create or replace function public.approval_wire(a public.approvals)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'proposal_id', a.id, 'workspace_id', a.workspace_id, 'strategy_id', a.strategy_id,
    'kind', a.kind, 'mode', a.mode, 'subject', a.subject, 'mint', a.mint,
    'amount_lamports', a.amount_lamports::text, 'is_first_buy', a.is_first_buy, 'risk', a.risk,
    'weakening', a.weakening, 'status', a.status, 'rev', a.rev, 'expire_reason', a.expire_reason,
    'base_rev', a.base_rev, 'decision', a.decision, 'decided_via', a.decided_via, 'decided_by', a.decided_by,
    'payload', a.payload,
    'created_at', to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expires_at', to_char(a.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'decided_at', to_char(a.decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

create or replace function public.decide_approval(
  p_approval_id uuid, p_token text, p_decision text, p_expected_rev integer,
  p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  t public.approval_tokens;
  a public.approvals;
  now_ts timestamptz := clock_timestamp();
  ev_type text;
  via public.decided_via;
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0401'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'VALIDATION_FAILED' using errcode = 'P0422'; end if;
  if p_expected_rev is null then
    raise exception 'PRECONDITION_REQUIRED' using errcode = 'P0428', detail = '{"hint":"send expected_rev (the approval rev)"}';
  end if;

  select * into t from public.approval_tokens
   where token_hash = digest(coalesce(p_token, ''), 'sha256') and approval_id = p_approval_id and user_id = uid
   for update;
  if not found then raise exception 'APPROVAL_TOKEN_INVALID' using errcode = 'P0403'; end if;
  via := case when t.issued_via = 'push' then 'push'::public.decided_via else public.request_client() end;

  select * into a from public.approvals where id = p_approval_id for update;
  if via = 'mcp' and (a.weakening or a.kind = 'team_action') then
    raise exception 'APPROVAL_REQUIRES_APP' using errcode = 'P0403';
  end if;
  if not public.has_workspace_role(a.workspace_id, '{owner,admin,trader}') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'P0403';
  end if;

  -- idempotent replay: same token (or same Idempotency-Key) + same decision => stored result
  if (t.used_at is not null and t.used_decision = p_decision)
     or (p_idempotency_key is not null and a.decision_idempotency_key = p_idempotency_key and a.decision = p_decision) then
    return jsonb_build_object('proposal_id', a.id, 'status', a.status, 'rev', a.rev,
                              'replayed', true, 'server_now', now_ts);
  end if;
  if p_idempotency_key is not null and a.decision_idempotency_key = p_idempotency_key then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0422';
  end if;
  if t.used_at is not null or a.status in ('approved', 'rejected') then
    raise exception 'APPROVAL_ALREADY_DECIDED' using errcode = 'P0409';
  end if;
  if a.status = 'expired' or a.expires_at <= now_ts or t.expires_at <= now_ts then
    raise exception 'APPROVAL_EXPIRED' using errcode = 'P0409';
  end if;
  if p_expected_rev <> a.rev then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0409',
      detail = jsonb_build_object('current_rev', a.rev, 'base_rev', p_expected_rev,
                                  'current', public.approval_wire(a))::text;
  end if;
  if a.kind = 'guard_change' and a.base_rev is distinct from
       (select rev from public.strategies where id = a.strategy_id) then
    raise exception 'STRATEGY_REV_CONFLICT' using errcode = 'P0409',
      detail = (select public.strategy_conflict_detail(s, a.base_rev) from public.strategies s where s.id = a.strategy_id)::text;
  end if;

  update public.approvals
     set status = case p_decision when 'approve' then 'approved'::public.approval_status else 'rejected' end,
         decision = p_decision, decided_via = via, decided_by = uid, decided_at = now_ts,
         decision_idempotency_key = p_idempotency_key, rev = rev + 1
   where id = a.id
  returning * into a;
  update public.approval_tokens set used_at = now_ts, used_decision = p_decision where token_hash = t.token_hash;

  ev_type := case p_decision when 'approve' then 'proposal.approved' else 'proposal.rejected' end;
  insert into public.events (id, workspace_id, strategy_id, ck, mint, ts, type, actor, payload)
  values (a.id::text || ':' || (extract(epoch from now_ts) * 1000)::bigint || ':' || ev_type,
          a.workspace_id, a.strategy_id, a.subject, a.mint, now_ts, ev_type, 'user',
          jsonb_build_object('proposal_id', a.id, 'kind', a.kind, 'rev', a.rev,
                             'decided_by', uid, 'decided_via', via, 'reason', null));
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target,
                                before, after, approval_id, proof_kind)
  values (a.workspace_id, uid, 'user', via::text, 'approval.' || p_decision, 'approval', a.id::text,
          jsonb_build_object('status', 'pending', 'rev', a.rev - 1),
          jsonb_build_object('status', a.status, 'rev', a.rev, 'kind', a.kind), a.id, 'none');
  return jsonb_build_object('proposal_id', a.id, 'status', a.status, 'rev', a.rev,
                            'replayed', false, 'server_now', now_ts);
end $$;

create or replace function public.strategy_wire(s public.strategies)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'workspace_id', s.workspace_id, 'name', s.name, 'mode', s.mode, 'status', s.status,
    'rev', s.rev, 'settings', s.settings, 'created_by', s.created_by,
    'first_buy_at', to_char(s.first_buy_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'run_started_at', to_char(s.run_started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'archived_at', to_char(s.archived_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'created_at', to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updated_at', to_char(s.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

-- Create a practice strategy. Settings are validated by the strategies CHECK (strategy_settings_valid).
create or replace function public.create_strategy(
  p_workspace uuid, p_name text, p_settings jsonb default '{}', p_status public.strategy_status default 'draft',
  p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  w public.workspaces;
  s public.strategies;
  t timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0401'; end if;
  select * into w from public.workspaces where id = p_workspace and deleted_at is null;
  if not found or not public.is_workspace_member(p_workspace) then
    raise exception 'NOT_FOUND' using errcode = 'P0404';
  end if;
  if not public.has_workspace_role(p_workspace, '{owner,admin,trader}') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'P0403';
  end if;
  if w.mode <> 'practice' then raise exception 'MODE_NOT_ALLOWED' using errcode = 'P0403'; end if;
  if p_status not in ('draft', 'paused') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422',
      detail = '{"field":"status","allowed":["draft","paused"],"hint":"resume to run"}';
  end if;
  if p_name is null or length(p_name) not between 1 and 80 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"name","range":"1-80"}';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"settings"}';
  end if;
  perform set_config('sentra.actor', uid::text, true);
  perform set_config('sentra.via', public.request_via(), true);
  perform set_config('sentra.device', coalesce(p_device, ''), true);
  insert into public.strategies (workspace_id, name, status, settings, created_by)
  values (p_workspace, p_name, p_status, p_settings, uid)
  returning * into s;
  perform public.emit_ws_event(p_workspace, s.id::text, 'strategy.created', s.id, null, 'user',
                               jsonb_build_object('rev', s.rev, 'status', s.status, 'name', s.name));
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, after, device)
  values (p_workspace, uid, 'user', public.request_via(), 'strategy.create', 'strategy', s.id::text,
          jsonb_build_object('rev', s.rev, 'status', s.status, 'name', s.name), p_device);
  return public.strategy_wire(s) || jsonb_build_object('server_now', t);
end $$;

-- Archive or delete a strategy as the calling user, based on a rev. Expires its open proposals.
create or replace function public.retire_strategy_by_user(
  p_strategy uuid, p_expected_rev integer, p_action text default 'archive')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.strategies;
  n integer;
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0401'; end if;
  if p_action not in ('archive', 'delete') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"action","allowed":["archive","delete"]}';
  end if;
  if p_expected_rev is null then
    raise exception 'PRECONDITION_REQUIRED' using errcode = 'P0428', detail = '{"hint":"send If-Match: <rev> or expected_rev"}';
  end if;
  select * into s from public.strategies where id = p_strategy and status <> 'deleted' for update;
  if not found or not public.is_workspace_member(s.workspace_id) then
    raise exception 'NOT_FOUND' using errcode = 'P0404';
  end if;
  if not public.has_workspace_role(s.workspace_id, '{owner,admin,trader}') then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'P0403';
  end if;
  if s.status = 'archived' and p_action = 'archive' then
    raise exception 'STRATEGY_RETIRED' using errcode = 'P0409';
  end if;
  if s.rev <> p_expected_rev then
    raise exception 'STRATEGY_REV_CONFLICT' using errcode = 'P0409',
      detail = public.strategy_conflict_detail(s, p_expected_rev)::text;
  end if;
  perform set_config('sentra.actor', uid::text, true);
  perform set_config('sentra.via', public.request_via(), true);
  n := public.retire_strategy(p_strategy, p_action, uid);
  select * into s from public.strategies where id = p_strategy;
  return jsonb_build_object('id', s.id, 'status', s.status, 'rev', s.rev, 'expired_proposals', n,
                            'server_now', clock_timestamp());
end $$;

revoke execute on function public.retire_strategy(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.retire_strategy(uuid, text, uuid) to service_role;
do $$
declare f text;
begin
  foreach f in array array['create_strategy(uuid, text, jsonb, public.strategy_status, text)',
                           'retire_strategy_by_user(uuid, integer, text)', 'strategy_wire(public.strategies)',
                           'approval_wire(public.approvals)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
