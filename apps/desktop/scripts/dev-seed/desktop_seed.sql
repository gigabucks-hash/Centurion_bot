-- Desktop smoke-test extras on top of services/backend/api/test/seed.sql (Backend's fixtures, reused
-- read-only). Synthetic ids only; practice mode; no keys, no wallets.
\set ON_ERROR_STOP 1
-- A pending pick kept for the error cases (422 reject_reason validation, 428 missing rev, 409 stale rev).
insert into public.approvals (id, workspace_id, strategy_id, kind, subject, amount_lamports, is_first_buy, expires_at) values
  ('30000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
   'buy_pick', 'desktop-smoke-errors', 250000000, false, now() + interval '30 minutes');
