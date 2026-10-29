-- Single-owner bootstrap: SIWS login creates (or finds) the user and the owner's workspace, idempotently.
-- Production creates the auth user through the Supabase admin API (the API passes its id as p_user);
-- the direct auth.users insert is only used when the API runs with AUTH_USER_CREATE=direct (local tests).

create or replace function public.siws_find_user(p_address text)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.auth_identities where provider = 'siws' and subject = p_address
$$;

drop function if exists public.siws_login(text);
create or replace function public.siws_login(p_address text, p_user uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not public.is_base58_address(p_address) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"address"}';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('siws:' || p_address, 0));
  update public.auth_identities set last_used_at = now(), verified_at = coalesce(verified_at, now())
   where provider = 'siws' and subject = p_address
  returning user_id into uid;
  if uid is null then
    if p_user is null then
      uid := gen_random_uuid();
      insert into auth.users (id) values (uid);          -- local/direct mode only; trigger creates public.users
    else
      uid := p_user;                                    -- created by the Supabase admin API
    end if;
    insert into public.users (id) values (uid) on conflict do nothing;
    insert into public.auth_identities (user_id, provider, subject, verified_at, last_used_at)
    values (uid, 'siws', p_address, now(), now());
  end if;
  if exists (select 1 from public.users where id = uid and disabled_at is not null) then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0401', detail = '{"reason":"account_disabled"}';
  end if;
  return uid;
end $$;

-- The owner's workspace: the oldest live workspace they own, else a new "Practice" one. Idempotent and
-- race-safe (per-user advisory lock). The membership row comes from the workspace_add_owner trigger.
create or replace function public.ensure_owner_workspace(p_user uuid, p_name text default 'Practice')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('owner_ws:' || p_user::text, 0));
  select id into ws from public.workspaces where owner_id = p_user and deleted_at is null order by created_at, id limit 1;
  if ws is null then
    insert into public.workspaces (name, owner_id) values (p_name, p_user) returning id into ws;
    insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target)
    values (ws, p_user, 'system', 'api', 'workspace.bootstrap', 'workspace', ws::text);
  end if;
  return ws;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['siws_find_user(text)', 'siws_login(text, uuid)', 'ensure_owner_workspace(uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
