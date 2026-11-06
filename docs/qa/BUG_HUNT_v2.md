# Bug hunt v2 — retest and focused audit

Date: 2026-11-06. Baseline: `main`, `HEAD = origin/main = 97faf0a` in `C:\cw\app`.
Paper-only. No app fixes, staging, commits, pushes, deploys, or token/contracts changes.
Owned deliverables: this file and `docs/qa/repro/v2/` only.

## F1–F5 retest

| ID | Status | Evidence |
|---|---|---|
| F1 — null all-time realized becomes zero in reconciliation note | **NOT FIXED (P2)** | `apps/web/app/(app)/pnl/page.tsx:93,149` still substitutes `realizedPnlSol ?? 0`. Independent expression repro prints `server realized=null`, `showReconcile=true`, `note all-time text=0.00`; exit 1 expected. Summary cards preserving null does not fix this note. |
| F2 — mobile UTC labelled WIB | **FIXED** | `apps/mobile/lib/core/format.dart:59-60`, `l10n_format.dart:97-107`: real formatters convert 03:00Z to 10:00 / 10.00 WIB / 10:00 AM WIB. Three tests pass, including midnight crossover. |
| F3 — web 1h control mismatch | **FIXED** | Real `parsePnlWindow('1h')` returns `1h`; source check confirms 1h option and parsed select binding in `apps/web/components/PnlFilters.tsx`. Seven checks pass. Code-level, not a new browser/pixel run. This is the original web finding, not a claim of mobile 1h parity. |
| F4 — moving relative paging range / cursor not range-bound | **FIXED** | Real `pagedRange` (`services/backend/api/src/rules.ts:153-172`) plus encode/decode: 13 checks pass, byte-identical page-2 lower bound, cursor-only pin, alternate windows and mismatched explicit bound rejected. API/DB regression suite also passes. |
| F5 — malformed UUID cursor reaches SQL/500 | **FIXED** | Real `decodeCursor` (`services/backend/api/src/wire.ts:216` onward): 8 checks pass (hyphens, length, grouping, non-hex, full-width, valid and ranged). API tests confirm 400 `CURSOR_INVALID` on positions/picks/fills/guard-changes, never 500. |

Artifacts are `f1_null_realized_retest.ts`, `f2_wib_retest.dart`, `f3_range_retest.ts`, `f4_paging_retest.ts`, `f5_cursor_retest.ts` under `repro/v2/`.
F1 uses copied page expressions with the real comparison/formatter; not a rendered-page E2E. All are read-only and require no data rollback.

## Confirmed new findings

### N1 — P2: unsafe SSE watermark skips a later-committing event

**Locations:** `services/backend/supabase/migrations/0001_init.sql:629-637` (`events_safe_seq`); consumer `services/backend/api/src/feed.ts:81-94`, especially empty-page cursor advancement at line 93. SSE starts/catches up with that watermark at `services/backend/api/src/sse.ts:103-107,159-173`.

The SQL function cannot see an uncommitted event row. With transaction A holding seq X and transaction B committing X+1, the visible B row makes the minimum-visible expression return X, although X itself is not committed. Two consumers can then move past X: the workspace `FeedHub` advances its cursor to `safe` on an empty page (`services/backend/api/src/feed.ts:93`), and the web client advances its resume watermark from `clock.safe_seq` (`apps/web/lib/realtime.ts:99`, sent back as `after_seq`/`Last-Event-ID` on reconnect). After A commits, `seq > X` excludes that event permanently from that walk. The row remains durable in Postgres; this is delivery loss, not database deletion. Desktop (`apps/desktop/src-tauri/src/sync.rs:190-195`) reacts to `safe_seq` by running a REST `after_seq` catch-up instead of adopting the watermark, so it is not included in this claim.

**Deterministic live reproduction:** `repro/v2/sse_safe_seq_race.mjs` uses three PostgreSQL connections, the actual migrated SQL function, and the feed's bounded query/cursor rule. Final checked run:

```text
X=6 X+1=7
FAIL safe_seq stays below the in-flight seq — safe=6 X=6
PASS the feed page does not contain the in-flight event
PASS the event is committed and visible after commit
FAIL resume from cursor 6 still returns the event — got=7
```

Exit 1 is intentional: assertions describe correct behavior. This is a live SQL + consumer-query reproduction, **not** an HTTP SSE-frame capture or a direct FeedHub invocation. No claim that every reconnect loses an event; the specified concurrent-commit ordering is required.

**Setup / rollback:** use an exclusively owned disposable local database named `bug_hunt_v2`; script refuses any other database name. Apply `services/backend/supabase/tests/00_local_shim.sql`, then all migrations in lexical order. Set local PG connection environment variables and `PGDATABASE=bug_hunt_v2`; run from repo root:

```powershell
node docs/qa/repro/v2/sse_safe_seq_race.mjs
```

