-- Guard-change proposal flow (practice). A weakening strategy change is never applied directly:
--   propose_guard_change() -> approval(kind guard_change, weakening, 24 h expiry, base_rev) + guard_changes row
--   decide_approval(approve, p_hold_ms >= 1200, token >= 1.2 s old) -> apply_guard_change(): settings applied
--   on exactly base_rev (else STRATEGY_REV_CONFLICT), guard_changes applied, strategy.updated + guard.changed.
--   reject / expiry -> guard_changes rejected / expired + guard.changed.
-- Real SOL weakening stays rejected by the schema (mode CHECKs); its path (typed name + 2FA + WebAuthn,
-- 10 min cooldown, 24 h auto-revert) is design-only until Phase 7. MCP may propose but never decide.

create or replace function public.guard_change_risk(p_fields text[])
returns text language sql immutable as $$
  select case
    when p_fields && array['allow_mint_authority', 'allow_freeze_authority', 'require_sell_sim'] then 'critical'
    when exists (select 1 from unnest(p_fields) f where f like '%\_fail' escape '\') then 'high'
    else 'medium' end
$$;

create or replace function public.guard_change_wire(g public.guard_changes)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'guard_change_id', g.id, 'proposal_id', g.approval_id, 'strategy_id', g.strategy_id, 'mode', g.mode,
    'status', g.status, 'rev', g.rev, 'from_rev', g.from_rev, 'diff', g.diff, 'weakened_fields', to_jsonb(g.weakened_fields),
    'requested_by', g.requested_by,
    'cooldown_until', to_char(g.cooldown_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'auto_revert_at', to_char(g.auto_revert_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'applied_at', to_char(g.applied_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'created_at', to_char(g.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

create or replace function public.emit_guard_changed(g public.guard_changes, p_to_rev integer, p_actor public.event_actor)
returns void language sql as $$
  select public.emit_ws_event(g.workspace_id, g.id::text || '.' || g.rev, 'guard.changed', g.strategy_id, null, p_actor,
    jsonb_build_object('guard_change_id', g.id, 'proposal_id', g.approval_id, 'status', g.status,
                       'from_rev', g.from_rev, 'to_rev', p_to_rev, 'weakening', cardinality(g.weakened_fields) > 0,
                       'weakened_fields', to_jsonb(g.weakened_fields),
                       'cooldown_until', to_char(g.cooldown_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                       'auto_revert_at', to_char(g.auto_revert_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
$$;

-- p_status: rejected | expired (only from requested).
create or replace function public.guard_change_set_status(p_approval uuid, p_status public.guard_change_status)
returns void language plpgsql security definer set search_path = public as $$
declare g public.guard_changes;
begin
  update public.guard_changes set status = p_status
   where approval_id = p_approval and status = 'requested'
  returning * into g;
  if found then
    perform public.emit_guard_changed(g, null, case when p_status = 'expired' then 'system' else 'user' end::public.event_actor);
  end if;
end $$;

-- Expiry (sweeper, strategy retire, practice reset) keeps guard_changes in step.
create or replace function public.approvals_guard_change_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'guard_change' and new.status = 'expired' and old.status <> 'expired' then
    perform public.guard_change_set_status(new.id, 'expired');
  end if;
  return null;
end $$;
drop trigger if exists approvals_guard_change_sync on public.approvals;
create trigger approvals_guard_change_sync after update of status on public.approvals
  for each row execute function public.approvals_guard_change_sync();

-- Request a guard change. Clients send p_strategy, p_expected_rev (strategy rev), p_patch (JSON merge patch),
-- p_device? (label). Actor = auth.uid(); via = JWT claim. Returns {proposal, guard_change, server_now}.
create or replace function public.propose_guard_change(
  p_strategy uuid, p_expected_rev integer, p_patch jsonb, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.strategies;
  v_new jsonb;
  v_weak text[];
  v_diff jsonb;
  a public.approvals;
  g public.guard_changes;
  t timestamptz := clock_timestamp();
  v_via text := public.request_via();
begin
  if uid is null then raise exception using errcode = 'P0401', message = 'UNAUTHENTICATED'; end if;
  if p_expected_rev is null then
    raise exception using errcode = 'P0428', message = 'PRECONDITION_REQUIRED',
      detail = '{"hint":"send If-Match: <rev> or expected_rev"}';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = 'P0422', message = 'VALIDATION_FAILED', detail = '{"field":"settings_patch"}';
  end if;
  select * into s from public.strategies where id = p_strategy and status <> 'deleted' for update;
  if not found then raise exception using errcode = 'P0404', message = 'NOT_FOUND'; end if;
  if not public.has_workspace_role(s.workspace_id, array['owner', 'admin', 'trader']::public.workspace_role[]) then
    raise exception using errcode = 'P0403', message = 'FORBIDDEN_ROLE';
  end if;
  if s.status = 'archived' then raise exception using errcode = 'P0409', message = 'STRATEGY_RETIRED'; end if;
  if s.rev <> p_expected_rev then
    raise exception using errcode = 'P0409', message = 'STRATEGY_REV_CONFLICT',
      detail = public.strategy_conflict_detail(s, p_expected_rev)::text;
  end if;
  v_new := (s.settings || p_patch) - array(select k from jsonb_each(p_patch) e(k, v) where v = 'null'::jsonb);
  begin
    perform public.strategy_settings_valid(v_new);
  exception when check_violation then
    raise exception using errcode = 'P0422', message = 'VALIDATION_FAILED',
      detail = jsonb_build_object('field', 'settings_patch', 'reason', sqlerrm)::text;
  end;
  v_weak := public.guard_weakened_fields(s.settings, v_new);
  if cardinality(v_weak) = 0 then
    raise exception using errcode = 'P0422', message = 'VALIDATION_FAILED',
      detail = '{"field":"settings_patch","hint":"not a guard weakening; apply it with update_strategy / PATCH"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'before', s.settings -> k, 'after', v_new -> k,
                                               'effect', case when k = any (v_weak) or (k = 'guard_checks' and exists (
                                                   select 1 from unnest(v_weak) w where (v_new -> 'guard_checks') ? w))
                                                 then 'weakens' else 'changes' end) order by k), '[]')
    into v_diff
    from (select jsonb_object_keys(p_patch) k) x
   where (s.settings -> k) is distinct from (v_new -> k);
  insert into public.approvals (workspace_id, strategy_id, kind, mode, subject, risk, payload, base_rev, weakening,
                                requested_by, requested_via, created_at, expires_at)
  values (s.workspace_id, s.id, 'guard_change', s.mode, s.id::text, public.guard_change_risk(v_weak),
          jsonb_build_object('settings_patch', p_patch, 'weakened_fields', to_jsonb(v_weak), 'strategy_name', s.name,
                             'device', p_device),
          s.rev, true, 'user', case when v_via = 'mcp' then 'mcp' else 'app' end, t, t + interval '24 hours')
  returning * into a;
  insert into public.guard_changes (workspace_id, strategy_id, approval_id, mode, from_rev, diff, weakened_fields, requested_by)
  values (s.workspace_id, s.id, a.id, s.mode, s.rev, v_diff, v_weak, uid)
  returning * into g;
  perform public.emit_ws_event(s.workspace_id, a.id::text, 'proposal.created', s.id, null, 'user',
    jsonb_build_object('proposal_id', a.id, 'kind', a.kind, 'rev', a.rev, 'base_rev', a.base_rev,
                       'expires_at', to_char(a.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                       'risk_level', a.risk, 'weakening', true, 'weakened_fields', to_jsonb(v_weak),
                       'summary', 'guard change: ' || array_to_string(v_weak, ', ')));
  perform public.emit_guard_changed(g, null, 'user');
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target,
                                before, after, risk, approval_id, device, proof_kind)
  values (s.workspace_id, uid, 'user', v_via, 'guard_change.request', 'strategy', s.id::text,
          jsonb_build_object('rev', s.rev), jsonb_build_object('settings_patch', p_patch),
          jsonb_build_object('risk_level', a.risk, 'weakened_fields', to_jsonb(v_weak)), a.id, p_device, 'none');
  return jsonb_build_object('proposal', public.approval_wire(a), 'guard_change', public.guard_change_wire(g),
                            'server_now', t);
end $$;

-- Apply an approved guard change (called by decide_approval only, after the base_rev check).
create or replace function public.apply_guard_change(a public.approvals, p_actor uuid, p_via text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.strategies;
  g public.guard_changes;
  p jsonb := a.payload -> 'settings_patch';
  t timestamptz := clock_timestamp();
  v_base integer;
begin
  select * into s from public.strategies where id = a.strategy_id for update;
  if s.rev <> a.base_rev then
    raise exception using errcode = 'P0409', message = 'STRATEGY_REV_CONFLICT',
      detail = public.strategy_conflict_detail(s, a.base_rev)::text;
  end if;
  v_base := s.rev;
  perform set_config('centurion.actor', coalesce(p_actor::text, ''), true);
  perform set_config('centurion.via', p_via, true);
  perform set_config('centurion.device', coalesce(a.payload ->> 'device', ''), true);
  update public.strategies
     set settings = (settings || p) - array(select k from jsonb_each(p) e(k, v) where v = 'null'::jsonb)
   where id = s.id
  returning * into s;
  update public.guard_changes set status = 'applied', applied_at = t
   where approval_id = a.id and status = 'requested'
  returning * into g;
  perform public.emit_ws_event(s.workspace_id, s.id::text, 'strategy.updated', s.id, null, 'user',
    jsonb_build_object('rev', s.rev, 'base_rev', v_base, 'status', s.status, 'proposal_id', a.id,
                       'changed_fields', public.jsonb_changed_keys(
                          (select settings from public.strategy_revisions where strategy_id = s.id and rev = v_base), s.settings)));
  if g.id is not null then
    perform public.emit_guard_changed(g, s.rev, 'user');
  end if;
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target,
                                before, after, risk, approval_id, proof_kind)
  values (s.workspace_id, p_actor, 'user', p_via, 'guard_change.apply', 'strategy', s.id::text,
          jsonb_build_object('rev', v_base), jsonb_build_object('rev', s.rev, 'settings_patch', p),
          jsonb_build_object('risk_level', a.risk, 'weakened_fields', a.payload -> 'weakened_fields'), a.id, 'none');
end $$;

drop function public.decide_approval(uuid, text, text, integer, text, text);
create or replace function public.decide_approval(
  p_approval_id uuid, p_token text, p_decision text, p_expected_rev integer,
  p_idempotency_key text default null, p_reject_reason text default null, p_hold_ms integer default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  t public.approval_tokens;
  a public.approvals;
  now_ts timestamptz := clock_timestamp();
  ev_type text;
  via public.decided_via;
  rr public.approval_reject_reason;
begin
  if uid is null then raise exception 'UNAUTHENTICATED' using errcode = 'P0401'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'VALIDATION_FAILED' using errcode = 'P0422'; end if;
  -- 1.1.3: closed enum, reject only, default user_declined
  if p_reject_reason is not null and p_decision = 'approve' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422',
      detail = '{"field":"reject_reason","hint":"only with decision=reject"}';
  end if;
  if p_reject_reason is not null and not (p_reject_reason = any (enum_range(null::public.approval_reject_reason)::text[])) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422',
      detail = jsonb_build_object('field', 'reject_reason', 'allowed', to_jsonb(enum_range(null::public.approval_reject_reason)::text[]))::text;
  end if;
  rr := case when p_decision = 'reject' then coalesce(p_reject_reason, 'user_declined')::public.approval_reject_reason end;
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
  if (t.used_at is not null and t.used_decision = p_decision and a.reject_reason is not distinct from rr)
     or (p_idempotency_key is not null and a.decision_idempotency_key = p_idempotency_key and a.decision = p_decision
         and a.reject_reason is not distinct from rr) then
    return jsonb_build_object('proposal_id', a.id, 'status', a.status, 'rev', a.rev, 'reject_reason', a.reject_reason,
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

  -- Practice guard weakening: a 1,200 ms hold. Client-reported hold_ms plus the server-side token age
  -- (the decision token must be at least 1.2 s old). Real weakening needs the full proof (Phase 7).
  if a.weakening and p_decision = 'approve' then
    if p_hold_ms is null then
      raise exception using errcode = 'P0428', message = 'CONFIRMATION_REQUIRED',
        detail = '{"required":{"hold_ms":1200}}';
    end if;
    if p_hold_ms < 1200 or t.issued_at > now_ts - interval '1200 milliseconds' then
      raise exception using errcode = 'P0422', message = 'HOLD_TOO_SHORT',
        detail = jsonb_build_object('min_hold_ms', 1200, 'hold_ms', p_hold_ms)::text;
    end if;
  end if;
  update public.approvals
     set status = case p_decision when 'approve' then 'approved'::public.approval_status else 'rejected' end,
         decision = p_decision, decided_via = via, decided_by = uid, decided_at = now_ts,
         decision_idempotency_key = p_idempotency_key, reject_reason = rr, rev = rev + 1
   where id = a.id
  returning * into a;
  update public.approval_tokens set used_at = now_ts, used_decision = p_decision where token_hash = t.token_hash;

  ev_type := case p_decision when 'approve' then 'proposal.approved' else 'proposal.rejected' end;
  insert into public.events (id, workspace_id, strategy_id, ck, mint, ts, type, actor, payload)
  values (a.id::text || ':' || (extract(epoch from now_ts) * 1000)::bigint || ':' || ev_type,
          a.workspace_id, a.strategy_id, a.subject, a.mint, now_ts, ev_type, 'user',
          jsonb_build_object('proposal_id', a.id, 'kind', a.kind, 'rev', a.rev,
                             'decided_by', uid, 'decided_via', via, 'reason', null, 'reject_reason', rr));
  if a.kind = 'guard_change' then
    if p_decision = 'approve' then
      perform public.apply_guard_change(a, uid, via::text);
    else
      perform public.guard_change_set_status(a.id, 'rejected');
    end if;
  end if;
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target,
                                before, after, approval_id, proof_kind)
  values (a.workspace_id, uid, 'user', via::text, 'approval.' || p_decision, 'approval', a.id::text,
          jsonb_build_object('status', 'pending', 'rev', a.rev - 1),
          jsonb_build_object('status', a.status, 'rev', a.rev, 'kind', a.kind, 'reject_reason', rr, 'hold_ms', p_hold_ms), a.id,
          'none');
  return jsonb_build_object('proposal_id', a.id, 'status', a.status, 'rev', a.rev, 'reject_reason', a.reject_reason,
                            'replayed', false, 'server_now', now_ts);
end $$;
revoke execute on function public.decide_approval(uuid, text, text, integer, text, text, integer) from public, anon;
grant execute on function public.decide_approval(uuid, text, text, integer, text, text, integer) to authenticated, service_role;
revoke execute on function public.propose_guard_change(uuid, integer, jsonb, text) from public, anon;
grant execute on function public.propose_guard_change(uuid, integer, jsonb, text) to authenticated, service_role;
revoke execute on function public.apply_guard_change(public.approvals, uuid, text) from public, anon, authenticated;
revoke execute on function public.guard_change_set_status(uuid, public.guard_change_status) from public, anon, authenticated;
grant execute on function public.apply_guard_change(public.approvals, uuid, text) to service_role;
grant execute on function public.guard_change_set_status(uuid, public.guard_change_status) to service_role;
