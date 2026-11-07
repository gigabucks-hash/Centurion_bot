-- Per-strategy Paper/Real switch (Web StrategyModeCard). Additive to contracts 1.1.6.
--
-- This phase is paper-only: `real` is refused for every strategy (MODE_NOT_ALLOWED, reason real_locked).
-- Real -> practice is implemented for the phase-7 forward contract, but the strategies table still has the
-- paper-only CHECK, so a Real row cannot exist until that constraint is lifted in phase 7. Nothing in this
-- migration enables real execution: real_gate.ts stays locked and the API never writes mode='real'.
--
-- The only write path is set_strategy_mode(); direct UPDATE from clients is still revoked (0002).

-- A mode flip is user-visible, so it bumps rev exactly like settings/name/status do.
create or replace function public.strategies_bump_rev()
returns trigger language plpgsql as $$
begin
  if new.settings is distinct from old.settings or new.name is distinct from old.name
     or new.status is distinct from old.status or new.mode is distinct from old.mode then
    new.rev := old.rev + 1;
  else
    new.rev := old.rev;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Returns the same strategy_wire/GET shape plus server_now.
-- Errors (SQLSTATE P0<http>, MESSAGE = errors.json code, DETAIL = JSON):
--   428 PRECONDITION_REQUIRED, 404 NOT_FOUND, 403 FORBIDDEN_ROLE,
--   403 MODE_NOT_ALLOWED (archived or real_locked), 409 STRATEGY_REV_CONFLICT (with current).
create or replace function public.set_strategy_mode(
  p_strategy uuid, p_mode public.trade_mode, p_expected_rev integer, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.strategies;
  v_actor uuid := auth.uid();
  v_from public.trade_mode;
  t timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = 'P0401', message = 'UNAUTHENTICATED';
  end if;
  if p_mode is null then
    raise exception using errcode = 'P0422', message = 'VALIDATION_FAILED',
      detail = '{"field":"mode","allowed":["practice","real"]}';
  end if;
  if p_expected_rev is null then
    raise exception using errcode = 'P0428', message = 'PRECONDITION_REQUIRED',
      detail = '{"hint":"send If-Match: <rev> or expected_rev"}';
  end if;

  select * into s from public.strategies where id = p_strategy and status <> 'deleted' for update;
  if not found or not public.is_workspace_member(s.workspace_id) then
    raise exception using errcode = 'P0404', message = 'NOT_FOUND';
  end if;
  if not public.has_workspace_role(s.workspace_id, array['owner', 'admin', 'trader']::public.workspace_role[]) then
    raise exception using errcode = 'P0403', message = 'FORBIDDEN_ROLE';
  end if;
  if s.status = 'archived' then
    raise exception using errcode = 'P0403', message = 'MODE_NOT_ALLOWED',
      detail = '{"reason":"archived"}';
  end if;
  if s.rev <> p_expected_rev then
    raise exception using errcode = 'P0409', message = 'STRATEGY_REV_CONFLICT',
      detail = public.strategy_conflict_detail(s, p_expected_rev)::text;
  end if;

  -- Same mode: no write, no rev bump, no event (retry-safe).
  if s.mode = p_mode then
    return public.strategy_wire(s) || jsonb_build_object('server_now', t);
  end if;

  -- Paper-only phase: Real is never enabled here, whatever the strategy's real gate says.
  if p_mode = 'real' then
    raise exception using errcode = 'P0403', message = 'MODE_NOT_ALLOWED',
      detail = jsonb_build_object(
        'reason', 'real_locked',
        'real_locked_reason', 'needs_owner_approval',
        'hint', 'Real mode needs owner approval before it can be enabled; this build is paper-only.')::text;
  end if;

  v_from := s.mode;
  perform set_config('centurion.actor', v_actor::text, true);
  perform set_config('centurion.via', public.request_via(), true);
  perform set_config('centurion.device', coalesce(p_device, ''), true);
  update public.strategies set mode = p_mode where id = s.id returning * into s;

  perform public.emit_ws_event(s.workspace_id, s.id::text, 'strategy.mode_changed', s.id, null, 'user',
    jsonb_build_object('rev', s.rev, 'base_rev', p_expected_rev, 'from_mode', v_from, 'to_mode', s.mode));
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target,
                                before, after, device)
  values (s.workspace_id, v_actor, 'user', public.request_via(), 'strategy.mode_changed', 'strategy', s.id::text,
          jsonb_build_object('mode', v_from, 'rev', p_expected_rev),
          jsonb_build_object('mode', s.mode, 'rev', s.rev), p_device);
  return public.strategy_wire(s) || jsonb_build_object('server_now', t);
end $$;

revoke all on function public.set_strategy_mode(uuid, public.trade_mode, integer, text) from public, anon;
grant execute on function public.set_strategy_mode(uuid, public.trade_mode, integer, text) to authenticated, service_role;
