-- Guard weakening is never applied directly (Apex, 2026-10-29). Until the 202 proposal flow lands, a strategy
-- change that weakens any guard is rejected with 409 GUARD_WEAKEN_REQUIRES_APPROVAL; strengthening-only or
-- neutral changes still apply. The classifier mirrors guard::impact::weakened_fields (Rust) over the effective
-- GuardConfig (defaults overlaid with settings.guard_checks), plus the settings-level guard keys.

-- Mirrors guard::GuardConfig::default(); crates/guard tests assert they stay equal.
create or replace function public.guard_config_defaults()
returns jsonb language sql immutable as $$
  select '{"allow_mint_authority":false,"allow_freeze_authority":false,"min_lp_safe_pct_warn":95.0,"min_lp_safe_pct_fail":50.0,"top_holders_share_pct_warn":30.0,"top_holders_share_pct_fail":50.0,"single_holder_pct_fail":20.0,"creator_share_pct_warn":5.0,"creator_share_pct_fail":15.0,"bundled_share_pct_warn":10.0,"bundled_share_pct_fail":25.0,"sniper_share_pct_warn":10.0,"sniper_share_pct_fail":30.0,"transfer_fee_bps_fail":100,"sell_tax_bps_warn":300,"sell_tax_bps_fail":1000,"serial_creator_warn":5,"creator_rug_rate_fail":0.5,"warn_score_fail":6,"require_sell_sim":true}'::jsonb
$$;

-- Effective numeric / boolean guard value: the override when it has the right JSON type, else the default.
create or replace function public.guard_num(s jsonb, k text)
returns numeric language sql immutable as $$
  select case when jsonb_typeof(s -> 'guard_checks' -> k) = 'number' then (s -> 'guard_checks' ->> k)::numeric
              else (public.guard_config_defaults() ->> k)::numeric end
$$;
create or replace function public.guard_bool(s jsonb, k text)
returns boolean language sql immutable as $$
  select case when jsonb_typeof(s -> 'guard_checks' -> k) = 'boolean' then (s -> 'guard_checks' ->> k)::boolean
              else (public.guard_config_defaults() ->> k)::boolean end
$$;

-- Fields that get less strict from p_old to p_new (empty = not a weakening). Direction table:
--   GuardConfig (via guard_checks): allow_* false->true; require_sell_sim true->false; min_lp_safe_pct_* lower;
--     *_share_pct_*, single_holder_pct_fail, serial_creator_warn, warn_score_fail: higher, or 0 (= check off)
--     from > 0; transfer_fee_bps_fail, sell_tax_bps_*, creator_rug_rate_fail: higher.
--   settings: top_holders/creator/bundled/sniper_share_pct_max higher or 0/unset (off) from > 0;
--     lp_burned_pct_min lower/unset; required_checks: any check removed.
create or replace function public.guard_weakened_fields(p_old jsonb, p_new jsonb)
returns text[] language plpgsql immutable as $$
declare
  o jsonb := coalesce(p_old, '{}');
  n jsonb := coalesce(p_new, '{}');
  out text[] := '{}';
  k text;
  a numeric;
  b numeric;
