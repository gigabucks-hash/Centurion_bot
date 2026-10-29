-- Tests for 0010: approval quote fields, set_approval_quote + proposal.updated, QUOTE_MISSING_OR_STALE rule.
\set ON_ERROR_STOP 1
\set QUIET 1
create or replace function pg_temp.expect_code(sql text, code text, label text) returns text language plpgsql as $$
declare m text; d text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics m = message_text, d = pg_exception_detail;
    if m <> code then raise exception '%: expected %, got % (%)', label, code, m, sqlerrm; end if;
    raise notice 'ok (%): %', code, label;
    return coalesce(d, '');
  end;
  raise exception 'EXPECTED % DID NOT HAPPEN: %', code, label;
end $$;

-- the rule, called directly (Real rows are schema-rejected today)
do $$
declare d jsonb;
begin
  perform public.approval_quote_check('practice', null, null);                               -- practice: never blocked
  perform public.approval_quote_check('practice', now() - interval '1 h', now() - interval '59 min');
  perform public.approval_quote_check('real', now(), now() + interval '10 s');               -- fresh: ok
  d := pg_temp.expect_code($q$select public.approval_quote_check('real', null, null)$q$, 'QUOTE_MISSING_OR_STALE', 'real, no quote')::jsonb;
  assert (d ->> 'missing')::boolean, 'missing flag';
  d := pg_temp.expect_code($q$select public.approval_quote_check('real', now() - interval '20 s', now() - interval '5 s')$q$,
                           'QUOTE_MISSING_OR_STALE', 'real, expired')::jsonb;
  assert not (d ->> 'missing')::boolean and d ? 'quote_expires_at', 'stale detail';
  perform pg_temp.expect_code($q$select public.approval_quote_check('real', '2026-01-01T00:00:00Z', '2026-01-01T00:00:15Z', '2026-01-01T00:00:15Z')$q$,
                              'QUOTE_MISSING_OR_STALE', 'real, expires_at = now is stale');
  perform public.approval_quote_check('real', '2026-01-01T00:00:00Z', '2026-01-01T00:00:15Z', '2026-01-01T00:00:14.999Z');
  raise notice 'ok: approval_quote_check';
end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009f9');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000009f9', 'ws Q', '00000000-0000-0000-0000-0000000009f9');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000009f9', '10000000-0000-0000-0000-0000000009f9', 'Q', 'paused', '{}');
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, expires_at) values
  ('30000000-0000-0000-0000-0000000009f9', '10000000-0000-0000-0000-0000000009f9', '20000000-0000-0000-0000-0000000009f9',
   'buy_pick', 'qck1', 250000000, now() + interval '1 hour');

do $$
declare w jsonb; e public.events;
begin
  w := public.approval_wire((select a from public.approvals a where id = '30000000-0000-0000-0000-0000000009f9'));
  assert w ? 'quote_expires_at' and w -> 'quote_expires_at' = 'null'::jsonb and w -> 'min_out_raw' = 'null'::jsonb, 'nullable quote fields present';
  w := public.set_approval_quote('30000000-0000-0000-0000-0000000009f9', jsonb_build_object(
         'est_network_fee_lamports', '25000', 'priority_fee_lamports', '20000', 'swap_fee_bps', 125, 'max_slippage_bps', 300,
         'min_out_raw', '8538207000123', 'total_max_lamports', '250025000',
         'quote_ts', '2026-10-29T11:00:00.000Z', 'quote_expires_at', '2026-10-29T11:00:15.000Z'));
  assert w ->> 'total_max_lamports' = '250025000' and w -> 'swap_fee_bps' = '125'::jsonb, 'wire types';
  assert w ->> 'min_out_raw' = '8538207000123' and w ->> 'quote_expires_at' = '2026-10-29T11:00:15.000Z', 'wire values';
  assert (w ->> 'rev')::int = 2, 'rev bumped';
  select * into e from public.events where type = 'proposal.updated' and payload ->> 'proposal_id' = '30000000-0000-0000-0000-0000000009f9';
  assert e.payload ->> 'est_network_fee_lamports' = '25000' and (e.payload ->> 'rev')::int = 2 and e.payload ->> 'kind' = 'buy_pick', 'proposal.updated payload';
  assert not (e.payload ? 'payload') and not (e.payload ? 'status'), 'only quote fields + id/kind/rev';
  perform pg_temp.expect_code($q$select public.set_approval_quote('30000000-0000-0000-0000-0000000009f9', '{"min_out_raw": 5}')$q$,
                              'VALIDATION_FAILED', 'min_out_raw must be an integer string');
  perform pg_temp.expect_code($q$select public.set_approval_quote('30000000-0000-0000-0000-0000000009f9', '{"swap_fee_bps": "125"}')$q$,
                              'VALIDATION_FAILED', 'bps must be a number');
  perform pg_temp.expect_code($q$select public.set_approval_quote('30000000-0000-0000-0000-0000000009f9', '{"fee": "1"}')$q$,
                              'VALIDATION_FAILED', 'unknown key');
  raise notice 'ok: set_approval_quote / proposal.updated';
end $$;
do $$ begin
  begin
    update public.approvals set quote_ts = '2026-10-29T11:00:15Z', quote_expires_at = '2026-10-29T11:00:00Z', rev = rev + 1
     where id = '30000000-0000-0000-0000-0000000009f9';
    raise exception 'inverted quote window accepted';
  exception when check_violation then null;
  end;
  raise notice 'ok: quote window check';
end $$;
-- the function is wired into decide_approval (approve path)
do $$ begin
  assert position('approval_quote_check' in pg_get_functiondef(
    'public.decide_approval(uuid, text, text, integer, text, text, integer)'::regprocedure)) > 0, 'decide_approval calls the check';
  raise notice 'ok: decide_approval calls approval_quote_check';
end $$;
do $$ begin
  begin
    update public.approvals set risk = 'high', rev = rev + 1 where id = '30000000-0000-0000-0000-0000000009f9';
    raise exception 'pending -> pending non-quote change accepted';
  exception when check_violation then null;
  end;
  update public.approvals set status = 'expired', expire_reason = 'timeout', decided_at = now(), rev = rev + 1
   where id = '30000000-0000-0000-0000-0000000009f9';
  perform pg_temp.expect_code($q$select public.set_approval_quote('30000000-0000-0000-0000-0000000009f9', '{}')$q$,
                              'APPROVAL_ALREADY_DECIDED', 'no quote refresh after the decision');
  raise notice 'ok: quote refresh only while pending';
end $$;
