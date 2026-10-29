# Real-transport smoke test (desktop ↔ Backend API)

Run 2026-10-29 18:23 WIB. Desktop `HttpTransport` (Rust, `src-tauri/src/backend/http.rs`) against
`services/backend/api` at repo HEAD a04f849 (plus Backend's uncommitted 1.1.4 work in the shared tree; the server
reports `contracts_version` 1.1.4). Practice only, `TRADING_MODE=paper`, local Postgres (Backend's test
instance, `PGHOST=/tmp PGPORT=55432`), throwaway database `sentra_desktop_smoke`.

```
apps/desktop/scripts/smoke-real.sh           # fresh DB → API on :18080 → cases → stop   (≈ 12 s)
apps/desktop/scripts/smoke-real.sh --serve   # fresh DB + API only; writes .env.smoke.local for the app
```

- **Nothing is installed.** The script needs psql, node ≥ 22.18, cargo, openssl, curl and
  `services/backend/api/node_modules`, and stops with exit 3 if one is missing. reqwest 0.12 (rustls) was
  already in the local cargo cache; it builds `--offline`.
- **Dev JWT:** HS256 signed with `SENTRA_DEV_JWT_SECRET` from `apps/desktop/.env.local`. The script generates
  that file on the first run (umask 077) and refuses to run unless git ignores it. The token is minted with
  Backend's own `signJwt()`: owner of the seeded workspace, scopes `read` + `trade`, `sentra_client=desktop`,
  15 min. The secret and the token are never printed, logged or committed. The HTTP client's `Debug` output
  redacts the token, and so does its network error text.
- **Seed:** Backend's fixtures, reused read-only (`supabase/tests/00_local_shim.sql`, all migrations,
  `api/test/seed.sql`), plus `scripts/dev-seed/desktop_seed.sql` (one extra pending pick used for the error
  cases). Wrapper: `scripts/dev-seed/reset-db.sh`. No seed helper from Backend is needed.
- **App switch:** `SENTRA_BACKEND=http://127.0.0.1:18080` (+ `SENTRA_WORKSPACE_ID`, `SENTRA_BACKEND_TOKEN`).
  Unset → the in-process mock (default). Plain `http://` is allowed to loopback only. A set but unusable value
  stops the app instead of silently falling back to the mock.

## Results: 35 / 35 PASS

| Case | Result |
|---|---|
| healthz (practice, real disabled, contracts 1.1.x ≥ 3) | PASS |
| Reads decode into the desktop mirror: workspace, portfolio, strategies, exit-reasons, coin timeline, events page | PASS (6) |
| Approve: token from `GET /approvals/{id}`, `If-Match` + `expected_rev` + `Idempotency-Key`, rev 1→2, `reject_reason: null` | PASS |
| Approve replay (same key + same body → `replayed: true`) | PASS |
| Same key + different body → `422 IDEMPOTENCY_KEY_REUSED` | PASS |
| Skip with `reject_reason: not_tradeable` → rejected, echoed on the response, `ApprovalWire` and `proposal.rejected` | PASS (2) |
| `reject_reason` with approve → 422; unknown value → 422 `VALIDATION_FAILED` | PASS (2) |
| 428: close without `If-Match`, decide without rev, pause without rev, close without `Idempotency-Key` | PASS (4) |
| 409 with `current`: close stale rev (`VERSION_CONFLICT`), decide stale rev (`VERSION_CONFLICT`, `current` decodes as `ApprovalWire`), pause stale rev (`STRATEGY_REV_CONFLICT`) | PASS (3) |
| Pause with rev (rev 1→2, status paused) | PASS |
| Close `fraction_bps=5000` (`status: queued`, `job_id`, `fill: null`) + replay; `fraction_bps` 0 and 10001 → `422 INVALID_FRACTION` | PASS (4) |
| SSE: catch-up after `Last-Event-ID`, seq-ordered; `mark` frame from `pg_notify`; `clock` frame | PASS (3) |
| SSE resume after a disconnect: `Last-Event-ID` wins over `after_seq=0`, only new events (`order.submitted` from the close), no duplicates | PASS |
| Practice reset → epoch 1, 30 SOL; replay → `replayed: true` + `Idempotent-Replayed` | PASS (2) |
| Second reset → `429 RESET_COOLDOWN`, `Retry-After: 86400`, `error.next_allowed_at`; surfaced to the UI as `[next_allowed_at=…] [retry_after_s=…]` | PASS (2) |
| Contract scans over 46 raw bodies / SSE frames: timestamps, 409 `current` type + `request_id`, `reject_reason` key, SSE seq strings | 1 mismatch (below) |

