-- =============================================================================
-- solbot — 0001_init.sql (Phase 1 schema, incl. Apex/UX/Web scope additions)
-- Target: Supabase Postgres 15+ (verified locally on Postgres 17.11 with a shim
-- for auth.uid()/roles, see supabase/tests/00_local_shim.sql).
--
-- Invariants enforced in the database (defence in depth, not the state machine):
--   * practice only: every mode column (workspaces, strategies, picks, positions, fills,
--     events, approvals, portfolios, snapshots, funnel, guard_changes, audit_log) = 'practice', fills.simulated = true, wallets.is_active = false. Phase 7 drops
--     these in a separate, Boss-approved migration.
--   * no key material anywhere: wallets store a custody provider reference.
--   * money on the wire and at rest: lamports as bigint, token amounts as raw
--     integer base units (numeric(39,0)), prices numeric. No float columns.
--   * events, fills, portfolio_snapshots, audit_log are append-only.
--   * events double as the transactional OUTBOX: state change + event rows are
--     written in the same transaction; publishers tail events by seq.
--   * state TRANSITIONS are owned by the worker/API (they call the functions
--     below inside one transaction); triggers only reject illegal transitions.
--   * strategies.settings validated by CHECK (strategy_settings_valid()).
--   * RLS on every table, scoped to workspace membership; pipeline tables are
--     written only by the backend (service_role).
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- Mode separation (contract v1): practice = paper SOL, real = Real SOL (rejected until Phase 7).
create type public.trade_mode          as enum ('practice', 'real');
create type public.workspace_role      as enum ('owner', 'admin', 'trader', 'viewer');
create type public.strategy_status     as enum ('draft', 'running', 'paused', 'archived', 'deleted');
create type public.pick_stage          as enum ('found', 'rejected', 'blocked', 'passed', 'awaiting_approval',
                                                'armed', 'expired', 'bought', 'closed');
create type public.position_status     as enum ('open', 'closed');
create type public.fill_side           as enum ('buy', 'sell');
create type public.exit_reason         as enum ('sell_floor', 'profit_target', 'loss_guard', 'peak_trail', 'max_hold',
                                                'idle', 'sell_pressure', 'no_new_high', 'rug_detected', 'drawdown_halt',
                                                'manual', 'strategy_retired', 'practice_reset');
-- contract v1 (packages/contracts/EVENTS_SCHEMA.md): execution progress lives on picks/jobs, not here
create type public.approval_kind       as enum ('buy_pick', 'guard_change', 'team_action');
create type public.approval_status     as enum ('pending', 'approved', 'rejected', 'expired');
create type public.decided_via         as enum ('web', 'mobile', 'desktop', 'mcp', 'push');
create type public.expire_reason       as enum ('timeout', 'strategy_deleted', 'strategy_archived',
                                                'guard_failed', 'price_moved', 'practice_reset', 'account_deleted');
create type public.job_status          as enum ('queued', 'running', 'done', 'failed', 'dead');
create type public.event_actor         as enum ('ingest', 'screener', 'guard', 'entry', 'executor', 'exit',
                                                'user', 'system');
create type public.auth_provider       as enum ('google', 'apple', 'telegram', 'email', 'siws');
create type public.portfolio_autonomy  as enum ('ask', 'limits', 'full');
create type public.guard_change_status as enum ('requested', 'cooling_down', 'applied', 'cancelled',
                                                'reverted', 'rejected', 'expired');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_base58_address(s text)
returns boolean language sql immutable as $$
  select s ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only (% blocked)', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end $$;

-- jsonb field checks: absent/null keys are allowed (defaults apply in the engine)
create or replace function public.jnum_ok(s jsonb, k text, lo numeric, hi numeric)
returns boolean language sql immutable as $$
  select case
    when s -> k is null or jsonb_typeof(s -> k) = 'null' then true
    when jsonb_typeof(s -> k) <> 'number' then false
    else (s ->> k)::numeric between lo and hi
  end
$$;

create or replace function public.jbool_ok(s jsonb, k text)
returns boolean language sql immutable as $$
  select s -> k is null or jsonb_typeof(s -> k) in ('boolean', 'null')
$$;

-- Validates strategy settings (blueprint "52 key" settings + our `rules`).
-- Raises check_violation with a precise message so API errors are actionable.
create or replace function public.strategy_settings_valid(s jsonb)
returns boolean language plpgsql immutable as $$
-- GENERATED by scripts/gen_settings.py (settings v1.1, snake_case). Do not edit by hand.
declare
  allowed constant text[] := array['age_minutes_max','age_minutes_min','approval_mode','avoid_practice_overlap','bankroll_lamports','bundled_share_pct_max','buy_to_sell_ratio_min','change_1h_pct_max','change_1h_pct_min','change_1h_pct_preferred_high','change_1h_pct_preferred_low','creator_share_pct_max','deterministic_only','entry_discount_pct','entry_hours_utc','entry_weekdays_utc','exit_preset','exit_rules','guard_checks','holder_count_min','idle_exit_seconds','liquidity_usd_min','liveness_gate','lp_burned_pct_min','max_concurrent_positions','max_pool_impact_pct','mcap_usd_max','mcap_usd_min','name','observe_before_entry_minutes','off_high_pct_max','one_minute_dump_pct_max','peak_trail_pct','practice_drawdown_halt_pct','profit_targets','range_break_entry','real_drawdown_halt_pct','reentry','required_checks','revisit_after_move_pct','score_threshold','screen_rules','sell_floors','sell_pressure_exit','since_migration_seconds_min','skip_if_risen_pct','sniper_share_pct_max','stop_loss_pct','ticket_lamports','top_holders_share_pct_max','unique_buyers_1h_min','venues','volume_24h_usd_min','volume_to_mcap_1h_max','volume_to_mcap_1h_min'];
  exit_presets constant text[] := array['momentum_trail','principal_recovery','double_out','three_step_ladder','peak_giveback','trail_stop_only','incremental_trim','fast_half','fixed_thirty','new_high_timeout','ratchet','tightening_trail','geometric_ladder'];
  required_checks constant text[] := array['liquidity_usd','volume_24h_usd','mcap_usd','age_minutes_min','age_minutes_max','top_holders_share_pct','lp_burned_pct'];
  k text;
  bad text;
  e jsonb;
