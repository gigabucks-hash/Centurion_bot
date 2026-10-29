-- Tests for 0007: guard weakening is rejected (GUARD_WEAKEN_REQUIRES_APPROVAL); strengthening applies.
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
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009e1', false),
       set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009e1","sentra_client":"desktop"}', false);

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009e1');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000009e1', 'ws E', '00000000-0000-0000-0000-0000000009e1');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000009e1', '10000000-0000-0000-0000-0000000009e1', 'G', 'paused',
   '{"guard_checks":{"creator_share_pct_fail":15},"top_holders_share_pct_max":40,"lp_burned_pct_min":80,"required_checks":["top_holders_share_pct","lp_burned_pct"]}');

-- classifier (mirrors guard::impact::weakened_fields)
do $$ begin
  assert public.guard_weakened_fields('{}', '{}') = '{}', 'no change';
  assert public.guard_weakened_fields('{}', '{"guard_checks":{"allow_mint_authority":true}}') = '{allow_mint_authority}', 'allow mint';
  assert public.guard_weakened_fields('{}', '{"guard_checks":{"creator_share_pct_fail":20}}') = '{creator_share_pct_fail}', 'higher share';
  assert public.guard_weakened_fields('{}', '{"guard_checks":{"creator_share_pct_fail":0}}') = '{creator_share_pct_fail}', '0 = off';
  assert public.guard_weakened_fields('{}', '{"guard_checks":{"creator_share_pct_fail":10}}') = '{}', 'lower share is stricter';
  assert public.guard_weakened_fields('{}', '{"guard_checks":{"min_lp_safe_pct_fail":40}}') = '{min_lp_safe_pct_fail}', 'lower lp';
  assert public.guard_weakened_fields('{}', '{"guard_checks":{"sell_tax_bps_fail":2000}}') = '{sell_tax_bps_fail}', 'higher tax';
  assert public.guard_weakened_fields('{}', '{"guard_checks":{"require_sell_sim":false}}') = '{require_sell_sim}', 'sell sim off';
  assert public.guard_weakened_fields('{}', '{"guard_checks":{"warn_score_fail":0}}') = '{warn_score_fail}', 'warn score off';
  assert public.guard_weakened_fields('{"guard_checks":{"creator_share_pct_fail":20}}', '{}') = '{}', 'removing a weak override restores the stricter default';
  assert public.guard_weakened_fields('{"top_holders_share_pct_max":40}', '{}') = '{top_holders_share_pct_max}', 'unset = off';
  assert public.guard_weakened_fields('{"top_holders_share_pct_max":40}', '{"top_holders_share_pct_max":30}') = '{}', 'stricter max';
  assert public.guard_weakened_fields('{"lp_burned_pct_min":80}', '{"lp_burned_pct_min":50}') = '{lp_burned_pct_min}', 'lower lp burned';
  assert public.guard_weakened_fields('{"required_checks":["a","b"]}', '{"required_checks":["a"]}') = '{required_checks}', 'check removed';
  assert public.guard_weakened_fields('{"required_checks":["a"]}', '{"required_checks":["a","b"]}') = '{}', 'check added';
  assert public.guard_weakened_fields('{}', '{"score_threshold":50,"liquidity_usd_min":0}') = '{}', 'screener keys are not guards';
end $$;

-- weaken rejected, nothing applied, detail lists the fields
do $$ declare d jsonb; begin
  d := pg_temp.expect_code($q$select public.update_strategy('20000000-0000-0000-0000-0000000009e1', 1, '{"guard_checks":{"creator_share_pct_fail":30}}')$q$,
                           'GUARD_WEAKEN_REQUIRES_APPROVAL', 'weaken')::jsonb;
  assert d->'weakened_fields' = '["creator_share_pct_fail"]' and (d->>'rev')::int = 1, format('detail %s', d);
  assert (select rev from public.strategies where id = '20000000-0000-0000-0000-0000000009e1') = 1, 'not applied';
end $$;
-- mixed (one stricter, one weaker) rejected as a whole
do $$ declare d jsonb; begin
  d := pg_temp.expect_code($q$select public.update_strategy('20000000-0000-0000-0000-0000000009e1', 1, '{"top_holders_share_pct_max":30,"required_checks":["top_holders_share_pct"]}')$q$,
                           'GUARD_WEAKEN_REQUIRES_APPROVAL', 'mixed')::jsonb;
  assert d->'weakened_fields' = '["required_checks"]', format('mixed %s', d);
  assert (select settings->>'top_holders_share_pct_max' from public.strategies where id = '20000000-0000-0000-0000-0000000009e1') = '40', 'mixed not applied';
end $$;
-- strengthen-only and neutral changes apply
do $$ declare r jsonb; begin
  r := public.update_strategy('20000000-0000-0000-0000-0000000009e1', 1, '{"guard_checks":{"creator_share_pct_fail":10},"top_holders_share_pct_max":30,"score_threshold":80}');
  assert (r->>'rev')::int = 2 and r->'settings'->'guard_checks'->>'creator_share_pct_fail' = '10', format('strengthen %s', r);
  r := public.update_strategy('20000000-0000-0000-0000-0000000009e1', 2, null, 'G2');
  assert (r->>'rev')::int = 3, 'rename only';
  r := public.set_strategy_status('20000000-0000-0000-0000-0000000009e1', 'running', 3);
  assert r->>'status' = 'running', 'status only';
end $$;
select 'ALL 0007 GUARD WEAKEN SQL TESTS PASSED';