begin
  foreach k in array array['allow_mint_authority', 'allow_freeze_authority'] loop
    if public.guard_bool(n, k) and not public.guard_bool(o, k) then out := out || k; end if;
  end loop;
  foreach k in array array['min_lp_safe_pct_warn', 'min_lp_safe_pct_fail'] loop
    if public.guard_num(n, k) < public.guard_num(o, k) then out := out || k; end if;
  end loop;
  foreach k in array array['top_holders_share_pct_warn', 'top_holders_share_pct_fail', 'single_holder_pct_fail',
                           'creator_share_pct_warn', 'creator_share_pct_fail', 'bundled_share_pct_warn',
                           'bundled_share_pct_fail', 'sniper_share_pct_warn', 'sniper_share_pct_fail'] loop
    a := public.guard_num(o, k); b := public.guard_num(n, k);
    if a > 0 and (b = 0 or b > a) then out := out || k; end if;
  end loop;
  foreach k in array array['transfer_fee_bps_fail', 'sell_tax_bps_warn', 'sell_tax_bps_fail'] loop
    if public.guard_num(n, k) > public.guard_num(o, k) then out := out || k; end if;
  end loop;
  if public.guard_num(o, 'serial_creator_warn') > 0 and (public.guard_num(n, 'serial_creator_warn') = 0
       or public.guard_num(n, 'serial_creator_warn') > public.guard_num(o, 'serial_creator_warn')) then
    out := out || 'serial_creator_warn'::text;
  end if;
  if public.guard_num(n, 'creator_rug_rate_fail') > public.guard_num(o, 'creator_rug_rate_fail') then
    out := out || 'creator_rug_rate_fail'::text;
  end if;
  if public.guard_num(o, 'warn_score_fail') > 0 and (public.guard_num(n, 'warn_score_fail') = 0
       or public.guard_num(n, 'warn_score_fail') > public.guard_num(o, 'warn_score_fail')) then
    out := out || 'warn_score_fail'::text;
  end if;
  if public.guard_bool(o, 'require_sell_sim') and not public.guard_bool(n, 'require_sell_sim') then
    out := out || 'require_sell_sim'::text;
  end if;
  -- settings-level guard keys (0 / unset = off)
  foreach k in array array['top_holders_share_pct_max', 'creator_share_pct_max', 'bundled_share_pct_max',
                           'sniper_share_pct_max'] loop
    a := case when jsonb_typeof(o -> k) = 'number' then (o ->> k)::numeric else 0 end;
    b := case when jsonb_typeof(n -> k) = 'number' then (n ->> k)::numeric else 0 end;
    if a > 0 and (b = 0 or b > a) then out := out || k; end if;
  end loop;
  a := case when jsonb_typeof(o -> 'lp_burned_pct_min') = 'number' then (o ->> 'lp_burned_pct_min')::numeric else 0 end;
  b := case when jsonb_typeof(n -> 'lp_burned_pct_min') = 'number' then (n ->> 'lp_burned_pct_min')::numeric else 0 end;
  if b < a then out := out || 'lp_burned_pct_min'::text; end if;
  if jsonb_typeof(o -> 'required_checks') = 'array' and exists (
       select 1 from jsonb_array_elements_text(o -> 'required_checks') x
        where jsonb_typeof(n -> 'required_checks') is distinct from 'array'
           or not (n -> 'required_checks') ? x) then
    out := out || 'required_checks'::text;
  end if;
  return out;
end $$;

create or replace function public.update_strategy(
  p_strategy uuid, p_expected_rev integer, p_patch jsonb default null, p_name text default null,
  p_status public.strategy_status default null, p_device text default null, p_challenge_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.strategies;
  v_actor uuid := auth.uid();
  v_settings jsonb;
  v_weak text[];
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
      -- Returned shape = the REST error body: {"error":{"code","message",...conflict details,"server_now"}} -> HTTP 409.
      update public.confirmation_challenges set used_at = coalesce(used_at, now()) where id = p_challenge_id;
      return jsonb_build_object('error', jsonb_build_object(
               'code', 'CONFIRMATION_RESTART_REQUIRED',
               'message', 'Resource changed under a Real SOL confirmation; the full confirmation must be redone',
               'server_now', now()) || public.strategy_conflict_detail(s, p_expected_rev));
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
  -- Guard weakening never applies directly: it must go through a guard_change proposal + approval.
  if p_patch is not null then
    v_weak := public.guard_weakened_fields(s.settings, v_settings);
    if cardinality(v_weak) > 0 then
      raise exception using errcode = 'P0409', message = 'GUARD_WEAKEN_REQUIRES_APPROVAL',
        detail = jsonb_build_object('weakened_fields', to_jsonb(v_weak), 'strategy_id', s.id, 'rev', s.rev,
                                    'hint', 'submit the change as a guard_change proposal')::text;
    end if;
  end if;
  perform set_config('centurion.actor', coalesce(v_actor::text, ''), true);
  perform set_config('centurion.via', public.request_via(), true);
  perform set_config('centurion.device', coalesce(p_device, ''), true);
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

revoke execute on function public.guard_weakened_fields(jsonb, jsonb) from public, anon;
grant execute on function public.guard_weakened_fields(jsonb, jsonb) to authenticated, service_role;