begin
  if s is null or jsonb_typeof(s) <> 'object' then
    raise exception 'settings must be a JSON object' using errcode = 'check_violation';
  end if;
  select string_agg(x, ', ') into bad from jsonb_object_keys(s) x where not (x = any (allowed));
  if bad is not null then
    raise exception 'unknown settings key(s): %', bad using errcode = 'check_violation';
  end if;
  if s ? 'name' and (jsonb_typeof(s -> 'name') <> 'string' or length(s ->> 'name') not between 1 and 60) then
    raise exception 'name must be a string of 1-60 chars' using errcode = 'check_violation';
  end if;
  -- percentages, ratios, counts, USD: JSON numbers in [lo, hi]
  for k, bad in
    select r[1], r[2] || '..' || r[3] from (values
      (array['max_concurrent_positions','1','20']),
      (array['max_pool_impact_pct','0','100']),
      (array['real_drawdown_halt_pct','0','100']),
      (array['practice_drawdown_halt_pct','0','100']),
      (array['age_minutes_min','0','525600']),
      (array['age_minutes_max','0','525600']),
      (array['since_migration_seconds_min','0','86400']),
      (array['mcap_usd_min','0','1000000000000.0']),
      (array['mcap_usd_max','0','1000000000000.0']),
      (array['liquidity_usd_min','0','1000000000000.0']),
      (array['volume_24h_usd_min','0','1000000000000.0']),
      (array['holder_count_min','0','10000000.0']),
      (array['unique_buyers_1h_min','0','1000000.0']),
      (array['buy_to_sell_ratio_min','0','1000']),
      (array['top_holders_share_pct_max','0','100']),
      (array['lp_burned_pct_min','0','100']),
      (array['volume_to_mcap_1h_min','0','1000']),
      (array['volume_to_mcap_1h_max','0','1000']),
      (array['change_1h_pct_min','-100','100000']),
      (array['change_1h_pct_max','-100','100000']),
      (array['change_1h_pct_preferred_low','-100','100000']),
      (array['change_1h_pct_preferred_high','-100','100000']),
      (array['off_high_pct_max','0','100']),
      (array['one_minute_dump_pct_max','0','99']),
      (array['score_threshold','50','125']),
      (array['revisit_after_move_pct','0','10000']),
      (array['creator_share_pct_max','0','100']),
      (array['bundled_share_pct_max','0','100']),
      (array['sniper_share_pct_max','0','100']),
      (array['entry_discount_pct','0','50']),
      (array['observe_before_entry_minutes','0','60']),
      (array['skip_if_risen_pct','0','10000']),
      (array['stop_loss_pct','0','49']),
      (array['peak_trail_pct','0','49']),
      (array['idle_exit_seconds','5','3600'])
    ) v(r)
  loop
    if not public.jnum_ok(s, k, split_part(bad, '..', 1)::numeric, split_part(bad, '..', 2)::numeric) then
      raise exception 'settings.% must be a number in [%]', k, bad using errcode = 'check_violation';
    end if;
  end loop;
  if s ? 'max_concurrent_positions'
     and (s ->> 'max_concurrent_positions')::numeric <> trunc((s ->> 'max_concurrent_positions')::numeric) then
    raise exception 'settings.max_concurrent_positions must be an integer' using errcode = 'check_violation';
  end if;
  foreach k in array array['stop_loss_pct', 'peak_trail_pct'] loop
    if (s ->> k)::numeric between 0.000001 and 4.999999 then
      raise exception 'settings.% must be 0 (off) or 5-49', k using errcode = 'check_violation';
    end if;
  end loop;
  -- SOL amounts: lamports as integer strings
  foreach k in array array['bankroll_lamports','ticket_lamports'] loop
    if s ? k and (jsonb_typeof(s -> k) <> 'string' or (s ->> k) !~ '^[1-9][0-9]{0,17}$') then
      raise exception 'settings.% must be a lamports integer string', k using errcode = 'check_violation';
    end if;
  end loop;
  if (s ->> 'bankroll_lamports')::numeric > 100000000000000 or (s ->> 'ticket_lamports')::numeric > 1000000000000
     or (s ->> 'ticket_lamports')::numeric < 1000000 then
    raise exception 'settings lamports out of range (ticket 0.001-1000 SOL, bankroll <= 100000 SOL)' using errcode = 'check_violation';
  end if;
  if (s ->> 'ticket_lamports')::numeric > (s ->> 'bankroll_lamports')::numeric then
    raise exception 'settings.ticket_lamports must be <= bankroll_lamports' using errcode = 'check_violation';
  end if;
  if (s ->> 'mcap_usd_min')::numeric > (s ->> 'mcap_usd_max')::numeric
     or (s ->> 'age_minutes_min')::numeric > (s ->> 'age_minutes_max')::numeric
     or (s ->> 'volume_to_mcap_1h_min')::numeric > (s ->> 'volume_to_mcap_1h_max')::numeric
     or (s ->> 'change_1h_pct_preferred_low')::numeric > (s ->> 'change_1h_pct_preferred_high')::numeric
     or (s ->> 'change_1h_pct_min')::numeric > (s ->> 'change_1h_pct_max')::numeric then
    raise exception 'settings min/max pair is inverted' using errcode = 'check_violation';
  end if;
  foreach k in array array['deterministic_only','avoid_practice_overlap'] loop
    if not public.jbool_ok(s, k) then
      raise exception 'settings.% must be boolean', k using errcode = 'check_violation';
    end if;
  end loop;
  if s ? 'venues' and (jsonb_typeof(s -> 'venues') <> 'array' or jsonb_array_length(s -> 'venues') = 0
       or exists (select 1 from jsonb_array_elements_text(s -> 'venues') x where x not in ('curve', 'amm'))) then
    raise exception 'settings.venues must be a non-empty subset of [curve, amm]' using errcode = 'check_violation';
  end if;
  if s ? 'required_checks' and (jsonb_typeof(s -> 'required_checks') <> 'array'
       or exists (select 1 from jsonb_array_elements_text(s -> 'required_checks') x where not (x = any (required_checks)))) then
    raise exception 'settings.required_checks must be a subset of %', required_checks using errcode = 'check_violation';
  end if;
  if s ? 'exit_preset' and not ((s ->> 'exit_preset') = any (exit_presets)) then
    raise exception 'settings.exit_preset must be one of %', exit_presets using errcode = 'check_violation';
  end if;
  if s ? 'profit_targets' then
    if jsonb_typeof(s -> 'profit_targets') <> 'array' or jsonb_array_length(s -> 'profit_targets') > 8 then
      raise exception 'settings.profit_targets must be an array of <= 8 targets' using errcode = 'check_violation';
    end if;
    for e in select * from jsonb_array_elements(s -> 'profit_targets') loop
      if not (e ? 'at_gain_pct' and public.jnum_ok(e, 'at_gain_pct', 0.01, 100000) and e ? 'sell_portion_pct' and public.jnum_ok(e, 'sell_portion_pct', 0.01, 100) and public.jnum_ok(e, 'giveback_pct', 0, 100)) then
        raise exception 'settings.profit_targets entry invalid: %', e using errcode = 'check_violation';
      end if;
    end loop;
  end if;
  if s ? 'exit_rules' and (jsonb_typeof(s -> 'exit_rules') <> 'object'
       or coalesce(jsonb_array_length(case when jsonb_typeof(s -> 'exit_rules' -> 'profit_targets') = 'array' then s -> 'exit_rules' -> 'profit_targets' end), 0) > 8
       or coalesce(jsonb_array_length(case when jsonb_typeof(s -> 'exit_rules' -> 'loss_guards') = 'array' then s -> 'exit_rules' -> 'loss_guards' end), 0) > 8) then
    raise exception 'settings.exit_rules allows <= 8 profit_targets and <= 8 loss_guards' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(s -> 'exit_rules' -> 'loss_guards') = 'array' then
    for e in select * from jsonb_array_elements(s -> 'exit_rules' -> 'loss_guards') loop
      if jsonb_typeof(e) <> 'object' or exists (select 1 from jsonb_object_keys(e) x where x not in ('at_loss_pct', 'sell_portion_pct'))
         or not (e ? 'at_loss_pct' and public.jnum_ok(e, 'at_loss_pct', 1, 99) and e ? 'sell_portion_pct' and public.jnum_ok(e, 'sell_portion_pct', 0.01, 100)) then
        raise exception 'settings.exit_rules.loss_guards entry invalid: %', e using errcode = 'check_violation';
      end if;
    end loop;
  elsif s -> 'exit_rules' ? 'loss_guards' and jsonb_typeof(s -> 'exit_rules' -> 'loss_guards') <> 'null' then
    raise exception 'settings.exit_rules.loss_guards must be an array' using errcode = 'check_violation';
  end if;
  if s ? 'entry_weekdays_utc' and jsonb_typeof(s -> 'entry_weekdays_utc') <> 'null'
     and (jsonb_typeof(s -> 'entry_weekdays_utc') <> 'array'
          or exists (select 1 from jsonb_array_elements(s -> 'entry_weekdays_utc') d
                     where jsonb_typeof(d) <> 'number' or d::text::numeric not in (0,1,2,3,4,5,6))) then
    raise exception 'settings.entry_weekdays_utc must be UTC weekdays 0-6' using errcode = 'check_violation';
  end if;
  if s ? 'approval_mode' and not ((s ->> 'approval_mode') in ('off', 'ask_first_buy', 'ask_every_buy')) then
    raise exception 'settings.approval_mode must be off | ask_first_buy | ask_every_buy' using errcode = 'check_violation';
  end if;
  if s ? 'sell_floors' and jsonb_typeof(s -> 'sell_floors') <> 'null' then
    if jsonb_typeof(s -> 'sell_floors') <> 'object'
       or exists (select 1 from jsonb_object_keys(s -> 'sell_floors') x
                  where x not in ('enabled', 'max_loss_pct', 'liquidity_drop_pct'))
       or not public.jbool_ok(s -> 'sell_floors', 'enabled')
       or not public.jnum_ok(s -> 'sell_floors', 'max_loss_pct', 1, 99)
       or not public.jnum_ok(s -> 'sell_floors', 'liquidity_drop_pct', 1, 99) then
      raise exception 'settings.sell_floors must be {enabled?, max_loss_pct 1-99, liquidity_drop_pct 1-99}'
        using errcode = 'check_violation';
    end if;
  end if;
  foreach k in array array['screen_rules','guard_checks','range_break_entry','liveness_gate','reentry','entry_hours_utc','sell_pressure_exit'] loop
    if s ? k and jsonb_typeof(s -> k) not in ('object', 'null') then
      raise exception 'settings.% must be an object or null', k using errcode = 'check_violation';
    end if;
  end loop;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Identity, auth & tenancy
