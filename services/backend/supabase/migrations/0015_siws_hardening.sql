-- SIWS hardening (review B-3, B-4, B-5, B-7).
-- B-3/B-7: the nonce row stores every message field the server put into the message; verify compares all of them.
alter table public.siws_nonces
  add column uri text check (uri is null or length(uri) <= 2048),
  add column chain_id text check (chain_id is null or chain_id ~ '^[a-z0-9:-]{1,32}$'),
  add column statement_version smallint not null default 1 check (statement_version between 1 and 99);

create or replace function public.consume_siws_nonce(
  p_nonce text, p_address text, p_domain text, p_uri text, p_chain_id text,
  p_issued_at timestamptz, p_expires_at timestamptz, p_statement_version integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.siws_nonces set consumed_at = now()
   where nonce = p_nonce and address = p_address and domain = p_domain
     and uri = p_uri and chain_id = p_chain_id
     and issued_at = p_issued_at and expires_at = p_expires_at
     and statement_version = p_statement_version
     and consumed_at is null and expires_at > now();
  if found then return true; end if;
  -- any mismatch burns the nonce for that address (fail closed: a tampered message spends it)
  update public.siws_nonces set consumed_at = now() where nonce = p_nonce and address = p_address and consumed_at is null;
  return false;
end $$;
revoke execute on function public.consume_siws_nonce(text, text, text, text, text, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_siws_nonce(text, text, text, text, text, timestamptz, timestamptz, integer) to service_role;
-- the 3-field form no longer serves the API
revoke execute on function public.consume_siws_nonce(text, text, text) from service_role;

-- B-4: link each rotated token to its successor; a replay of the just-rotated token inside the grace window gets
-- the same successor back (the API re-derives it: successor = HMAC(server key, presented token)), no revocation.
alter table public.auth_refresh_tokens add column replaced_by uuid references public.auth_refresh_tokens (id) on delete set null;

drop function public.rotate_refresh_token(bytea, bytea, integer);
-- Returns {user_id, family_id, client, address, issued_at (epoch s of the successor), grace}
-- or {error: 'refresh_reused', family_id} after revoking the family. Errors: UNAUTHENTICATED {reason}.
create or replace function public.rotate_refresh_token(p_old_sha bytea, p_new_sha bytea, p_ttl_s integer, p_grace_s integer default 10)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.auth_refresh_tokens;
  s public.auth_refresh_tokens;
  addr text;
  is_grace boolean := false;
begin
  if p_grace_s < 0 or p_grace_s > 60 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"grace_s"}';
  end if;
  select * into t from public.auth_refresh_tokens where token_sha256 = p_old_sha for update;
  if not found then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0401', detail = '{"reason":"refresh_invalid"}';
  end if;
  if t.used_at is not null and t.revoked_at is null then
    select * into s from public.auth_refresh_tokens where id = t.replaced_by;
    if found and s.token_sha256 = p_new_sha and s.revoked_at is null and s.expires_at > now()
       and clock_timestamp() - t.used_at <= make_interval(secs => p_grace_s) then
      is_grace := true;                                   -- parallel refresh: same successor, no revocation
    else
      update public.auth_refresh_tokens set revoked_at = now(), revoke_reason = 'rotated_reuse'
       where family_id = t.family_id and revoked_at is null;
      insert into public.audit_log (actor_user, actor_kind, actor_via, action, target_type, target)
      values (t.user_id, 'system', 'api', 'session.refresh_reuse', 'session', t.family_id::text);
      return jsonb_build_object('error', 'refresh_reused', 'family_id', t.family_id);
    end if;
  elsif t.revoked_at is not null or t.expires_at <= now() then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0401',
      detail = jsonb_build_object('reason', case when t.revoked_at is not null then 'refresh_revoked' else 'refresh_expired' end)::text;
  else
    insert into public.auth_refresh_tokens (family_id, user_id, token_sha256, client, created_at, expires_at)
    values (t.family_id, t.user_id, p_new_sha, t.client, date_trunc('second', clock_timestamp()),
            date_trunc('second', clock_timestamp()) + make_interval(secs => p_ttl_s))
    returning * into s;
    update public.auth_refresh_tokens set used_at = clock_timestamp(), replaced_by = s.id where id = t.id;
  end if;
  select subject into addr from public.auth_identities where user_id = t.user_id and provider = 'siws'
   order by last_used_at desc nulls last limit 1;
  return jsonb_build_object('user_id', t.user_id, 'family_id', t.family_id, 'client', t.client, 'address', addr,
    'issued_at', extract(epoch from s.created_at)::bigint, 'grace', is_grace);
end $$;
revoke execute on function public.rotate_refresh_token(bytea, bytea, integer, integer) from public, anon, authenticated;
grant execute on function public.rotate_refresh_token(bytea, bytea, integer, integer) to service_role;

-- B-5: access tokens carry sid (= refresh family). Each API request checks it in the same statement that sets the
-- request claims; logout / reuse revocation therefore ends the access token at once.
create index if not exists auth_refresh_tokens_family_live_idx on public.auth_refresh_tokens (family_id) where revoked_at is null;
create or replace function public.session_check(p_sid uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_sid is null then return true; end if;              -- tokens without sid (not issued by SIWS login)
  if not exists (select 1 from public.auth_refresh_tokens where family_id = p_sid and revoked_at is null) then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0401', detail = '{"reason":"session_revoked"}';
  end if;
  return true;
end $$;
revoke execute on function public.session_check(uuid) from public, anon;
grant execute on function public.session_check(uuid) to authenticated, service_role;
