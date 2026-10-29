-- Contracts 1.1.3: optional reject reason on approval decisions.
-- ApprovalRejectReason = user_declined | not_tradeable | price_moved | other (closed enum), reject only,
-- default user_declined. Stored on the approval, carried in proposal.rejected (reject_reason) and the audit row.
-- decide_approval gets p_reject_reason (default null); the 5-arg overload is dropped so named-argument RPC
-- calls stay unambiguous.

create type public.approval_reject_reason as enum ('user_declined', 'not_tradeable', 'price_moved', 'other');
alter table public.approvals add column reject_reason public.approval_reject_reason;
alter table public.approvals add constraint approvals_reject_reason_only_on_reject
  check (reject_reason is null or decision = 'reject');

create or replace function public.approval_wire(a public.approvals)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'proposal_id', a.id, 'workspace_id', a.workspace_id, 'strategy_id', a.strategy_id,
    'kind', a.kind, 'mode', a.mode, 'subject', a.subject, 'mint', a.mint,
    'amount_lamports', a.amount_lamports::text, 'is_first_buy', a.is_first_buy, 'risk', a.risk,
    'weakening', a.weakening, 'status', a.status, 'rev', a.rev, 'expire_reason', a.expire_reason,
    'base_rev', a.base_rev, 'decision', a.decision, 'reject_reason', a.reject_reason, 'decided_via', a.decided_via, 'decided_by', a.decided_by,
    'payload', a.payload,
    'created_at', to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expires_at', to_char(a.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'decided_at', to_char(a.decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;

drop function public.decide_approval(uuid, text, text, integer, text);
create or replace function public.decide_approval(
  p_approval_id uuid, p_token text, p_decision text, p_expected_rev integer,
  p_idempotency_key text default null, p_reject_reason text default null)
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
  insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target,
                                before, after, approval_id, proof_kind)
  values (a.workspace_id, uid, 'user', via::text, 'approval.' || p_decision, 'approval', a.id::text,
          jsonb_build_object('status', 'pending', 'rev', a.rev - 1),
          jsonb_build_object('status', a.status, 'rev', a.rev, 'kind', a.kind, 'reject_reason', rr), a.id, 'none');
  return jsonb_build_object('proposal_id', a.id, 'status', a.status, 'rev', a.rev, 'reject_reason', a.reject_reason,
                            'replayed', false, 'server_now', now_ts);
end $$;
revoke execute on function public.decide_approval(uuid, text, text, integer, text, text) from public, anon;
grant execute on function public.decide_approval(uuid, text, text, integer, text, text) to authenticated, service_role;