-- ---------------------------------------------------------------------------
-- No FK to auth.users: after account deletion the auth user is removed and this row stays as an
-- anonymized tombstone so append-only history (events, audit_log) keeps a non-identifying actor id.
create table public.users (
  id           uuid primary key,
  display_name text check (length(display_name) <= 80),
  disabled_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- One row per login method linked to a user (Google, Apple, Telegram, email code,
-- Sign-In With Solana). Login wallet (siws subject) is NOT a trading wallet.
create table public.auth_identities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  provider     public.auth_provider not null,
  subject      text not null check (length(subject) between 1 and 255),  -- IdP sub / tg id / email / base58 pubkey
  email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+$'),
  verified_at  timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (provider, subject),
  check (provider <> 'siws' or public.is_base58_address(subject))
);
create index auth_identities_user_idx on public.auth_identities (user_id);

-- SIWS challenges: single-use nonce, 5 min TTL, bound to domain + address.
create table public.siws_nonces (
  nonce       text primary key check (nonce ~ '^[A-Za-z0-9]{16,64}$'),
  address     text not null check (public.is_base58_address(address)),
  domain      text not null check (length(domain) <= 253),
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '5 minutes',
  consumed_at timestamptz,
  check (expires_at > issued_at and expires_at <= issued_at + interval '15 minutes')
);
create index siws_nonces_expiry_idx on public.siws_nonces (expires_at) where consumed_at is null;

-- Atomically consume a nonce (returns false if unknown, expired, reused or mismatched).
create or replace function public.consume_siws_nonce(p_nonce text, p_address text, p_domain text)
returns boolean language sql as $$
  with c as (
    update public.siws_nonces set consumed_at = now()
     where nonce = p_nonce and address = p_address and domain = p_domain
       and consumed_at is null and expires_at > now()
    returning 1)
  select exists (select 1 from c)
$$;

-- Email OTP (Edge Function auth-email): 6 digits, 10 min TTL, stored as HMAC-SHA256(pepper, email|code);
-- 5 wrong attempts => locked 15 min; resend >= 60 s apart; <= 5 codes/email/hour; <= 20/IP/hour.
create table public.email_otps (
  id           uuid primary key default gen_random_uuid(),
  email_norm   text not null check (email_norm = lower(email_norm) and email_norm ~ '^[^@\s]+@[^@\s]+$'),
  code_hash    bytea not null check (length(code_hash) = 32),
  attempts     smallint not null default 0 check (attempts between 0 and 5),
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes',
  consumed_at  timestamptz,
  locked_until timestamptz,
  ip           inet,
  check (expires_at > issued_at and expires_at <= issued_at + interval '10 minutes')
);
create index email_otps_email_idx on public.email_otps (email_norm, issued_at desc);

-- WebAuthn credentials for proof-of-confirmation (public keys only).
create table public.webauthn_credentials (
  credential_id bytea primary key,
  user_id       uuid not null,            -- FK added after users exists below
  public_key    bytea not null,           -- COSE key
  sign_count    bigint not null default 0,
  transports    text[] not null default '{}',
  device_label  text check (length(device_label) <= 80),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Server-issued confirmation challenges (WebAuthn / typed confirm), single use, 2 min TTL,
-- bound to user + action + target + a hash of the exact change being confirmed.
create table public.confirmation_challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  action       text not null check (action ~ '^[a-z_.]{1,64}$'),
  target       text not null,
  payload_hash bytea not null check (length(payload_hash) = 32),
  challenge    bytea not null unique check (length(challenge) >= 16),
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '2 minutes',
  used_at      timestamptz,
  check (expires_at <= issued_at + interval '5 minutes')
);
alter table public.webauthn_credentials add foreign key (user_id) references public.users (id) on delete cascade;
alter table public.confirmation_challenges add foreign key (user_id) references public.users (id) on delete cascade;

-- Step 1+2 of proof-of-confirmation verification (API_ENDPOINTS.md 4.6): atomically consume a
-- challenge bound to (user, action, target, payload_hash). WebAuthn signature checks happen in the API.
create or replace function public.consume_confirmation_challenge(
  p_id uuid, p_user uuid, p_action text, p_target text, p_payload_hash bytea)
returns bytea
language plpgsql security definer set search_path = public as $$
declare v_challenge bytea;
begin
  update public.confirmation_challenges
     set used_at = now()
   where id = p_id and user_id = p_user and action = p_action and target = p_target
     and payload_hash = p_payload_hash and used_at is null and expires_at > now()
  returning challenge into v_challenge;
  if v_challenge is null then
    raise exception using errcode = 'P0403', message = 'CONFIRMATION_INVALID';
  end if;
  return v_challenge;
end $$;
revoke all on function public.consume_confirmation_challenge(uuid, uuid, text, text, bytea) from public;

create table public.workspaces (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null check (length(name) between 1 and 80),
  owner_id                   uuid not null references public.users (id),
  mode                       public.trade_mode not null default 'practice'
                             constraint workspaces_practice_only check (mode = 'practice'),
  practice_start_lamports       bigint not null default 30000000000 check (practice_start_lamports > 0),
  live_stop_pct              numeric(5, 2) not null default 50 check (live_stop_pct between 0 and 100),
  -- server-owned proposal TTLs (UX defaults: pick 10 min, guard change 24 h)
  pick_proposal_ttl_seconds  integer not null default 600   check (pick_proposal_ttl_seconds between 60 and 86400),
  guard_proposal_ttl_seconds integer not null default 86400 check (guard_proposal_ttl_seconds between 600 and 604800),
  deleted_at                 timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  role         public.workspace_role not null default 'viewer',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Custody reference only. Never a private key, seed or keypair file.
create table public.wallets (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  label            text not null default 'main' check (length(label) <= 40),
  pubkey           text not null check (public.is_base58_address(pubkey)),
  custody_provider text not null default 'none'
                   check (custody_provider in ('none', 'crossmint', 'turnkey', 'privy', 'kms')),
  custody_ref      text check (length(custody_ref) <= 128),
  is_active        boolean not null default false
                   constraint wallets_inactive_until_phase7 check (is_active = false),
  created_at       timestamptz not null default now(),
  unique (workspace_id, pubkey)
);

-- ---------------------------------------------------------------------------
-- Strategies & portfolios
-- ---------------------------------------------------------------------------
create table public.strategies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (length(name) between 1 and 60),
  mode          public.trade_mode not null default 'practice'
                constraint strategies_practice_only check (mode = 'practice'),
  status        public.strategy_status not null default 'draft',
  rev           integer not null default 1 check (rev >= 1),
  settings      jsonb not null default '{}'::jsonb
                constraint strategies_settings_valid check (public.strategy_settings_valid(settings)),
  first_buy_at  timestamptz,          -- null => next buy is the strategy's first (ask_first_buy)
  run_started_at timestamptz,         -- funnel default window starts here
  archived_at   timestamptz,
  deleted_at    timestamptz,          -- soft delete: proposals/events keep their FK
  created_by    uuid references public.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  check ((status = 'deleted') = (deleted_at is not null)),
  check (status <> 'archived' or archived_at is not null)
);
create index strategies_workspace_idx on public.strategies (workspace_id) where status not in ('archived', 'deleted');

