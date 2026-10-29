-- Contracts 1.1.5 (UX questions). Paper only: quotes are papersim estimates; nothing is signed or sent.
--  (1) quote refresh no longer bumps approval rev (push Approve/Skip tokens stay valid); quote_id counts refreshes.
--      Real approve needs p_expected_quote_id = current quote_id and a fresh quote, else 409 QUOTE_MISSING_OR_STALE.
--  (2) refresh coalesced to at most one per 3 s per proposal (so at most one proposal.updated per 3 s), pending only.
--  (3) decimals + token_program on ApprovalWire / proposal events.
--  (5) est_ata_rent_lamports, included in total_max_lamports.
--  (7) sell quotes (expected_out_lamports, min_out_lamports) and the sell_position proposal kind.
--  Pool reserves for quotes: pool_states (written by the ingest pipeline, backend only).

alter type public.approval_kind add value if not exists 'sell_position';

alter table public.approvals
  add column quote_id                  bigint not null default 0 check (quote_id >= 0),
  add column quote_refreshed_at        timestamptz,
  add column est_ata_rent_lamports     bigint check (est_ata_rent_lamports >= 0),
  add column expected_out_lamports bigint check (expected_out_lamports >= 0),
  add column min_out_lamports          bigint check (min_out_lamports >= 0),
  add column position_id               uuid references public.positions (id) on delete set null;