Headless GUI: the app (`SENTRA_BACKEND` from `--serve`) connects over HTTP. The activity feed shows
"Terhubung ke backend (http)"; cash 29.75 and equity 29.95 paper SOL come from `/portfolio/overview`; skew is 0.0 s
(`docs/real-transport-smoke.png`).

## Contract mismatches

Server vs `packages/contracts` (1.1.3, committed):

| # | Endpoint | Expected (contract) | Actual (server) |
|---|---|---|---|
| S1 | `POST /v1/workspaces/{ws}/practice/reset` → 200, `next_allowed_at` (also on the idempotent replay) | RFC 3339 UTC, ms precision (EVENTS_SCHEMA §1, `"2026-10-30T11:18:58.055Z"`) | `"2026-10-30T18:23:53.31534+07:00"`: the DB session offset and microseconds come through from the `reset_practice()` jsonb. The 429 path is normalized (`…Z`). The desktop parses both, but other clients may not |

Unspecified in the contract (worth one line in API_ENDPOINTS):

| # | Endpoint | Observed |
|---|---|---|
| U1 | any write without `Idempotency-Key` | `428 PRECONDITION_REQUIRED {hint: "send Idempotency-Key"}`. API_ENDPOINTS §2 says the key is required but not which status a missing key gets |
| U2 | `POST /positions/{id}/close` with no simulated-fill worker running | `status: queued`, `job_id`, then only `order.submitted` on SSE (no `fill.simulated` / `position.updated`). That matches "or async" in §4.4; a full close cycle needs the executor worker in the smoke setup |

Desktop vs contract (desktop-side; fixed or adapted in this change):

| # | What | Fix |
|---|---|---|
| D1 | The desktop `EventPage` required `has_more` | The contract has none (`next_after_seq` + `safe_seq`). HttpTransport derives it from a full page (`items.len() == limit`) |
| D2 | The desktop `PortfolioSnapshot` required `drawdown_pct` | `PortfolioWire` (= `portfolio_latest`) has only `drawdown_bps`. HttpTransport derives `drawdown_pct = bps / 100` |
| D3 | The desktop expected `ApiItem` (`{data}`) for practice reset, strategies and exit-reasons | Reset is flat `{epoch, …, server_now}`; lists are `{items, next_cursor, server_now}`. Adapted in HttpTransport |
| D4 | The mock returned the **new** position rev in `ClosePositionResponse.position` | The contract says the position "rev at request time". The mock now matches; the desktop takes the new rev from `position.*` / `order.filled.position_rev` (`apply_close` only moves rev forward) |
| D5 | The mock required `If-Match` on practice reset (428 without) | The contract says body `{}` + `Idempotency-Key` only. The mock no longer requires it (a stale If-Match is still refused); the desktop still sends the workspace rev, which the server ignores |

Gaps before the desktop can run on the real server (not part of this smoke test):

- **Bootstrap from REST:** the desktop builds its queue and positions from events only. It has no `GET /approvals?status=pending` or
  `GET /positions?state=open` bootstrap. Rows that exist without events in the replay window (the SQL seed, or after event
  retention) stay invisible (the empty queue in the screenshot).
- **UI chrome still says mock:** "src: mock", "backend (mock) online", "MOCK TTL 90S", "(mock)" suffixes. These need a
  transport label in the snapshot.
- **Marks:** the screener/candles feed comes from the mock engine. Real marks arrive only via `pg_notify`
  (ingest c3de83a), and there are no `coin.detected` / `screener.scored` producers in the smoke setup.
- **Auth:** the dev token comes from the environment. Production: session from Supabase Auth, refresh, OS keychain (`keychain` feature).
- **Contracts 1.1.4:** committed mid-run as 1753c21. The desktop mirror is now 1.1.4 (`ExitReason::Stall`,
  `MarketCapFields` on coin.detected / screener.scored / pick.created → screener Mcap column, see
  `docs/mcap-column-1.1.4.png`). A re-run against the 1.1.4 mirror: 35/35 PASS, and the healthz version NOTE is gone.
  UX gap: i18n 0.4.5 has no `exit_reason.stall` copy, so the desktop uses a local label ("Harga stagnan").