create table public.strategy_twins (
  source_id    uuid not null references public.strategies (id) on delete cascade,
  twin_id      uuid not null references public.strategies (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (source_id, twin_id),
  check (source_id <> twin_id)
);

-- optimistic versioning: every settings/name change bumps rev
create or replace function public.strategies_bump_rev()
returns trigger language plpgsql as $$
begin
  if new.settings is distinct from old.settings or new.name is distinct from old.name then
    new.rev := old.rev + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger strategies_bump_rev before update on public.strategies
  for each row execute function public.strategies_bump_rev();

-- Themed portfolio (Phase 8 agent; schema now so approvals/floors line up).
create table public.portfolios (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  name                text not null check (length(name) between 1 and 60),
  mode                public.trade_mode not null default 'practice'
                      constraint portfolios_practice_only check (mode = 'practice'),
  autonomy            public.portfolio_autonomy not null default 'ask',
  bankroll_lamports     bigint not null check (bankroll_lamports > 0),
  stop_floor_lamports bigint check (stop_floor_lamports >= 0),
  trades_per_day      smallint not null default 5 check (trades_per_day between 1 and 20),
  -- same shape as strategy settings.sell_floors; default -35 % PnL / -80 % liquidity
  sell_floors         jsonb not null default '{"enabled":true,"max_loss_pct":35,"liquidity_drop_pct":80}'::jsonb
                      check (public.strategy_settings_valid(jsonb_build_object('sell_floors', sell_floors))),
  first_buy_at        timestamptz,    -- 'ask' covers the first buy too: never null-bypassed
  status              public.strategy_status not null default 'draft',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Market data (global, not tenant-scoped)
-- ---------------------------------------------------------------------------
create table public.coins (
  mint          text primary key check (public.is_base58_address(mint)),
  decimals      smallint check (decimals between 0 and 18),
  launchpad     text,
  venue         text not null check (venue in ('curve', 'amm')),
  pool_program  text check (pool_program is null or public.is_base58_address(pool_program)),
  pool_address  text check (pool_address is null or public.is_base58_address(pool_address)),
  creator       text check (creator is null or public.is_base58_address(creator)),
  first_seen_at timestamptz not null default now(),
  migrated_at   timestamptz,
  -- token-provided name/symbol/uri: never read by trading logic or LLM prompts
  untrusted     jsonb not null default '{}'::jsonb check (jsonb_typeof(untrusted) = 'object'),
  updated_at    timestamptz not null default now()
);
create trigger coins_touch before update on public.coins
  for each row execute function public.touch_updated_at();

-- Precomputed guard inputs per evaluation: powers the < 2 s guard-change replay.
create table public.guard_input_snapshots (
  id          bigint generated always as identity primary key,
  mint        text not null references public.coins (mint),
  observed_at timestamptz not null,
  venue       text not null check (venue in ('curve', 'amm')),
  metrics     jsonb not null,   -- screener CoinMetrics
  input       jsonb not null,   -- guard GuardInput
  unique (mint, observed_at)
);
create index guard_input_snapshots_time_idx on public.guard_input_snapshots (observed_at desc);

-- Labelled outcomes (job fills these 24 h after first sighting).
create table public.coin_outcomes (
  mint             text primary key references public.coins (mint),
  rugged           boolean not null,
  worst_drawdown_pct numeric(7, 2) not null,
  peak_gain_pct    numeric(12, 2) not null,
  labeled_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pipeline: picks -> positions -> fills
-- ---------------------------------------------------------------------------
create table public.picks (
  id            uuid primary key default gen_random_uuid(),
  ck            text not null unique check (ck ~ '^[a-z0-9]{1,32}$'),
  workspace_id  uuid not null,
  strategy_id   uuid not null,
  mint          text not null references public.coins (mint),
  mode          public.trade_mode not null default 'practice' constraint picks_practice_only check (mode = 'practice'),
  stage         public.pick_stage not null default 'found',
  score         numeric(7, 2),
  score_threshold     numeric(7, 2),
  checks        jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array'),
  guard         jsonb,
  guard_verdict text check (guard_verdict in ('PASS', 'WARN', 'FAIL')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (strategy_id, mint),
  foreign key (strategy_id, workspace_id) references public.strategies (id, workspace_id)
);
create index picks_ws_stage_idx on public.picks (workspace_id, stage, updated_at desc);
create trigger picks_touch before update on public.picks
  for each row execute function public.touch_updated_at();

create table public.positions (
  id               uuid primary key default gen_random_uuid(),
  position_key     text not null unique check (position_key ~ '^[a-z0-9]{1,32}\.[0-9]+$'),
  pick_id          uuid references public.picks (id),
  strategy_id      uuid references public.strategies (id),
  portfolio_id     uuid references public.portfolios (id),
  workspace_id     uuid not null references public.workspaces (id),
  mint             text not null references public.coins (mint),
  mode             public.trade_mode not null default 'practice'
                   constraint positions_practice_only check (mode = 'practice'),
  status           public.position_status not null default 'open',
  qty_raw          numeric(39, 0) not null default 0 check (qty_raw >= 0),
  sol_in_lamports  bigint not null default 0 check (sol_in_lamports >= 0),
  sol_out_lamports bigint not null default 0 check (sol_out_lamports >= 0),
  fees_lamports    bigint not null default 0 check (fees_lamports >= 0),
  entry_price_sol  numeric(38, 18),
  entry_price_usd  numeric(38, 18),
  sol_price_usd    numeric(20, 6),
  peak_price_sol   numeric(38, 18),
  exit_price_sol   numeric(38, 18),
  fee_bps          integer not null default 125 check (fee_bps between 0 and 10000),
  exit_rules       jsonb,             -- Phase 2: frozen copy of the plan-as-data (incl. sell floors)
  exit_reason      public.exit_reason,
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  check ((status = 'closed') = (closed_at is not null)),
  check (status = 'open' or exit_reason is not null),
  check (strategy_id is not null or portfolio_id is not null)
);
create index positions_ws_open_idx on public.positions (workspace_id) where status = 'open';
create index positions_closed_idx on public.positions (workspace_id, strategy_id, closed_at desc) where status = 'closed';

create table public.fills (
  id                   uuid primary key default gen_random_uuid(),
  position_id          uuid not null references public.positions (id),
  workspace_id         uuid not null references public.workspaces (id),
  mode                 public.trade_mode not null default 'practice' constraint fills_practice_only check (mode = 'practice'),
  side                 public.fill_side not null,
  simulated            boolean not null default true
                       constraint fills_simulated_only check (simulated),
  tx_sig               text,
  constraint fills_sig_consistency check ((simulated and tx_sig is null) or (not simulated and tx_sig is not null)),
  sol_lamports         bigint not null check (sol_lamports > 0),
  token_amount_raw     numeric(39, 0) not null check (token_amount_raw > 0),
  exec_price_sol       numeric(38, 18) not null check (exec_price_sol > 0),
  swap_fee_lamports    bigint not null default 0 check (swap_fee_lamports >= 0),
  network_fee_lamports bigint not null default 0 check (network_fee_lamports >= 0),
  slippage_bps         numeric(10, 2) not null default 0,
  latency_ms           integer not null default 0 check (latency_ms >= 0),
  created_at           timestamptz not null default now()
);
create index fills_position_idx on public.fills (position_id, created_at);

-- ---------------------------------------------------------------------------
-- Events = activity feed + transactional outbox
-- ---------------------------------------------------------------------------
create table public.events (
  seq          bigint generated always as identity primary key,   -- pagination / resume cursor
  id           text not null unique check (id ~ '^[A-Za-z0-9._-]{1,64}:[0-9]{1,16}:[a-z_.]{1,48}$'),  -- <subject>:<epoch ms>:<type>
  workspace_id uuid not null references public.workspaces (id),
  strategy_id  uuid,
  ck           text,
  mint         text,
  ts           timestamptz not null,
  type         text not null check (type ~ '^[a-z_]+(\.[a-z_]+)?$'),
  version      smallint not null default 1 check (version >= 1),
  actor        public.event_actor not null,
  mode         public.trade_mode not null default 'practice' constraint events_practice_only check (mode = 'practice'),
  payload      jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  untrusted    jsonb not null default '{}'::jsonb check (jsonb_typeof(untrusted) = 'object'),
  created_at   timestamptz not null default now(),
  -- writer transaction id: publishers only emit rows whose xid is below the
  -- current snapshot's xmin, so a cursor never skips a late-committing seq
  xid          xid8 not null default pg_current_xact_id(),
  -- proposal.expired must carry a valid reason
  check (type <> 'proposal.expired'
         or ((payload ->> 'reason') in ('timeout', 'strategy_deleted', 'strategy_archived', 'guard_failed', 'price_moved', 'practice_reset', 'account_deleted')
             and payload ? 'proposal_id' and payload ? 'at'))
);
create index events_ws_feed_idx on public.events (workspace_id, seq);
create index events_strategy_idx on public.events (strategy_id, seq) where strategy_id is not null;
create index events_ck_idx on public.events (ck, seq) where ck is not null;
create index events_xid_idx on public.events (xid);

-- Highest seq that is safe to publish (no in-flight transaction can still
-- commit a smaller seq). Publishers: select ... where seq > :cursor and seq <= events_safe_seq().
create or replace function public.events_safe_seq()
returns bigint language sql stable as $$
  select coalesce(
    (select min(seq) - 1 from public.events where xid >= pg_snapshot_xmin(pg_current_snapshot())),
    (select max(seq) from public.events),
    0)
$$;

-- Each publisher (SSE fan-out, push notifier, funnel roll-up) tracks its position.
create table public.outbox_cursors (
  consumer   text primary key check (consumer ~ '^[a-z0-9_.-]{1,64}$'),
  last_seq   bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Side-channel deliveries (push / email / webhook) derived from events. The feed itself needs no
-- outbox rows: events ARE the outbox. Rows here are written in the same transaction as the event.
create table public.outbox (
  id           bigint generated always as identity primary key,
  event_seq    bigint not null references public.events (seq),
  workspace_id uuid not null references public.workspaces (id),
  channel      text not null check (channel in ('push', 'email', 'webhook')),
  target       text,                       -- device token id / user id; never a secret
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'dead')),
  attempts     integer not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index outbox_pending_idx on public.outbox (id) where status = 'pending';

-- Funnel roll-up derived from events (incremental by seq, hourly UTC buckets).
create table public.strategy_funnel_hourly (
  strategy_id  uuid not null references public.strategies (id),
  workspace_id uuid not null references public.workspaces (id),
  mode         public.trade_mode not null default 'practice' check (mode = 'practice'),
  bucket       timestamptz not null check (date_trunc('hour', bucket) = bucket),
  scanned      integer not null default 0,
  filtered     integer not null default 0,
  signaled     integer not null default 0,
  entered      integer not null default 0,
  exited       integer not null default 0,
  rejections   jsonb not null default '{}'::jsonb,   -- {"reason": count}
  last_seq     bigint not null default 0,
  primary key (strategy_id, bucket)
);

-- ---------------------------------------------------------------------------
-- Portfolio accounting: single source of truth for cash / equity / drawdown
-- ---------------------------------------------------------------------------
create table public.portfolio_snapshots (
  id                       bigint generated always as identity primary key,
  workspace_id             uuid not null references public.workspaces (id),
  mode                     public.trade_mode not null default 'practice' check (mode = 'practice'),
  ts                       timestamptz not null default now(),
  cash_lamports            bigint not null check (cash_lamports >= 0),
  positions_cost_lamports  bigint not null check (positions_cost_lamports >= 0),
  positions_value_lamports bigint not null check (positions_value_lamports >= 0),
  equity_lamports          bigint not null,
  peak_equity_lamports     bigint not null,
  drawdown_bps             integer not null check (drawdown_bps between 0 and 10000),
  realized_pnl_lamports    bigint not null,
  unrealized_pnl_lamports  bigint not null,
  open_positions           integer not null check (open_positions >= 0),
  as_of_seq                bigint not null,   -- events.seq this snapshot reflects
  check (equity_lamports = cash_lamports + positions_value_lamports),
  check (unrealized_pnl_lamports = positions_value_lamports - positions_cost_lamports),
  check (peak_equity_lamports >= equity_lamports),
  check (drawdown_bps = case when peak_equity_lamports <= 0 then 0
         else ((peak_equity_lamports - equity_lamports) * 10000 / peak_equity_lamports)::int end)
);
create index portfolio_snapshots_ws_idx on public.portfolio_snapshots (workspace_id, ts desc);

create view public.workspace_equity_latest with (security_invoker = true) as
  select distinct on (workspace_id) *
    from public.portfolio_snapshots
   order by workspace_id, ts desc, id desc;
-- contract name used by API docs (GET /v1/portfolio/overview)
create view public.portfolio_latest with (security_invoker = true) as
  select * from public.workspace_equity_latest;

-- ---------------------------------------------------------------------------
-- Approvals (proposal queue), guard changes, audit, idempotency, jobs
-- ---------------------------------------------------------------------------
create table public.approvals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id),
  strategy_id   uuid references public.strategies (id),
  portfolio_id  uuid references public.portfolios (id),
  kind          public.approval_kind not null,
  mode          public.trade_mode not null default 'practice' constraint approvals_practice_only check (mode = 'practice'),
  subject       text,                 -- ck / position key / strategy id
  mint          text,
  amount_lamports bigint check (amount_lamports > 0),
  is_first_buy  boolean not null default false,
  risk          text not null default 'low' check (risk in ('low', 'medium', 'high', 'critical')),
  payload       jsonb not null default '{}'::jsonb,
  status        public.approval_status not null default 'pending',
  rev           integer not null default 1 check (rev >= 1),         -- optimistic concurrency (expected_rev)
  expire_reason public.expire_reason,
  base_rev      integer,               -- guard_change: strategy rev the diff was built on
  weakening     boolean not null default false,
  decision      text check (decision in ('approve', 'reject')),
  decided_via   public.decided_via,
  decision_idempotency_key text check (length(decision_idempotency_key) between 8 and 128),
  requested_by  public.event_actor not null default 'system',
  requested_via text not null default 'system' check (requested_via in ('app', 'mcp', 'api', 'system')),
  decided_by    uuid references public.users (id),
  decision_note text check (length(decision_note) <= 500),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,  -- server-owned: computed by the backend from workspace TTLs
  decided_at    timestamptz,
  check ((status = 'pending') = (decided_at is null)),
  check ((status in ('approved', 'rejected')) = (decision is not null) or status = 'expired'),
  check (kind <> 'guard_change' or base_rev is not null),
  check ((status = 'expired') = (expire_reason is not null)),
  check (expires_at > created_at)
);
create index approvals_pending_idx on public.approvals (workspace_id, expires_at) where status = 'pending';
create index approvals_strategy_idx on public.approvals (strategy_id) where status in ('pending', 'approved');

-- Rejects illegal transitions; does NOT drive them (the worker/API does).
create or replace function public.approvals_guard()
returns trigger language plpgsql as $$
declare
  ok boolean;
begin
  ok := (old.status, new.status) in (
    ('pending', 'approved'), ('pending', 'rejected'), ('pending', 'expired'), ('approved', 'expired'));
  if not ok then
    raise exception 'illegal approval transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.rev <> old.rev + 1 then
    raise exception 'approval rev must increment by 1 (stale write?)' using errcode = 'serialization_failure';
  end if;
  if new.kind is distinct from old.kind or new.payload is distinct from old.payload
     or new.workspace_id is distinct from old.workspace_id or new.subject is distinct from old.subject
     or new.expires_at is distinct from old.expires_at or new.amount_lamports is distinct from old.amount_lamports then
    raise exception 'approval kind/payload/subject/amount/expires_at are immutable' using errcode = 'check_violation';
  end if;
  if new.status = 'approved' and old.expires_at <= now() then
    raise exception 'approval % expired', old.id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger approvals_guard before update on public.approvals
  for each row execute function public.approvals_guard();

-- Decision tokens: opaque 128-bit, single-use, stored as sha256 only, TTL <= approval.expires_at.
-- Minted per (approval, user, device) by issue_approval_token(); the plaintext is returned once
-- (GET /v1/approvals/{id} response, or the push payload) and never stored.
create table public.approval_tokens (
  token_hash   bytea primary key check (length(token_hash) = 32),
  approval_id  uuid not null references public.approvals (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  issued_via   public.decided_via not null,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_decision text check (used_decision in ('approve', 'reject')),
  check (expires_at > issued_at),
  check ((used_at is null) = (used_decision is null))
);
create index approval_tokens_approval_idx on public.approval_tokens (approval_id);

-- Guard changes. Weakening for Real SOL: mandatory 10 min cooldown, optional
-- auto-revert, audited. DISABLED until Phase 7 via guard_changes_practice_only.
create table public.guard_changes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id),
  strategy_id     uuid not null references public.strategies (id),
  approval_id     uuid references public.approvals (id),
  mode            public.trade_mode not null default 'practice'
                  constraint guard_changes_practice_only check (mode = 'practice'),
  from_rev        integer not null,
  diff            jsonb not null,               -- [{key, before, after, effect: weakens|strengthens|neutral}]
  weakened_fields text[] not null default '{}',
  impact          jsonb,                        -- ImpactReport from replay
  status          public.guard_change_status not null default 'requested',
  requested_by    uuid references public.users (id),
  cooldown_until  timestamptz,
  auto_revert_at  timestamptz,
  applied_at      timestamptz,
  reverted_at     timestamptz,
  created_at      timestamptz not null default now(),
  -- live weakening must wait >= 10 min between request and apply
  -- Real SOL weakening (Phase 7): mandatory 10 min cooldown + mandatory 24 h auto-revert
  check (mode = 'practice' or cardinality(weakened_fields) = 0
         or (cooldown_until is not null and cooldown_until >= created_at + interval '10 minutes'
             and auto_revert_at is not null and auto_revert_at = coalesce(applied_at, cooldown_until) + interval '24 hours')),
  check (applied_at is null or cooldown_until is null or applied_at >= cooldown_until),
  check (auto_revert_at is null or auto_revert_at > created_at)
);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id),
  mode         public.trade_mode not null default 'practice' check (mode = 'practice'),
  actor_user   uuid,                     -- no FK: survives account deletion as a pseudonymous id
  actor_kind   public.event_actor not null,
  actor_via    text check (actor_via in ('web', 'mobile', 'desktop', 'mcp', 'push', 'api', 'worker')),
  action       text not null check (action ~ '^[a-z_.]{1,64}$'),
  target_type  text check (target_type ~ '^[a-z_]{1,32}$'),
  target       text,                     -- target id
  before       jsonb,
  after        jsonb,
  risk         jsonb,                    -- risk snapshot (e.g. guard impact estimate)
  proof_kind   text check (proof_kind in ('webauthn', 'totp', 'typed', 'none')),
  proof_hash   bytea check (proof_hash is null or length(proof_hash) = 32),  -- sha256(canonical proof JSON)
  approval_id  uuid,
  request_id   text check (length(request_id) <= 64),
  ip           inet,
  user_agent   text check (length(user_agent) <= 400),
  device       text check (length(device) <= 200),
  server_now   timestamptz not null default clock_timestamp(),
  created_at   timestamptz not null default now()
);
create index audit_log_ws_idx on public.audit_log (workspace_id, id desc);

