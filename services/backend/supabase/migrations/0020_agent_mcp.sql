-- MCP agent access (services/backend/docs/MCP_DESIGN.md). Practice only.
-- OAuth 2.1 clients / authorization requests / grants / rotating refresh tokens, the per-workspace agent
-- settings (trade toggle, buys pause), and server-side enforcement that does not depend on the tool list:
--   * an agent can never PROPOSE a guard loosening      -> 403 LOOSEN_REQUIRES_APP (no row is created)
--   * buy_pick approvals are refused while buys are paused -> 409 BUYS_PAUSED
--   * every event / audit row written by an agent call carries source=agent + grant/client (attribution)
-- All tables are service_role only (the API reads/writes them as service); RLS on, no policies.

create table public.agent_clients (
  client_id     text primary key check (client_id ~ '^ac_[A-Za-z0-9_-]{16,64}$'),
  client_name   text not null check (length(client_name) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  registration  text not null check (registration in ('dcr', 'pre')),
  status        text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  owner_user    uuid references public.users (id) on delete cascade,
  workspace_id  uuid references public.workspaces (id),
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  check (status = 'pending' or owner_user is not null)
);

create table public.agent_auth_requests (
  id              uuid primary key default gen_random_uuid(),
  client_id       text not null references public.agent_clients (client_id) on delete cascade,
  redirect_uri    text not null,
  code_challenge  text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  scopes          text[] not null,
  resource        text not null,
  state           text check (length(state) <= 512),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'used', 'expired')),
  user_id         uuid references public.users (id) on delete cascade,
  workspace_id    uuid references public.workspaces (id),
  granted_scopes  text[],
  grant_id        uuid,
  code_sha256     bytea unique check (code_sha256 is null or length(code_sha256) = 32),
  code_expires_at timestamptz,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '10 minutes'
);

create table public.agent_grants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id),
  client_id     text not null references public.agent_clients (client_id) on delete cascade,
  client_name   text not null,
  scopes        text[] not null check (scopes <@ array['read', 'control', 'trade']::text[] and 'read' = any (scopes)),
  status        text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  created_at    timestamptz not null default now(),
  -- re-consent every 90 days (lead answer Q7)
  expires_at    timestamptz not null default now() + interval '90 days',
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  revoke_reason text check (revoke_reason in ('user', 'disconnect_all', 'refresh_reuse', 'refused_attempts', 'client_revoke', 'expired')),
  check (expires_at <= created_at + interval '90 days')
);
create index agent_grants_user_idx on public.agent_grants (user_id, status);

create table public.agent_refresh_tokens (
  id           uuid primary key default gen_random_uuid(),
  grant_id     uuid not null references public.agent_grants (id) on delete cascade,
  token_sha256 bytea not null unique check (length(token_sha256) = 32),
  dpop_jkt     text,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  revoked_at   timestamptz
);
create index agent_refresh_tokens_grant_idx on public.agent_refresh_tokens (grant_id);

-- DPoP proof `jti` replay cache (RFC 9449 section 11.1).
create table public.agent_dpop_jti (
  jti        text primary key check (length(jti) between 8 and 128),
  expires_at timestamptz not null
);

-- Per-workspace agent switches. trade_enabled: the in-app toggle (default off). buys_paused: Stop (rev4).
create table public.agent_settings (
  workspace_id    uuid primary key references public.workspaces (id),
  trade_enabled   boolean not null default false,
  buys_paused     boolean not null default false,
  buys_paused_via text check (buys_paused_via in ('web', 'mobile', 'desktop', 'mcp', 'push')),
  buys_paused_by  uuid,
  buys_paused_at  timestamptz,
  rev             integer not null default 1 check (rev >= 1),
  updated_at      timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['agent_clients', 'agent_auth_requests', 'agent_grants', 'agent_refresh_tokens',
                           'agent_dpop_jti', 'agent_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Agent context from the verified JWT of the current request (set by the API, never by a body).
create or replace function public.request_agent()
returns jsonb language sql stable as $$
  select case when (c ->> 'centurion_client') = 'mcp' and jsonb_typeof(c -> 'agent') = 'object'
              then jsonb_build_object('source', 'agent', 'via', 'mcp',
                                      'grant_id', c -> 'agent' ->> 'grant_id',
                                      'client_id', c -> 'agent' ->> 'client_id')
              else null end
    from (select nullif(current_setting('request.jwt.claims', true), '')::jsonb as c) x
$$;

create or replace function public.request_agent_name()
returns text language sql stable as $$
  select left(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'agent' ->> 'client_name', 100)
$$;

-- An OAuth-connected agent (request_agent() set by /mcp dispatch) can never propose a loosening: LOOSEN_REQUIRES_APP.
-- Fires before 0016's approvals_no_agent_loosening (trigger order is by name); other mcp-channel requests keep
-- the contracts 1.1.5 answer from that trigger (FORBIDDEN_ROLE agent_cannot_loosen).
create or replace function public.approvals_agent_loosen_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'guard_change' and new.weakening and public.request_agent() is not null then
    raise exception using errcode = 'P0403', message = 'LOOSEN_REQUIRES_APP',
      detail = '{"reason":"agent_cannot_loosen","hint":"guard loosening can only be proposed from the Centurion Trade app"}';
  end if;
  return new;
end $$;
drop trigger if exists approvals_agent_loosen_guard on public.approvals;
create trigger approvals_agent_loosen_guard before insert on public.approvals
  for each row execute function public.approvals_agent_loosen_guard();

-- Stop = pause new buys: no buy_pick may be approved while paused (any channel).
create or replace function public.approvals_buys_paused_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'buy_pick' and new.status = 'approved' and old.status = 'pending'
     and exists (select 1 from public.agent_settings s where s.workspace_id = new.workspace_id and s.buys_paused) then
    raise exception using errcode = 'P0409', message = 'BUYS_PAUSED',
      detail = '{"hint":"buys are paused; resume buys first"}';
  end if;
  return new;
end $$;
drop trigger if exists approvals_buys_paused_guard on public.approvals;
create trigger approvals_buys_paused_guard before update of status on public.approvals
  for each row execute function public.approvals_buys_paused_guard();

-- Attribution: events and audit rows written during an agent call carry source=agent + grant/client.
-- The client name is third-party text (from registration), so on events it goes to `untrusted`.
create or replace function public.events_agent_context() returns trigger
language plpgsql set search_path = '' as $$
declare a jsonb := public.request_agent();
begin
  if a is not null then
    new.payload := new.payload || jsonb_build_object('agent', a);
    new.untrusted := new.untrusted || jsonb_build_object('agent_client_name', public.request_agent_name());
  end if;
  return new;
end $$;
drop trigger if exists events_agent_context on public.events;
create trigger events_agent_context before insert on public.events
  for each row execute function public.events_agent_context();

create or replace function public.audit_log_agent_context() returns trigger
language plpgsql set search_path = '' as $$
declare a jsonb := public.request_agent();
begin
  if a is not null then
    new.actor_via := 'mcp';
    new.risk := coalesce(new.risk, '{}'::jsonb)
      || jsonb_build_object('agent', a || jsonb_build_object('client_name', public.request_agent_name()));
  end if;
  return new;
end $$;
drop trigger if exists audit_log_agent_context on public.audit_log;
create trigger audit_log_agent_context before insert on public.audit_log
  for each row execute function public.audit_log_agent_context();

revoke execute on function public.request_agent() from public, anon;
revoke execute on function public.request_agent_name() from public, anon;
grant execute on function public.request_agent() to authenticated, service_role;
grant execute on function public.request_agent_name() to authenticated, service_role;