## Raw output

```
PASS healthz: contracts_version=1.1.4 mode="practice"
NOTE server contracts_version 1.1.4 != desktop mirror 1.1.3 (additive 1.1.x; unknown fields are ignored)
PASS read workspace: rev=1 epoch=Some(0)
PASS read portfolio: cash=29750000000 equity=29950000000
PASS read strategies: 1 strategies
PASS read exit-reasons: 1 rows
PASS read coin timeline: 0 events
PASS read events page: 3 events, safe_seq=3
PASS approval detail token: rev=1 token=issued
PASS approve: status=Approved rev=2 reject_reason=None
PASS approve replay (same key + body): replayed=true
PASS same key + different body → 422: IDEMPOTENCY_KEY_REUSED: Idempotency-Key dipakai ulang dengan isi permintaan yang berbeda
PASS approve + reject_reason → 422: VALIDATION_FAILED: Permintaan atau pengaturan gagal divalidasi
PASS unknown reject_reason → 422: VALIDATION_FAILED: Permintaan atau pengaturan gagal divalidasi
PASS skip (reject_reason=not_tradeable): status=Rejected reject_reason=Some(NotTradeable)
PASS close without If-Match → 428: PRECONDITION_REQUIRED: penulisan tanpa If-Match/rev
PASS decide without rev → 428: PRECONDITION_REQUIRED: penulisan tanpa If-Match/rev
PASS close without Idempotency-Key → rejected: PRECONDITION_REQUIRED (PRECONDITION_REQUIRED: penulisan tanpa If-Match/rev)
PASS close stale rev → 409 with current: VERSION_CONFLICT current_rev=Some(1) current=true
PASS decide stale rev → 409 VERSION_CONFLICT with current: VERSION_CONFLICT: diubah di tempat lain ()
PASS pause stale rev → 409 STRATEGY_REV_CONFLICT with current: STRATEGY_REV_CONFLICT: diubah di tempat lain (name, status)
PASS pause without rev → 428: PRECONDITION_REQUIRED: penulisan tanpa If-Match/rev
PASS pause with rev: rev 1→2 status=Some("paused")
PASS sse catch-up after Last-Event-ID: 3 events after seq 3 (approve/skip/pause), ordered=true
PASS sse mark frame (pg_notify): notify=true mark=true
PASS sse clock frame: clock=true
PASS close fraction_bps=5000: status=queued order=afa0e4db-32f2-4a6d-8c18-060e6910416d position.rev=1 fill=false job_id=Some(1)
PASS close replay: replayed=true
PASS close fraction_bps=0 → 422: INVALID_FRACTION: Porsi penjualan harus 1 sampai 10000 bps
PASS close fraction_bps=10001 → 422: INVALID_FRACTION: Porsi penjualan harus 1 sampai 10000 bps
PASS sse resume (Last-Event-ID wins over after_seq=0): 1 new events after 6: order.submitted
PASS proposal.rejected.reject_reason: not_tradeable
PASS practice reset: epoch=1 next_allowed_at=2026-10-30T18:23:53.31534+07:00
PASS practice reset replay: replayed=true
PASS practice reset cooldown → 429 + Retry-After: status=429 code="RESET_COOLDOWN" Retry-After=Some(86400) next_allowed_at="2026-10-30T11:23:53.315Z"
PASS cooldown surfaced to UI tags: RESET_COOLDOWN: Reset practice hanya sekali per 24 jam; lihat error.next_allowed_at [next_allowed_at=2026-10-30T11:23:53.315Z] [retry_after_s=86400]
MISMATCH POST /v1/workspaces/10000000-0000-0000-0000-0000000000a1/practice/reset → 200: expected .next_allowed_at RFC 3339 UTC ms (EVENTS_SCHEMA §1, "2026-10-29T08:42:00.123Z"); got 2026-10-30T18:23:53.31534+07:00
scanned 46 raw bodies/frames
SUMMARY fails=0 mismatches=1
  mismatch: POST /v1/workspaces/10000000-0000-0000-0000-0000000000a1/practice/reset → 200: expected .next_allowed_at RFC 3339 UTC ms (EVENTS_SCHEMA §1, "2026-10-29T08:42:00.123Z"); got 2026-10-30T18:23:53.31534+07:00
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 35 filtered out; finished in 9.73s
```