-- Idempotency-Key store for mutating API calls (24 h retention).
create table public.api_idempotency (
  user_id       uuid not null references public.users (id) on delete cascade,
  key           text not null check (length(key) between 8 and 128),
  method        text not null,
  path          text not null,
  request_hash  text not null,       -- sha256 of canonical body; same key + other body => 422
  status_code   smallint,
  response      jsonb,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours',
  primary key (user_id, key)
);

create table public.jobs (
  id           bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind         text not null check (kind ~ '^[a-z_.]{1,48}$'),
  payload      jsonb not null default '{}'::jsonb,
  status       public.job_status not null default 'queued',
  priority     smallint not null default 0,
  attempts     integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 50),
  run_after    timestamptz not null default now(),
  locked_by    text,
  locked_at    timestamptz,
  last_error   text,
  dedupe_key   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index jobs_ready_idx on public.jobs (priority desc, id) where status = 'queued';
create unique index jobs_dedupe_idx on public.jobs (workspace_id, kind, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
create trigger events_append_only before update or delete on public.events
  for each row execute function public.forbid_mutation();
create trigger events_append_only_truncate before truncate on public.events
  for each statement execute function public.forbid_mutation();
create trigger fills_append_only before update or delete on public.fills
  for each row execute function public.forbid_mutation();
create trigger fills_append_only_truncate before truncate on public.fills
  for each statement execute function public.forbid_mutation();
create trigger portfolio_snapshots_append_only before update or delete on public.portfolio_snapshots
  for each row execute function public.forbid_mutation();
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();
create trigger audit_log_append_only_truncate before truncate on public.audit_log
  for each statement execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Worker-called transactional procedures (backend / service_role only)
-- ---------------------------------------------------------------------------

-- Claim one ready job (FOR UPDATE SKIP LOCKED).
create or replace function public.claim_job(p_worker text, p_kinds text[])
returns setof public.jobs language sql as $$
  update public.jobs j
     set status = 'running', locked_by = p_worker, locked_at = now(), attempts = j.attempts + 1
   where j.id = (
     select id from public.jobs
      where status = 'queued' and run_after <= now() and kind = any (p_kinds)
      order by priority desc, id
      for update skip locked
      limit 1)
  returning j.*
$$;

-- Expire one proposal + emit proposal.expired in the SAME transaction (outbox).
create or replace function public.expire_proposal(p_id uuid, p_reason public.expire_reason)
returns boolean language plpgsql as $$
declare
  a public.approvals;
  t timestamptz := clock_timestamp();
begin
  update public.approvals
     set status = 'expired', expire_reason = p_reason, decided_at = t, rev = rev + 1
   where id = p_id and status in ('pending', 'approved')
  returning * into a;
  if not found then
    return false;
  end if;
  insert into public.events (id, workspace_id, strategy_id, ck, mint, ts, type, actor, payload)
  values (a.id::text || ':' || (extract(epoch from t) * 1000)::bigint || ':proposal.expired',
          a.workspace_id, a.strategy_id, a.subject, a.mint, t, 'proposal.expired', 'system',
          jsonb_build_object('proposal_id', a.id, 'kind', a.kind, 'reason', p_reason, 'rev', a.rev,
                             'at', to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  -- tokens for a dead proposal are useless; burn them
  update public.approval_tokens set expires_at = least(expires_at, t + interval '1 millisecond')
   where approval_id = a.id and used_at is null and expires_at > t;
  return true;
end $$;

-- Sweep: expire every due proposal (worker runs this every few seconds).
create or replace function public.expire_due_proposals()
returns integer language plpgsql as $$
declare
  n integer := 0;
  r record;
begin
  for r in select id from public.approvals
            where status = 'pending' and expires_at <= now()
            order by expires_at
            for update skip locked
            limit 500 loop
    n := n + public.expire_proposal(r.id, 'timeout')::int;
  end loop;
  return n;
end $$;

-- Archive or soft-delete a strategy and atomically expire its open proposals.
-- One transaction: strategy row lock -> status -> proposals expired -> events.
create or replace function public.retire_strategy(p_strategy uuid, p_action text, p_actor uuid)
returns integer language plpgsql as $$
declare
  s public.strategies;
  n integer := 0;
  r record;
  t timestamptz := clock_timestamp();
  reason public.expire_reason;
begin
  if p_action not in ('archive', 'delete') then
    raise exception 'p_action must be archive|delete' using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.strategies where id = p_strategy for update;
  if not found or s.status = 'deleted' then
    raise exception 'strategy % not found', p_strategy using errcode = 'no_data_found';
  end if;
  reason := case p_action when 'delete' then 'strategy_deleted' else 'strategy_archived' end;

  update public.strategies
     set status = case p_action when 'delete' then 'deleted'::public.strategy_status else 'archived' end,
         archived_at = coalesce(archived_at, t),
         deleted_at = case p_action when 'delete' then t else deleted_at end
   where id = p_strategy;

  for r in select id from public.approvals
            where strategy_id = p_strategy and status in ('pending', 'approved')
            for update loop
    n := n + public.expire_proposal(r.id, reason)::int;
  end loop;

  insert into public.events (id, workspace_id, strategy_id, ts, type, actor, payload)
  values (p_strategy::text || ':' || (extract(epoch from t) * 1000)::bigint || ':strategy.'
            || case p_action when 'delete' then 'deleted' else 'archived' end,
          s.workspace_id, p_strategy, t,
          'strategy.' || case p_action when 'delete' then 'deleted' else 'archived' end,
          (case when p_actor is null then 'system' else 'user' end)::public.event_actor,
          jsonb_build_object('expired_proposals', n, 'rev', s.rev));
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, before, after)
  values (s.workspace_id, p_actor, (case when p_actor is null then 'system' else 'user' end)::public.event_actor,
          case when p_actor is null then 'worker' else 'api' end,
          'strategy.' || p_action, 'strategy', p_strategy::text,
          jsonb_build_object('status', s.status, 'rev', s.rev),
          jsonb_build_object('status', case p_action when 'delete' then 'deleted' else 'archived' end,
                             'expired_proposals', n));
  return n;
end $$;

-- Mint a decision token for a member (called by the API when serving a pending approval, or by the
-- push worker). Returns the plaintext once; only sha256 is stored. TTL = min(15 min, expires_at).
create or replace function public.issue_approval_token(p_approval uuid, p_user uuid, p_via public.decided_via)
returns table (token text, expires_at timestamptz) language plpgsql set search_path = public, extensions as $$
declare
  a public.approvals;
  raw bytea := gen_random_bytes(16);   -- 128-bit
  tok text := 'apt_' || translate(rtrim(encode(raw, 'base64'), '='), '+/', '-_');
  exp timestamptz;
begin
  select * into a from public.approvals where id = p_approval;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0404'; end if;
  if a.status <> 'pending' or a.expires_at <= now() then raise exception 'APPROVAL_EXPIRED' using errcode = 'P0409'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = a.workspace_id
                  and m.user_id = p_user and m.role in ('owner', 'admin', 'trader')) then
    raise exception 'FORBIDDEN_ROLE' using errcode = 'P0403';
  end if;
  exp := least(a.expires_at, now() + interval '15 minutes');
  insert into public.approval_tokens (token_hash, approval_id, user_id, issued_via, expires_at)
  values (digest(tok, 'sha256'), a.id, p_user, p_via, exp);
  return query select tok, exp;
end $$;

-- Channel of the calling session, from the JWT claim `sentra_client` (set by our access-token hook / MCP
-- token minting). Never a client-supplied parameter. Unknown or missing -> 'web'.
create or replace function public.request_client()
returns public.decided_via language sql stable as $$
  select case coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sentra_client', '')
           when 'mobile' then 'mobile'::public.decided_via
           when 'desktop' then 'desktop'::public.decided_via
           when 'mcp' then 'mcp'::public.decided_via
           else 'web'::public.decided_via end
$$;

-- Decide a proposal. ONE implementation for REST (token + Idempotency-Key + If-Match/expected_rev) and the
-- Flutter RPC. Actor = auth.uid(); channel = JWT claim, or 'push' when the token was issued for a push.
-- p_expected_rev is REQUIRED for every channel (push included): NULL -> PRECONDITION_REQUIRED.
-- Idempotency: same key + same decision -> original result with replayed=true; same key + different
-- decision -> 422 IDEMPOTENCY_KEY_REUSED.
-- Precedence: token -> role/channel -> replay -> already decided -> expired -> rev -> apply.
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
      detail = jsonb_build_object('current_rev', a.rev, 'base_rev', p_expected_rev)::text;
  end if;
  if a.kind = 'guard_change' and a.base_rev is distinct from
       (select rev from public.strategies where id = a.strategy_id) then
    raise exception 'STRATEGY_REV_CONFLICT' using errcode = 'P0409';
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

-- Exit stats, aggregated server-side with the same filters as list endpoints.
-- SECURITY INVOKER: RLS on positions applies to the caller.
create or replace function public.exit_stats(
  p_workspace uuid, p_strategy uuid default null, p_mode public.trade_mode default null,
  p_from timestamptz default null, p_to timestamptz default null)
returns table (
  reason public.exit_reason, count bigint, wins bigint, win_rate numeric,
  avg_pnl_lamports bigint, avg_pnl_pct numeric, total_pnl_lamports bigint, avg_hold_seconds bigint)
language sql stable security invoker as $$
  select p.exit_reason,
         count(*),
         count(*) filter (where p.sol_out_lamports > p.sol_in_lamports),
         round(avg((p.sol_out_lamports > p.sol_in_lamports)::int)::numeric, 4),
         round(avg(p.sol_out_lamports - p.sol_in_lamports))::bigint,
         round(avg(case when p.sol_in_lamports > 0
                   then (p.sol_out_lamports - p.sol_in_lamports)::numeric * 100 / p.sol_in_lamports end), 2),
         sum(p.sol_out_lamports - p.sol_in_lamports)::bigint,
         round(avg(extract(epoch from p.closed_at - p.opened_at)))::bigint
    from public.positions p
   where p.workspace_id = p_workspace and p.status = 'closed'
     and (p_strategy is null or p.strategy_id = p_strategy)
     and (p_mode is null or p.mode = p_mode)
     and (p_from is null or p.closed_at >= p_from)
     and (p_to is null or p.closed_at < p_to)
   group by p.exit_reason
   order by count(*) desc
$$;

-- Funnel over a window from the hourly roll-up (derived from events).
create or replace function public.strategy_funnel(p_strategy uuid, p_from timestamptz, p_to timestamptz default now())
returns table (scanned bigint, filtered bigint, signaled bigint, entered bigint, exited bigint, rejections jsonb, as_of_seq bigint)
language sql stable security invoker as $$
  with b as (
    select * from public.strategy_funnel_hourly
     where strategy_id = p_strategy and bucket >= date_trunc('hour', p_from) and bucket < p_to),
  rej as (
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) j from (
      select k, sum(v::bigint) v from b, jsonb_each_text(b.rejections) e(k, v) group by k) x)
  select coalesce(sum(scanned), 0), coalesce(sum(filtered), 0), coalesce(sum(signaled), 0),
         coalesce(sum(entered), 0), coalesce(sum(exited), 0), (select j from rej), coalesce(max(last_seq), 0)
    from b
