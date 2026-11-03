# PERF_SECURITY (API performance + response security, brief)

Status: 2026-11-03, Backend. Local measurements only (throwaway Postgres 17 seeded by the test harness, one Node
process, loopback); not a production SLO. Paper only; nothing here touches keys or transactions.

## 1. Bench
`PGHOST=/tmp PGPORT=55432 PGUSER=postgres node api/bench/load.ts` (env `BENCH_N` 400, `BENCH_C` 16, `BENCH_SSE` 20,
`BENCH_SSE_POLL_MS` 500). Outputs: `api/bench/baseline.2026-11-01.json` (before 0021),
`api/bench/after-0021.2026-11-03.json` (after). Latency ms, p50 / p95:

| Endpoint | Before (11-01) | After 0021 (11-03) |
|---|---|---|
| GET picks (50) | 2341 / 3165 | 65 / 100 |
| GET coins (50) | 2075 / 2787 | 101 / 147 |
| GET positions closed (50) | 194 / 274 | 21 / 30 |
| GET exit-reason stats | 203 / 284 | 8 / 12 |
| GET events (100) | 25 / 30 | 19 / 27 |
| GET approvals | 10 / 15 | 9 / 15 |
| PATCH strategy (tighten) | 4 / 8 | 3 / 5 |
| SSE fan-out, 20 clients, poll 500 ms | 355 / 499 | 346 / 497 (bounded by the poll interval) |

The bench's `POST approvals/{id}/quote` and `close/preview` rows report every request as an error status (cause not investigated
yet; likely unquotable seed fixtures or write rate limits), so their latency is the error path, not a real quote. Open:
give the bench quotable fixtures.

## 2. Cause and fix (migration `0021_perf_rls_initplan.sql`)
Every RLS SELECT policy called the SECURITY DEFINER `is_workspace_member(workspace_id)` once per row (~40 us, not
inlinable), so a 50-row picks/coins page checked all 20k rows. Fix: `public.my_workspace_ids()` (STABLE SECURITY
DEFINER, `search_path=''`) in a scalar sub-select (InitPlan, once per statement) + `= any()`. Same semantics; RLS stays
on for every table; roles/commands/names unchanged. Plus keyset indexes `picks_ws_mode_created_idx`,
`picks_ws_mode_mint_created_idx`. Verified by `scripts/check_sql.sh` (all SQL tests) and the API suite.

## 3. Compression
JSON bodies >= 1 KiB (`COMPRESS_MIN_BYTES`) are compressed when `Accept-Encoding` allows: br (quality 4) > gzip
(level 5); `q=0` honoured; `Vary: Accept-Encoding`. SSE and images are not compressed here.

## 4. Security headers (every API response, `api/src/http.ts` `SECURITY_HEADERS`)
`Strict-Transport-Security: max-age=63072000; includeSubDomains` (effective behind the TLS terminator, TLS 1.2+),
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-site`,
`Cache-Control: no-store`. The logo image route uses its own set (`Cross-Origin-Resource-Policy: cross-origin`, see
LOGO_PROXY.md §1). Tests: `api/test/perf_security.test.ts`.

## 5. Open
- Phase 7 devnet latency bench for the real-money path (REAL_MONEY_OPTIONS §3 estimates) not started (Real is gated).
- `cargo-audit` / `npm audit` not part of CI yet (cargo-audit install pending review).
