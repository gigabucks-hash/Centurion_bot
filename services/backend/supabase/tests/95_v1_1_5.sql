-- Tests for 0016 (contracts 1.1.5): quote_id without rev bump, 3 s coalescing, quote check details, decimals on the wire, pool_states.
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

insert into public.coins (mint, venue, decimals, token_program) values
  ('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', 'curve', 9, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
on conflict (mint) do nothing;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009fa');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000009fa', 'ws 115', '00000000-0000-0000-0000-0000000009fa');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000009fa', '10000000-0000-0000-0000-0000000009fa', 'Q115', 'paused', '{}');
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, mint, amount_lamports, expires_at) values
  ('30000000-0000-0000-0000-0000000009fa', '10000000-0000-0000-0000-0000000009fa', '20000000-0000-0000-0000-0000000009fa',
   'buy_pick', 'qck115', '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', 250000000, now() + interval '1 hour');

do $$
declare w jsonb; w2 jsonb; n int; d jsonb;
begin
  w := public.approval_wire((select a from public.approvals a where id = '30000000-0000-0000-0000-0000000009fa'));
  assert (w -> 'decimals')::int = 9 and w ->> 'token_program' = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', 'decimals + token_program';
  assert w ->> 'quote_id' = '0' and w ? 'est_ata_rent_lamports' and w ? 'min_out_lamports' and w ? 'expected_out_lamports', '1.1.5 fields';
  w := public.set_approval_quote('30000000-0000-0000-0000-0000000009fa', jsonb_build_object(
         'est_network_fee_lamports', '25000', 'priority_fee_lamports', '20000', 'est_ata_rent_lamports', '2039280',
         'swap_fee_bps', 125, 'max_slippage_bps', 300, 'min_out_raw', '1', 'total_max_lamports', '252064280',
         'quote_ts', '2026-10-29T11:00:00.000Z', 'quote_expires_at', '2026-10-29T11:00:15.000Z'));
  assert (w ->> 'rev')::int = 1 and w ->> 'quote_id' = '1' and w ->> 'est_ata_rent_lamports' = '2039280', 'rev unchanged, quote_id 1';
  -- inside 3 s: coalesced (nothing changes, no event)
  w2 := public.set_approval_quote('30000000-0000-0000-0000-0000000009fa', jsonb_build_object('total_max_lamports', '1'));
  assert w2 ->> 'quote_id' = '1' and w2 ->> 'total_max_lamports' = '252064280', 'coalesced within 3 s';
  select count(*) into n from public.events where type = 'proposal.updated' and payload ->> 'proposal_id' = '30000000-0000-0000-0000-0000000009fa';
  assert n = 1, 'one proposal.updated per 3 s';
  -- after the window: applied
  update public.approvals set quote_refreshed_at = quote_refreshed_at - interval '4 seconds', quote_id = quote_id + 1
   where id = '30000000-0000-0000-0000-0000000009fa';
  w2 := public.set_approval_quote('30000000-0000-0000-0000-0000000009fa', jsonb_build_object('total_max_lamports', '7'));
  assert w2 ->> 'quote_id' = '3' and w2 ->> 'total_max_lamports' = '7' and (w2 ->> 'rev')::int = 1, 'refresh after 3 s';
  -- rule: missing / stale / mismatch, with current
  d := pg_temp.expect_code($q$select public.approval_quote_check('real', null, null, now(), 0, null, '{"id":"x"}')$q$, 'QUOTE_MISSING_OR_STALE', 'missing')::jsonb;
  assert d ->> 'reason' = 'missing' and (d -> 'missing')::boolean and d -> 'current' ->> 'id' = 'x', 'missing details';
  d := pg_temp.expect_code($q$select public.approval_quote_check('real', now() - interval '20 s', now() - interval '5 s', now(), 3, 3, '{}')$q$, 'QUOTE_MISSING_OR_STALE', 'stale')::jsonb;
  assert d ->> 'reason' = 'stale' and not (d -> 'missing')::boolean and d ? 'quote_ts' and d ? 'quote_expires_at', 'stale details';
  d := pg_temp.expect_code($q$select public.approval_quote_check('real', now(), now() + interval '10 s', now(), 3, 2, '{}')$q$, 'QUOTE_MISSING_OR_STALE', 'mismatch')::jsonb;
  assert d ->> 'reason' = 'mismatch' and d ->> 'quote_id' = '3' and d ->> 'expected_quote_id' = '2', 'mismatch details';
  d := pg_temp.expect_code($q$select public.approval_quote_check('real', now(), now() + interval '10 s', now(), 3, null, '{}')$q$, 'QUOTE_MISSING_OR_STALE', 'expected id missing')::jsonb;
  perform public.approval_quote_check('real', now(), now() + interval '10 s', now(), 3, 3, '{}');
  perform public.approval_quote_check('practice', null, null, now(), 0, null, '{}');
  assert position('p_expected_quote_id' in pg_get_functiondef(
    'public.decide_approval(uuid, text, text, integer, text, text, integer, bigint)'::regprocedure)) > 0, 'decide_approval passes expected quote id';
  raise notice 'ok: 1.1.5 quote_id / coalescing / check details';
end $$;

-- pool_states: monotonic upsert, backend only
do $$ begin
  perform public.upsert_pool_state('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', 'curve', 30, 1073000000, null, 10, '2026-10-29T11:00:00Z');
  perform public.upsert_pool_state('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', 'curve', 99, 1, null, 9, '2026-10-29T10:00:00Z');
  assert (select sol_reserve from public.pool_states where mint = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin') = 30, 'older state ignored';
  assert not has_table_privilege('authenticated', 'public.pool_states', 'select'), 'clients cannot read pool_states';
  raise notice 'ok: pool_states';
end $$;
