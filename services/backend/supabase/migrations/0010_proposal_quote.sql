-- Contracts 1.1.4 (cont.): transaction quote on approvals for the review sheet (UX WF-22), and the
-- QUOTE_MISSING_OR_STALE rule for Real approvals. Paper only: quotes are papersim estimates; nothing is signed or sent.

alter table public.approvals
  add column est_network_fee_lamports bigint check (est_network_fee_lamports >= 0),
  add column priority_fee_lamports    bigint check (priority_fee_lamports >= 0),
  add column swap_fee_bps             integer check (swap_fee_bps between 0 and 10000),
  add column max_slippage_bps         integer check (max_slippage_bps between 0 and 10000),
  add column min_out_raw              numeric(39, 0) check (min_out_raw >= 0),
  add column total_max_lamports       bigint check (total_max_lamports >= 0),
  add column quote_ts                 timestamptz,
  add column quote_expires_at         timestamptz,
  add constraint approvals_quote_window check (quote_expires_at is null or (quote_ts is not null and quote_expires_at > quote_ts));

-- The rule, callable on its own (tests call it directly; Real rows are still schema-rejected today).
-- Real: approve needs a quote (quote_ts and quote_expires_at) with quote_expires_at > server now.
-- Practice: never blocked by a missing or stale quote.
create or replace function public.approval_quote_check(p_mode public.trade_mode, p_quote_ts timestamptz,
                                                       p_quote_expires_at timestamptz, p_now timestamptz default clock_timestamp())
returns void language plpgsql stable as $$
begin
  if p_mode = 'practice' then
    return;
  end if;
  if p_quote_ts is null or p_quote_expires_at is null or p_quote_expires_at <= p_now then
    raise exception using errcode = 'P0409', message = 'QUOTE_MISSING_OR_STALE',
      detail = jsonb_build_object(
        'quote_ts', to_char(p_quote_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'quote_expires_at', to_char(p_quote_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'missing', p_quote_ts is null or p_quote_expires_at is null,
        'hint', 'refresh the quote (proposal.updated) and review it before approving')::text;
  end if;
end $$;

create or replace function public.approval_wire(a public.approvals)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'proposal_id', a.id, 'workspace_id', a.workspace_id, 'strategy_id', a.strategy_id,
    'kind', a.kind, 'mode', a.mode, 'subject', a.subject, 'mint', a.mint,
    'amount_lamports', a.amount_lamports::text, 'is_first_buy', a.is_first_buy, 'risk', a.risk,
    'weakening', a.weakening, 'status', a.status, 'rev', a.rev, 'expire_reason', a.expire_reason,
    'base_rev', a.base_rev, 'decision', a.decision, 'reject_reason', a.reject_reason, 'decided_via', a.decided_via, 'decided_by', a.decided_by,
    'payload', a.payload,
    'est_network_fee_lamports', a.est_network_fee_lamports::text, 'priority_fee_lamports', a.priority_fee_lamports::text,
    'swap_fee_bps', a.swap_fee_bps, 'max_slippage_bps', a.max_slippage_bps, 'min_out_raw', a.min_out_raw::text,
    'total_max_lamports', a.total_max_lamports::text,
    'quote_ts', to_char(a.quote_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'quote_expires_at', to_char(a.quote_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'created_at', to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expires_at', to_char(a.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'decided_at', to_char(a.decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

-- approvals_guard (0001) + 1.1.4: a pending approval may stay pending only for a quote refresh (quote columns
-- and rev change, nothing else). Quote columns are frozen once decided.
create or replace function public.approvals_guard()
returns trigger language plpgsql as $$
declare
  ok boolean;
  quote_cols constant text[] := array['est_network_fee_lamports', 'priority_fee_lamports', 'swap_fee_bps', 'max_slippage_bps',
                                      'min_out_raw', 'total_max_lamports', 'quote_ts', 'quote_expires_at'];
begin
  if old.status = 'pending' and new.status = 'pending' then
    if (to_jsonb(new) - quote_cols - 'rev') is distinct from (to_jsonb(old) - quote_cols - 'rev') then
      raise exception 'a pending approval may only change its quote' using errcode = 'check_violation';
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

-- Backend (papersim) sets or refreshes a pending approval's quote: rev + 1 and proposal.updated.
create or replace function public.set_approval_quote(p_approval uuid, p_quote jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.approvals;
  t timestamptz := clock_timestamp();
  k text;
begin
  if p_quote is null or jsonb_typeof(p_quote) <> 'object' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = '{"field":"quote"}';
  end if;
  select string_agg(x, ', ') into k from jsonb_object_keys(p_quote) x
   where x not in ('est_network_fee_lamports', 'priority_fee_lamports', 'swap_fee_bps', 'max_slippage_bps',
                   'min_out_raw', 'total_max_lamports', 'quote_ts', 'quote_expires_at');
  if k is not null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0422', detail = jsonb_build_object('field', 'quote', 'unknown', k)::text;
  end if;
  foreach k in array array['est_network_fee_lamports', 'priority_fee_lamports', 'min_out_raw', 'total_max_lamports'] loop
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
  update public.approvals set
      est_network_fee_lamports = (p_quote ->> 'est_network_fee_lamports')::bigint,
      priority_fee_lamports = (p_quote ->> 'priority_fee_lamports')::bigint,
      swap_fee_bps = (p_quote ->> 'swap_fee_bps')::integer,
      max_slippage_bps = (p_quote ->> 'max_slippage_bps')::integer,
      min_out_raw = (p_quote ->> 'min_out_raw')::numeric,
      total_max_lamports = (p_quote ->> 'total_max_lamports')::bigint,
      quote_ts = (p_quote ->> 'quote_ts')::timestamptz,
      quote_expires_at = (p_quote ->> 'quote_expires_at')::timestamptz,
      rev = rev + 1
   where id = p_approval and status = 'pending'
  returning * into a;
  if not found then
    raise exception 'APPROVAL_ALREADY_DECIDED' using errcode = 'P0409';
  end if;
  insert into public.events (id, workspace_id, strategy_id, ck, mint, ts, type, actor, payload)
  values (a.id::text || ':' || (extract(epoch from t) * 1000)::bigint || ':proposal.updated', a.workspace_id, a.strategy_id, a.subject, a.mint, t,
          'proposal.updated', 'system',
          jsonb_build_object('proposal_id', a.id, 'kind', a.kind, 'rev', a.rev)
            || (public.approval_wire(a) - array['id', 'proposal_id', 'workspace_id', 'strategy_id', 'kind', 'mode', 'subject',
                 'mint', 'amount_lamports', 'is_first_buy', 'risk', 'weakening', 'status', 'rev', 'expire_reason', 'base_rev',
                 'decision', 'reject_reason', 'decided_via', 'decided_by', 'payload', 'created_at', 'expires_at', 'decided_at']));
  return public.approval_wire(a);
end $$;
revoke execute on function public.set_approval_quote(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_approval_quote(uuid, jsonb) to service_role;

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

  -- 1.1.4: a Real approve needs a fresh quote (never blocks practice).
  if p_decision = 'approve' then
    perform public.approval_quote_check(a.mode, a.quote_ts, a.quote_expires_at, now_ts);
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