$$;

-- ---------------------------------------------------------------------------
-- Tenancy bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.workspace_add_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end $$;
create trigger workspace_add_owner after insert on public.workspaces
  for each row execute function public.workspace_add_owner();
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create or replace function public.has_workspace_role(ws uuid, roles public.workspace_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
     where m.workspace_id = ws and m.user_id = auth.uid() and m.role = any (roles))
$$;

-- Mode gate: 'real' rows need the JWT scope trade:real, which is never issued before Phase 7.
create or replace function public.mode_visible(m public.trade_mode)
returns boolean language sql stable as $$
  select m = 'practice'
      or coalesce((current_setting('request.jwt.claims', true)::jsonb -> 'app_scopes') ? 'trade:real', false)
$$;

create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_workspace_role(ws, enum_range(null::public.workspace_role))
$$;

do $$
declare t text;
begin
  foreach t in array array['users','auth_identities','siws_nonces','workspaces','workspace_members','wallets',
    'strategies','strategy_twins','portfolios','coins','guard_input_snapshots','coin_outcomes','picks','positions',
    'fills','events','outbox','outbox_cursors','approval_tokens','email_otps','webauthn_credentials','confirmation_challenges','strategy_funnel_hourly','portfolio_snapshots','approvals','guard_changes',
    'audit_log','api_idempotency','jobs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- users & identities: self only (linking/unlinking goes through the API)
create policy users_self_select on public.users for select to authenticated using (id = auth.uid());
create policy users_self_update on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy identities_self_select on public.auth_identities for select to authenticated using (user_id = auth.uid());
-- siws_nonces, email_otps, confirmation_challenges, approval_tokens, outbox*, api_idempotency,
-- guard_input_snapshots, coin_outcomes: no client policies (backend only)
create policy webauthn_self_select on public.webauthn_credentials for select to authenticated using (user_id = auth.uid());

-- workspaces
create policy ws_select on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy ws_insert on public.workspaces for insert to authenticated with check (owner_id = auth.uid());
create policy ws_update on public.workspaces for update to authenticated
  using (public.has_workspace_role(id, '{owner,admin}')) with check (public.has_workspace_role(id, '{owner,admin}'));

-- members
create policy wm_select on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy wm_write on public.workspace_members for all to authenticated
  using (public.has_workspace_role(workspace_id, '{owner,admin}'))
  with check (public.has_workspace_role(workspace_id, '{owner,admin}') and role <> 'owner');

-- wallets
create policy wallets_select on public.wallets for select to authenticated using (public.is_workspace_member(workspace_id));
create policy wallets_write on public.wallets for all to authenticated
  using (public.has_workspace_role(workspace_id, '{owner,admin}'))
  with check (public.has_workspace_role(workspace_id, '{owner,admin}'));

-- strategies: read for members; create/edit drafts directly; archive/delete only via API (retire_strategy)
create policy strat_select on public.strategies for select to authenticated
  using (public.is_workspace_member(workspace_id) and status <> 'deleted' and public.mode_visible(mode));
create policy strat_insert on public.strategies for insert to authenticated
  with check (public.has_workspace_role(workspace_id, '{owner,admin,trader}') and status in ('draft', 'paused'));
create policy strat_update on public.strategies for update to authenticated
  using (public.has_workspace_role(workspace_id, '{owner,admin,trader}') and status not in ('archived', 'deleted'))
  with check (public.has_workspace_role(workspace_id, '{owner,admin,trader}') and status in ('draft', 'running', 'paused'));
create policy twins_select on public.strategy_twins for select to authenticated using (public.is_workspace_member(workspace_id));
create policy portfolios_select on public.portfolios for select to authenticated using (public.is_workspace_member(workspace_id));

-- coins: global read for signed-in users
create policy coins_read on public.coins for select to authenticated using (true);

-- pipeline/accounting/approval tables: members read; only the backend writes
create policy picks_select on public.picks for select to authenticated using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
create policy positions_select on public.positions for select to authenticated using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
create policy fills_select on public.fills for select to authenticated using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
create policy events_select on public.events for select to authenticated using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
create policy funnel_select on public.strategy_funnel_hourly for select to authenticated using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
create policy snapshots_select on public.portfolio_snapshots for select to authenticated using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
create policy approvals_select on public.approvals for select to authenticated using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
create policy guard_changes_select on public.guard_changes for select to authenticated using (public.is_workspace_member(workspace_id) and public.mode_visible(mode));
create policy audit_select on public.audit_log for select to authenticated using (public.has_workspace_role(workspace_id, '{owner,admin}') and public.mode_visible(mode));
create policy jobs_select on public.jobs for select to authenticated using (public.is_workspace_member(workspace_id));
-- NOTE: approval decisions are NOT a client UPDATE. They go through decide_approval() (SECURITY
-- DEFINER, token-checked): REST POST /v1/approvals/{id}/decision and the Flutter RPC both call it.

-- ---------------------------------------------------------------------------
-- Privileges (defence in depth on top of RLS + triggers)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on
  public.events, public.fills, public.picks, public.positions, public.jobs, public.coins, public.approvals,
  public.guard_changes, public.audit_log, public.portfolio_snapshots, public.strategy_funnel_hourly,
  public.siws_nonces, public.auth_identities, public.api_idempotency, public.outbox_cursors,
  public.guard_input_snapshots, public.coin_outcomes, public.portfolios
  from authenticated;
revoke delete on public.strategies, public.workspaces from authenticated;
-- backend-only tables: no client access at all
revoke all on public.siws_nonces, public.api_idempotency, public.outbox_cursors, public.outbox,
  public.approval_tokens, public.guard_input_snapshots, public.coin_outcomes,
  public.email_otps, public.confirmation_challenges from authenticated;
revoke update, delete, truncate on public.events, public.fills, public.portfolio_snapshots, public.audit_log
  from service_role;
do $$
declare f text;
begin
  foreach f in array array['claim_job(text, text[])', 'expire_proposal(uuid, public.expire_reason)',
    'expire_due_proposals()', 'retire_strategy(uuid, text, uuid)', 'consume_siws_nonce(text, text, text)',
    'issue_approval_token(uuid, uuid, public.decided_via)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- decide_approval is the only client-callable mutation on approvals
revoke execute on function public.decide_approval(uuid, text, text, integer, text) from public, anon;
grant execute on function public.decide_approval(uuid, text, text, integer, text) to authenticated, service_role;
