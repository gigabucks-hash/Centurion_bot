-- API test fixtures (synthetic ids; the mint is a real Token-2022 pump mint, decimals 6 verified on mainnet).
\set ON_ERROR_STOP 1
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3');
insert into public.workspaces (id, name, owner_id) values
  ('10000000-0000-0000-0000-0000000000a1', 'api ws', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000a3', 'other ws', '00000000-0000-0000-0000-0000000000a3');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'viewer');
insert into public.strategies (id, workspace_id, name, status, settings) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'S1', 'running', '{}');
insert into public.coins (mint, venue, decimals, token_program, quote_mint) values
  ('Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump', 'curve', 6, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', null);
insert into public.positions (id, position_key, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports, cost_basis_lamports, entry_price_sol)
values
  ('60000000-0000-0000-0000-0000000000a1', 'apipos.1', '20000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-0000000000a1', 'Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump', 1000000000, 250000000, 250000000, '0.00000025'),
  ('60000000-0000-0000-0000-0000000000a2', 'apipos.2', '20000000-0000-0000-0000-0000000000a1',
   '10000000-0000-0000-0000-0000000000a1', 'Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump', 2000000000, 500000000, 500000000, '0.00000025');
-- one closed position for exit stats
update public.positions set status = 'closed', closed_at = opened_at + interval '90 seconds', sol_out_lamports = 600000000,
  exit_reason = 'profit_target' where id = '60000000-0000-0000-0000-0000000000a2';
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
   'buy_pick', 'apipick1', 250000000, true, now() + interval '10 minutes'),
  ('30000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a3', null,
   'buy_pick', 'otherpick', 250000000, true, now() + interval '10 minutes');
insert into public.portfolio_snapshots (workspace_id, cash_lamports, positions_cost_lamports, positions_value_lamports,
  equity_lamports, peak_equity_lamports, drawdown_bps, realized_pnl_lamports, unrealized_pnl_lamports, open_positions, as_of_seq)
values ('10000000-0000-0000-0000-0000000000a1', 29750000000, 250000000, 200000000, 29950000000, 30000000000, 16, 100000000, -50000000, 1, 1);
insert into public.events (id, workspace_id, strategy_id, ts, type, actor, payload)
select 'seed' || g || ':1761700000000:system.notice', '10000000-0000-0000-0000-0000000000a1', null, now(), 'system.notice', 'system',
       jsonb_build_object('code', 'SOURCE_DEGRADED', 'n', g)
  from generate_series(1, 3) g;
