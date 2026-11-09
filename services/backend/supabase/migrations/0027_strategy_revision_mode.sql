-- 0027: make `mode` part of the strategy revision history and of conflict details.
--
-- 0026 made a practice/real flip bump `rev`, but `strategy_revisions` only stored name/status/settings, so a
-- mode-only revision looked identical to its parent and `strategy_conflict_detail()` reported an empty
-- changed_fields for a writer that lost the race against a mode flip. The column is additive; historical rows
-- are all practice in this phase, so the default backfills them correctly.

alter table public.strategy_revisions
  add column if not exists mode public.trade_mode not null default 'practice';

create or replace function public.strategies_record_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.rev <> old.rev then
    insert into public.strategy_revisions (strategy_id, rev, name, status, mode, settings, changed_by, changed_via, device)
    values (new.id, new.rev, new.name, new.status, new.mode, new.settings,
            nullif(current_setting('centurion.actor', true), '')::uuid,
            nullif(current_setting('centurion.via', true), ''),
            nullif(current_setting('centurion.device', true), ''))
    on conflict do nothing;
  end if;
  return null;
end $$;

-- 409 body for a stale strategy write: {current_rev, changed_fields, changed_by, changed_at, current}
create or replace function public.strategy_conflict_detail(s public.strategies, p_base_rev integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'current_rev', s.rev,
    'base_rev', p_base_rev,
    'changed_fields', to_jsonb(
        public.jsonb_changed_keys(b.settings, s.settings)
        || case when b.name is distinct from s.name then array['name'] else '{}' end
        || case when b.status is distinct from s.status then array['status'] else '{}' end
        || case when b.mode is distinct from s.mode then array['mode'] else '{}' end),
    'changed_by', jsonb_build_object('actor', l.changed_by, 'via', l.changed_via, 'device', l.device),
    'changed_at', to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'current', jsonb_build_object('id', s.id, 'rev', s.rev, 'name', s.name, 'status', s.status,
                                  'mode', s.mode, 'settings', s.settings))
  from (select 1) one
  left join public.strategy_revisions b on b.strategy_id = s.id and b.rev = p_base_rev
  left join public.strategy_revisions l on l.strategy_id = s.id and l.rev = s.rev
$$;
