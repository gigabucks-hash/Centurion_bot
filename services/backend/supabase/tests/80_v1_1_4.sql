-- Tests for 0009 (contracts 1.1.4): time_stop_s / stall_exit validation, exit_reason stall, market cap columns.
\set ON_ERROR_STOP 1
\set QUIET 1
do $$
declare
  good jsonb[] := array[
    '{"time_stop_s": 300}', '{"time_stop_s": null}', '{"time_stop_s": 1}', '{"time_stop_s": 604800}',
    '{"stall_exit": null}', '{"stall_exit": {"window_s": 60, "min_move_pct": 2}}',
    '{"stall_exit": {"window_s": 5, "min_move_pct": 0.01}}', '{"time_stop_s": 900, "stall_exit": {"window_s": 86400, "min_move_pct": 100}}'
  ]::jsonb[];
  bad jsonb[] := array[
    '{"time_stop_s": 0}', '{"time_stop_s": 604801}', '{"time_stop_s": 1.5}', '{"time_stop_s": "60"}',
    '{"stall_exit": 5}', '{"stall_exit": {"window_s": 60}}', '{"stall_exit": {"min_move_pct": 1}}',
    '{"stall_exit": {"window_s": 4, "min_move_pct": 1}}', '{"stall_exit": {"window_s": 86401, "min_move_pct": 1}}',
    '{"stall_exit": {"window_s": 60.5, "min_move_pct": 1}}', '{"stall_exit": {"window_s": 60, "min_move_pct": 0}}',
    '{"stall_exit": {"window_s": 60, "min_move_pct": 101}}', '{"stall_exit": {"window_s": 60, "min_move_pct": "1"}}',
    '{"stall_exit": {"window_s": 60, "min_move_pct": 1, "extra": 1}}', '{"stall_exit": {"window_s": null, "min_move_pct": 1}}',
    '{"max_concurrent_positions": 2.5}'
  ]::jsonb[];
  s jsonb;
  ok boolean;
begin
  foreach s in array good loop
    assert public.strategy_settings_valid(s), 'should be valid: ' || s;
  end loop;
  foreach s in array bad loop
    begin
      ok := public.strategy_settings_valid(s);
      raise exception 'should be invalid: %', s;
    exception when check_violation then null;
    end;
  end loop;
  raise notice 'ok: time_stop_s / stall_exit validation';
end $$;

-- exit_reason vocabulary: stall added, max_hold kept for time_stop_s
do $$ begin
  assert 'stall'::public.exit_reason is not null;
  assert 'max_hold'::public.exit_reason is not null;
  assert (select count(*) from unnest(enum_range(null::public.exit_reason))) = 14, 'exit_reason count';
  raise notice 'ok: exit_reason stall';
end $$;

-- market cap columns
insert into public.coins (mint, decimals, venue, market_cap_lamports, mcap_usd, mcap_as_of)
values ('7825dQ14LvPzUkfoVrUZCk52nuvZdUH4kCk4fEFPSkPc', 6, 'amm', 425000000000, 212500, '2025-10-29T01:06:40Z');
do $$ begin
  assert (select market_cap_lamports::text from public.coins where mint = '7825dQ14LvPzUkfoVrUZCk52nuvZdUH4kCk4fEFPSkPc') = '425000000000';
  begin
    insert into public.coins (mint, decimals, venue, market_cap_lamports) values ('F5wk1u5xTtpZ1VWDnzVwqRVyVywW8duokXDY2rbTt1Xt', 6, 'curve', 1);
    raise exception 'mcap without mcap_as_of accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.coins (mint, venue, market_cap_lamports, mcap_as_of) values ('F5wk1u5xTtpZ1VWDnzVwqRVyVywW8duokXDY2rbTt1Xt', 'curve', -1, now());
    raise exception 'negative mcap accepted';
  exception when check_violation then null;
  end;
  raise notice 'ok: market cap columns';
end $$;
delete from public.coins where mint = '7825dQ14LvPzUkfoVrUZCk52nuvZdUH4kCk4fEFPSkPc';
