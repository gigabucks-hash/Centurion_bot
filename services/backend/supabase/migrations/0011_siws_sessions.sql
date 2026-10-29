-- SIWS-only login for the single-owner app: identity upsert and rotating refresh tokens.
-- The API verifies the ed25519 signature (public key = the address); nothing here holds keys or signs.

-- Refresh tokens: opaque, stored as sha256 only, single use. Each use rotates to a new token in the same family;
-- presenting a used (rotated) token again revokes the whole family (theft signal).
create table public.auth_refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null,
  user_id      uuid not null references public.users (id) on delete cascade,
  token_sha256 bytea not null unique check (length(token_sha256) = 32),
  client       text not null check (client in ('web', 'mobile', 'desktop')),
  provider     public.auth_provider not null default 'siws',
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  revoked_at   timestamptz,
  revoke_reason text check (revoke_reason in ('rotated_reuse', 'logout', 'owner_removed')),
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);
create index auth_refresh_tokens_family_idx on public.auth_refresh_tokens (family_id);
create index auth_refresh_tokens_user_idx on public.auth_refresh_tokens (user_id) where revoked_at is null;
alter table public.auth_refresh_tokens enable row level security;
revoke all on public.auth_refresh_tokens from anon, authenticated;

-- Find or create the user behind a SIWS address (called only after the API checked nonce + signature).
create or replace function public.siws_login(p_address text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not public.is_base58_address(p_address) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"address"}';
  end if;
  update public.auth_identities set last_used_at = now(), verified_at = coalesce(verified_at, now())
   where provider = 'siws' and subject = p_address
  returning user_id into uid;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (id) values (uid);            -- trigger creates public.users
    insert into public.users (id) values (uid) on conflict do nothing;
    insert into public.auth_identities (user_id, provider, subject, verified_at, last_used_at)
    values (uid, 'siws', p_address, now(), now());
  end if;
  if exists (select 1 from public.users where id = uid and disabled_at is not null) then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0401', detail = '{"reason":"account_disabled"}';
  end if;
  return uid;
end $$;

create or replace function public.issue_refresh_token(p_user uuid, p_family uuid, p_sha bytea, p_client text, p_ttl_s integer)
returns void language sql security definer set search_path = public as $$
  insert into public.auth_refresh_tokens (family_id, user_id, token_sha256, client, expires_at)
  values (coalesce(p_family, gen_random_uuid()), p_user, p_sha, p_client, now() + make_interval(secs => p_ttl_s))
$$;

-- Rotate: consume the presented token and issue its successor in the same family.
-- Returns {user_id, family_id, client, address}. Errors: UNAUTHENTICATED {reason}.
create or replace function public.rotate_refresh_token(p_old_sha bytea, p_new_sha bytea, p_ttl_s integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.auth_refresh_tokens;
  addr text;
begin
  select * into t from public.auth_refresh_tokens where token_sha256 = p_old_sha for update;
  if not found then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0401', detail = '{"reason":"refresh_invalid"}';
  end if;
  if t.used_at is not null and t.revoked_at is null then
    -- a rotated token came back: revoke the whole family
    update public.auth_refresh_tokens set revoked_at = now(), revoke_reason = 'rotated_reuse'
     where family_id = t.family_id and revoked_at is null;
    insert into public.audit_log (actor_user, actor_kind, actor_via, action, target_type, target)
    values (t.user_id, 'system', 'api', 'session.refresh_reuse', 'session', t.family_id::text);
    return jsonb_build_object('error', 'refresh_reused', 'family_id', t.family_id);
  end if;
  if t.revoked_at is not null or t.used_at is not null or t.expires_at <= now() then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0401',
      detail = jsonb_build_object('reason', case when t.revoked_at is not null then 'refresh_revoked' else 'refresh_expired' end)::text;
  end if;
  update public.auth_refresh_tokens set used_at = now() where id = t.id;
  insert into public.auth_refresh_tokens (family_id, user_id, token_sha256, client, expires_at)
  values (t.family_id, t.user_id, p_new_sha, t.client, now() + make_interval(secs => p_ttl_s));
  select subject into addr from public.auth_identities where user_id = t.user_id and provider = 'siws'
   order by last_used_at desc nulls last limit 1;
  return jsonb_build_object('user_id', t.user_id, 'family_id', t.family_id, 'client', t.client, 'address', addr);
end $$;

-- Revoke a session family (logout or owner allowlist removal).
create or replace function public.revoke_refresh_family(p_sha bytea, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  select family_id into f from public.auth_refresh_tokens where token_sha256 = p_sha;
  if f is null then return false; end if;
  update public.auth_refresh_tokens set revoked_at = now(), revoke_reason = p_reason
   where family_id = f and revoked_at is null;
  return true;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['siws_login(text)', 'issue_refresh_token(uuid, uuid, bytea, text, integer)',
                            'rotate_refresh_token(bytea, bytea, integer)', 'revoke_refresh_family(bytea, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
grant execute on function public.consume_siws_nonce(text, text, text) to service_role;