-- Latest pool state per mint (curve or AMM), SOL-quoted only. Reserves: SOL in SOL, token in whole tokens
-- (UI units of the mint's decimals). Backend only (RLS on, no client policies).
create table public.pool_states (
  mint          text primary key references public.coins (mint) on delete cascade,
  venue         text not null check (venue in ('curve', 'amm')),
  sol_reserve   double precision not null check (sol_reserve >= 0),
  token_reserve double precision not null check (token_reserve >= 0),
  quote_mint    text check (quote_mint is null or public.is_base58_address(quote_mint)),
  slot          bigint check (slot >= 0),
  observed_at   timestamptz not null
);
alter table public.pool_states enable row level security;
revoke all on public.pool_states from anon, authenticated;

create or replace function public.upsert_pool_state(p_mint text, p_venue text, p_sol double precision, p_token double precision,
                                                    p_quote_mint text, p_slot bigint, p_observed_at timestamptz)
returns void language sql security definer set search_path = public as $$
  insert into public.pool_states (mint, venue, sol_reserve, token_reserve, quote_mint, slot, observed_at)
  values (p_mint, p_venue, p_sol, p_token, p_quote_mint, p_slot, p_observed_at)
  on conflict (mint) do update set venue = excluded.venue, sol_reserve = excluded.sol_reserve,
    token_reserve = excluded.token_reserve, quote_mint = excluded.quote_mint, slot = excluded.slot,
    observed_at = excluded.observed_at
  where pool_states.observed_at <= excluded.observed_at
$$;
revoke execute on function public.upsert_pool_state(text, text, double precision, double precision, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_pool_state(text, text, double precision, double precision, text, bigint, timestamptz) to service_role;

-- (4) Rule incl. the reviewed quote id. Real: needs a quote, quote_expires_at > now and expected = current quote_id.
-- Practice: never blocked. Details: {reason missing|stale|mismatch, missing, quote_ts, quote_expires_at, quote_id,
-- expected_quote_id, current (ApprovalWire)}.
create or replace function public.approval_quote_check(p_mode public.trade_mode, p_quote_ts timestamptz,
    p_quote_expires_at timestamptz, p_now timestamptz, p_quote_id bigint, p_expected_quote_id bigint, p_current jsonb)
returns void language plpgsql stable as $$
declare
  why text;
begin
  if p_mode = 'practice' then
    return;
  end if;
  why := case
    when p_quote_ts is null or p_quote_expires_at is null then 'missing'
    when p_quote_expires_at <= p_now then 'stale'
    when p_expected_quote_id is null or p_expected_quote_id <> p_quote_id then 'mismatch'
  end;
  if why is not null then
    raise exception using errcode = 'P0409', message = 'QUOTE_MISSING_OR_STALE',
      detail = jsonb_build_object(
        'reason', why,
        'missing', why = 'missing',
        'quote_ts', to_char(p_quote_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'quote_expires_at', to_char(p_quote_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'quote_id', p_quote_id::text,
        'expected_quote_id', p_expected_quote_id::text,
        'current', p_current,
        'hint', 'refresh the quote (POST .../quote), review it and approve with its quote_id')::text;
  end if;
end $$;

create or replace function public.approval_wire(a public.approvals)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'proposal_id', a.id, 'workspace_id', a.workspace_id, 'strategy_id', a.strategy_id,
    'kind', a.kind, 'mode', a.mode, 'subject', a.subject, 'mint', a.mint, 'position_id', a.position_id,
    'amount_lamports', a.amount_lamports::text, 'is_first_buy', a.is_first_buy, 'risk', a.risk,
    'weakening', a.weakening, 'status', a.status, 'rev', a.rev, 'expire_reason', a.expire_reason,
    'base_rev', a.base_rev, 'decision', a.decision, 'reject_reason', a.reject_reason, 'decided_via', a.decided_via, 'decided_by', a.decided_by,
    'payload', a.payload,
    'decimals', c.decimals, 'token_program', c.token_program,
    'quote_id', a.quote_id::text,
    'est_network_fee_lamports', a.est_network_fee_lamports::text, 'priority_fee_lamports', a.priority_fee_lamports::text,
    'est_ata_rent_lamports', a.est_ata_rent_lamports::text,
    'swap_fee_bps', a.swap_fee_bps, 'max_slippage_bps', a.max_slippage_bps, 'min_out_raw', a.min_out_raw::text,
    'expected_out_lamports', a.expected_out_lamports::text, 'min_out_lamports', a.min_out_lamports::text,
    'total_max_lamports', a.total_max_lamports::text,
    'quote_ts', to_char(a.quote_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'quote_expires_at', to_char(a.quote_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'created_at', to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expires_at', to_char(a.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'decided_at', to_char(a.decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  from (select 1) one left join public.coins c on c.mint = a.mint
$$;

-- approvals_guard: a pending approval may stay pending only for a quote refresh: quote columns change,
-- quote_id + 1, rev UNCHANGED (1.1.5). Every other write: rev + 1. Quote columns are frozen once decided.
create or replace function public.approvals_guard()
returns trigger language plpgsql as $$
declare
  ok boolean;
  quote_cols constant text[] := array['est_network_fee_lamports', 'priority_fee_lamports', 'swap_fee_bps', 'max_slippage_bps',
                                      'min_out_raw', 'total_max_lamports', 'quote_ts', 'quote_expires_at', 'quote_id',
                                      'quote_refreshed_at', 'est_ata_rent_lamports', 'expected_out_lamports', 'min_out_lamports'];
begin
  if old.status = 'pending' and new.status = 'pending' then
    if (to_jsonb(new) - quote_cols) is distinct from (to_jsonb(old) - quote_cols) then
      raise exception 'a pending approval may only change its quote (rev unchanged)' using errcode = 'check_violation';
    end if;
    if new.quote_id <> old.quote_id + 1 then
      raise exception 'quote refresh must increment quote_id by 1' using errcode = 'serialization_failure';
    end if;
  else
    ok := (old.status, new.status) in (
      ('pending', 'approved'), ('pending', 'rejected'), ('pending', 'expired'), ('approved', 'expired'));
    if not ok then
      raise exception 'illegal approval transition % -> %', old.status, new.status using errcode = 'check_violation';
    end if;
    if exists (select 1 from unnest(quote_cols) c where (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c)) then
      raise exception 'approval quote is frozen once decided' using errcode = 'check_violation';
    end if;
    if new.rev <> old.rev + 1 then
      raise exception 'approval rev must increment by 1 (stale write?)' using errcode = 'serialization_failure';
    end if;
  end if;
  if new.kind is distinct from old.kind or new.payload is distinct from old.payload
     or new.workspace_id is distinct from old.workspace_id or new.subject is distinct from old.subject
     or new.expires_at is distinct from old.expires_at or new.amount_lamports is distinct from old.amount_lamports
     or new.position_id is distinct from old.position_id then
    raise exception 'approval kind/payload/subject/amount/position/expires_at are immutable' using errcode = 'check_violation';
  end if;
  if new.status = 'approved' and old.expires_at <= now() then
    raise exception 'approval % expired', old.id using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Backend sets or refreshes a pending approval's quote. quote_id + 1, rev unchanged, one proposal.updated.
-- Coalesced: within 3 s of the previous refresh it changes nothing and returns the current wire
-- (so at most one proposal.updated per proposal per 3 s, and only while pending).
create or replace function public.set_approval_quote(p_approval uuid, p_quote jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.approvals;
  t timestamptz := clock_timestamp();
  k text;
  ints constant text[] := array['est_network_fee_lamports', 'priority_fee_lamports', 'min_out_raw', 'total_max_lamports',
                                'est_ata_rent_lamports', 'expected_out_lamports', 'min_out_lamports'];
begin
  if p_quote is null or jsonb_typeof(p_quote) <> 'object' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"quote"}';
  end if;
  select string_agg(x, ', ') into k from jsonb_object_keys(p_quote) x
   where not (x = any (ints || array['swap_fee_bps', 'max_slippage_bps', 'quote_ts', 'quote_expires_at']));
  if k is not null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = jsonb_build_object('field', 'quote', 'unknown', k)::text;
  end if;
  foreach k in array ints loop
    if p_quote ? k and jsonb_typeof(p_quote -> k) <> 'null'
       and (jsonb_typeof(p_quote -> k) <> 'string' or (p_quote ->> k) !~ '^(0|[1-9][0-9]{0,38})$') then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = jsonb_build_object('field', k, 'hint', 'integer string')::text;
    end if;
  end loop;
  foreach k in array array['swap_fee_bps', 'max_slippage_bps'] loop
    if p_quote ? k and jsonb_typeof(p_quote -> k) not in ('number', 'null') then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = jsonb_build_object('field', k, 'hint', 'JSON number')::text;
    end if;
  end loop;
  select * into a from public.approvals where id = p_approval for update;
  if not found or a.status <> 'pending' then
    raise exception 'APPROVAL_ALREADY_DECIDED' using errcode = 'P0409';
  end if;
  if a.quote_refreshed_at is not null and a.quote_refreshed_at > t - interval '3 seconds' then
    return public.approval_wire(a);                        -- coalesced
  end if;
  update public.approvals set
      est_network_fee_lamports = (p_quote ->> 'est_network_fee_lamports')::bigint,
      priority_fee_lamports = (p_quote ->> 'priority_fee_lamports')::bigint,
      est_ata_rent_lamports = (p_quote ->> 'est_ata_rent_lamports')::bigint,
      swap_fee_bps = (p_quote ->> 'swap_fee_bps')::integer,
      max_slippage_bps = (p_quote ->> 'max_slippage_bps')::integer,
      min_out_raw = (p_quote ->> 'min_out_raw')::numeric,
      expected_out_lamports = (p_quote ->> 'expected_out_lamports')::bigint,
      min_out_lamports = (p_quote ->> 'min_out_lamports')::bigint,
      total_max_lamports = (p_quote ->> 'total_max_lamports')::bigint,
      quote_ts = (p_quote ->> 'quote_ts')::timestamptz,
      quote_expires_at = (p_quote ->> 'quote_expires_at')::timestamptz,
      quote_id = quote_id + 1,
      quote_refreshed_at = t
   where id = p_approval
  returning * into a;
  insert into public.events (id, workspace_id, strategy_id, ck, mint, ts, type, actor, payload)
  values (a.id::text || ':' || (extract(epoch from t) * 1000)::bigint || ':proposal.updated', a.workspace_id, a.strategy_id, a.subject, a.mint, t,
          'proposal.updated', 'system',
          jsonb_build_object('proposal_id', a.id, 'kind', a.kind, 'rev', a.rev)
            || (public.approval_wire(a) - array['id', 'proposal_id', 'workspace_id', 'strategy_id', 'kind', 'mode', 'subject',
                 'mint', 'position_id', 'amount_lamports', 'is_first_buy', 'risk', 'weakening', 'status', 'rev', 'expire_reason', 'base_rev',
                 'decision', 'reject_reason', 'decided_via', 'decided_by', 'payload', 'created_at', 'expires_at', 'decided_at']));
  return public.approval_wire(a);
end $$;

drop function public.decide_approval(uuid, text, text, integer, text, text, integer);
create or replace function public.decide_approval(
  p_approval_id uuid, p_token text, p_decision text, p_expected_rev integer,
  p_idempotency_key text default null, p_reject_reason text default null, p_hold_ms integer default null,
  p_expected_quote_id bigint default null)
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

  -- 1.1.4/1.1.5: a Real approve needs a fresh quote (never blocks practice)
  if p_decision = 'approve' then
    -- 1.1.5: and the quote the user reviewed (expected_quote_id); practice ignores it
    perform public.approval_quote_check(a.mode, a.quote_ts, a.quote_expires_at, now_ts, a.quote_id, p_expected_quote_id,
                                        public.approval_wire(a));
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
revoke execute on function public.decide_approval(uuid, text, text, integer, text, text, integer, bigint) from public, anon;
grant execute on function public.decide_approval(uuid, text, text, integer, text, text, integer, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1.1.5: an agent (MCP) cannot propose a guard loosening at all (it could already not decide one).
-- Enforced on the row itself so every write path (PATCH 202 flow, propose_guard_change RPC) is covered.
-- ---------------------------------------------------------------------------
create or replace function public.approvals_no_agent_loosening() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'guard_change' and new.weakening and new.requested_via = 'mcp' then
    raise exception using errcode = 'P0403', message = 'FORBIDDEN_ROLE',
      detail = '{"reason":"agent_cannot_loosen","hint":"guard loosening can only be proposed from the app"}';
  end if;
  return new;
end $$;
drop trigger if exists approvals_no_agent_loosening on public.approvals;
create trigger approvals_no_agent_loosening before insert on public.approvals
  for each row execute function public.approvals_no_agent_loosening();