Each run uses a fresh fixture workspace. Events are append-only: row DELETE is blocked. **Do not use a shared database or disable the append-only trigger.** Rollback means dispose of this entire dedicated scratch DB after all connections close, using `dropdb --if-exists bug_hunt_v2` with the local PostgreSQL CLI. The database was retained for inspection after testing; fixture rows remain there. Earlier diagnostic fixture rows also remain in local scratch DB `bug_hunt_test`. Neither is a production/shared database; neither is needed by the app.

### N2 — P2: mobile stale paging response contaminates the new range

**Locations:** `apps/mobile/lib/data/api/cursor_page.dart:71-98`, especially merge at 84-91. Reachable from `apps/mobile/lib/features/positions/pnl_report_screen.dart:64-66,79-84`: new summary bounds call `refresh()` on the same controller.

**Repro:** load initial range A, start `loadMore(cursor A)` and hold its response; change range and complete refresh B; then complete old page A. The real exported `PagedListController` has no request-generation guard. It appends A into B and overwrites B's cursor.

```text
after stale page: {items: [r30d-1, r7d-2, r7d-1], nextCursor: cursor-7d-2, loading: false}
expected:        {items: [r30d-1], nextCursor: cursor-30d, loading: false}
```

`repro/v2/mobile_paging_race_test.dart` fails one correctness assertion deterministically. The labels are distinct synthetic IDs to expose stale/duplicate membership: a 7d row is naturally also within 30d, so the error is stale page membership/order/deduplication and wrong paging cursor, not necessarily a timestamp outside 30d. A narrower new range can also receive wider-range rows. Tested controller logic, not emulator gestures. Rollback: none (in-memory fixture only).

## Desktop paging audit — confirmed freeze; race not promoted to runtime finding

`apps/desktop/src/components/pnlReportView.ts:203-208` preserves absolute `from/to` and omits relative `window` when bounds exist. `PnlReportDialog.tsx:154-155` uses it for subsequent pages: no fresh `now − window` calculation.

The dialog has the same apparent stale-append hazard at `PnlReportDialog.tsx:149-164`: `loadMore` appends into the current state after await; range tabs remain enabled at 279-284. `repro/v2/desktop_paging_race.ts` reproduces the copied updater's mixed result and checks its source presence, using the real `pnlPageArgs`. **Expression-level only; no React/DOM interaction harness.** Treat as follow-up candidate, not a separately confirmed UI bug. It intentionally exits 1 for the stale-merge result. No rollback required.

## Receipt money / BigInt audit

- Desktop helpers retain lamport strings / BigInt: `pnlReportView.ts:18-28,214-216` totals/reconciliation/sorting; receipt uses `receiptSol` / `receiptPct`; `apps/desktop/src/i18n/index.ts:125-131` preserves null as em dash. No reproducible new money defect established here.
- Mobile `apps/mobile/lib/data/api/wire.dart:172-176` maps locked `pnl_lamports`, `pnl_pct`, fees, exit price and hold. The model still has derivation fallbacks; do not claim their null-money branch is reachable for a normal closed ledger row without valid wire evidence.
- Web `apps/web/lib/contracts.ts:686-697` has numeric display conversion and fallbacks. Backend `0022_pnl_report.sql:43-48` supplies closed-row PnL/hold; schema `0001_init.sql:557-559,569-571` requires non-null in/out/fees and a close timestamp for closed rows. Thus null closed-row PnL/in/out/time fixture alone is not a reproducible current-backend bug. This does not negate F1's nullable portfolio-summary note.
- No assertion that arbitrary int64 lamports survive web Number conversion exactly; no end-to-end extreme-value money fixture was run. No new receipt bug is promoted without reachable evidence.

## Gates and limits

| Gate | Checked result |
|---|---|
| F1 independent expression repro | Expected exit 1; NOT FIXED, fabricated 0.00 |
| F2 Flutter formatter repro | 3/3 pass |
| F3 source + real parser | 7/7 pass |
| F4 independent real-functions repro | 13/13 pass |
| F5 independent real-functions repro | 8/8 pass |
| Backend `node --test --test-concurrency=1 test/paging_range.test.ts` | 10/10 pass against local disposable harness DB |
| Web `npm test` | 73 tests: 72 pass, 1 skip |
| N1 live SQL race | Expected exit 1, two failed correctness checks, event skipped |
| N2 real mobile controller | Expected exit 1, stale rows and cursor observed |
| Desktop copied-updater candidate | Expected exit 1; expression-level only |
| Scope whitespace check | `git diff --check -- docs/qa` clean at handoff |

Node 22.23.4; Flutter local SDK; PostgreSQL 17. Node typeless-package warnings and successful psql NOTICE output are not test failures. No browser/device/Tauri runtime, production DB, deploy, full repository suite, or HTTP SSE capture performed in this pass. Only the named gates are claimed.

Lead: stage only `docs/qa/BUG_HUNT_v2.md` and `docs/qa/repro/v2/` for this assignment; `QA_PLAN_v1.md` and `demo-data.md` belong to other owners. Do not interpret intentional red bug repros as green release gates.
