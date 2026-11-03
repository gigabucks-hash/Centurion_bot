-- Contracts 1.1.6: coin-logo proxy state + manual moderation blocklist (docs/LOGO_PROXY.md).
-- Image bytes live in the API's disk cache (LOGO_CACHE_DIR); this table only records the current content hash
-- (`logo_hash`, the `v` of GET /v1/img/coin/{mint}) and failures, so REST wires can carry logo_hash.
-- Public data only (derived from public on-chain metadata), readable by any signed-in user; written by the API
-- with the service role. No foreign key to coins: the proxy serves any valid mint.
create table if not exists public.coin_logos (
  mint        text primary key check (public.is_base58_address(mint)),
  status      text not null check (status in ('ok', 'not_found', 'rejected', 'blocked')),
  logo_hash   text check (logo_hash is null or logo_hash ~ '^[A-Za-z0-9_-]{8,64}$'),
  reason      text check (reason is null or reason ~ '^[a-z0-9_]{1,40}$'),
  fetched_at  timestamptz not null default now(),
  retry_after timestamptz,
  check ((status = 'ok') = (logo_hash is not null))
);
alter table public.coin_logos enable row level security;
revoke all on public.coin_logos from public, anon, authenticated;
grant select on public.coin_logos to authenticated;
grant select, insert, update, delete on public.coin_logos to service_role;
create policy coin_logos_read on public.coin_logos for select to authenticated using (true);

-- Manual per-mint blocklist (no ML/NSFW classifier in the MVP). Operator-managed with the service role, e.g.
--   insert into public.coin_logo_blocklist (mint, reason) values ('<mint>', 'nsfw');
-- A blocked mint is answered 422 LOGO_REJECTED {reason: "blocked"}; cached files are not served.
create table if not exists public.coin_logo_blocklist (
  mint       text primary key check (public.is_base58_address(mint)),
  reason     text not null check (reason ~ '^[a-z0-9_]{1,40}$'),
  note       text check (note is null or length(note) <= 500),
  added_by   text,
  created_at timestamptz not null default now()
);
alter table public.coin_logo_blocklist enable row level security;
revoke all on public.coin_logo_blocklist from public, anon, authenticated;
grant select, insert, update, delete on public.coin_logo_blocklist to service_role;
