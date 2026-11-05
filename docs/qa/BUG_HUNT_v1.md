# Bug hunt v1 — PnL + SIWS

Audit date: 2026-11-06. Baseline: committed `main` / `origin/main` **77a10e3** (includes 62ebda0, bc93f50 and bfed32e). “Live” here means committed main, **not a verified production deployment**. Paper-only. No application fixes, staging, commits, pushes, deployment, secrets or token changes were performed for this assignment.

The shared tree contains other owners' uncommitted work. Findings below reference HEAD line numbers, not their in-flight edits. SQL reproductions ran on throwaway `bug_hunt_test`, PostgreSQL 17.11, with the local shim and migrations applied; all fixture changes roll back. Migration 0023 was present locally but does not alter the reproduced semantics.

## Verified findings

| ID | Severity | Area | Finding |
|---|---|---|---|
| F1 | P2 | Web/null | Reconciliation note fabricates zero when all-time realized is unreported |
| F2 | P2 | Mobile/WIB | UTC or non-Jakarta device clocks are labelled WIB without conversion |
| F3 | P3 | Web/range | `?window=1h` computes 1 hour but dropdown displays 1D |
| F4 | P2 | Web + desktop/window paging | Relative window is recalculated on each page/request; boundary rows disappear |
| F5 | P3 | API/cursor validation | Malformed UUID cursor passes validation, then fails PostgreSQL cast |

P2 = incorrect financial/time reporting or missing ledger rows under the stated condition, not loss of funds. P3 = misleading control or malformed-input handling. No P0/P1 or authentication bypass was verified.

### F1 — Missing realized becomes a reported zero in the reconciliation note

**Locations:** `apps/web/app/(app)/pnl/page.tsx:85,138-140`; null originates at `services/backend/api/src/routes.ts:362-374` when `portfolio_latest` has no row.

**Reproduce:**
1. Run `docs/qa/repro/pnl_null_realized.sql` on the migrated scratch DB. It creates one current-epoch close without a portfolio snapshot.
2. Observe `portfolio_rows = 0`, `closed_count = 1`, window realized `150000000` lamports. The API's all-time realized is consequently null, not zero.
3. Run `node --experimental-strip-types docs/qa/repro/pnl_null_realized_repro.ts` from the repo root. This executes the page's reconciliation expressions using the actual `sameLamports` and package formatter.
4. Output: `reconciled=false`, `showReconcile=true`, `server realized=null`, **note all-time text = `0.00`**.

**Expected:** unknown remains `—` / unavailable, or omit an uncheckable reconciliation. **Impact:** the card correctly shows unavailable after bfed32e, but its explanatory note still claims a flat all-time result. This is an allowed DB state; it does not require malformed money. Expression-level plus SQL repro, not a full HTTP/browser integration repro.

### F2 — Mobile WIB label does not imply WIB conversion

**Locations:** `apps/mobile/lib/core/format.dart:8,58`; `apps/mobile/lib/core/l10n_format.dart:93-98`; PnL call sites `apps/mobile/lib/features/positions/widgets/closed_trade_row.dart:37` and `positions_screen.dart:339`. Backend wire UTC: `services/backend/supabase/migrations/0022_pnl_report.sql:40-41`.

**Reproduce:** from `apps/mobile`, run `flutter test ../../docs/qa/repro/wib_time_test.dart`. **3/3 pass**, asserting the actual faulty behavior:
- `DateTime.parse('2026-11-06T03:00:00.000Z')` → `fmtTime` returns **03:00**, and the PnL row appends `WIB`.
- The correct WIB clock for that instant is **10:00**.
- `formatTime(wire, 'id')` returns **03.00 WIB**; EN returns **3:00 AM WIB**.

**Impact:** seven-hour error for UTC inputs; mock positions use device-local `DateTime.now`, so non-WIB devices also get their own clock falsely labelled WIB. This is a verified formatter/component-input defect. The mobile production Position REST adapter is not implemented in this baseline; do **not** interpret this as a demonstrated end-to-end production REST failure. Current mock PnL is affected on a non-Jakarta device. In-flight ARB work does not change `fmtTime`.

### F3 — One-hour report visually claims 1D

**Locations:** `apps/web/lib/pnl-report.ts:8,23-25`; `apps/web/components/PnlFilters.tsx:26-30`.

**Reproduce:** serve the web mock app, sign in via its simulated wallet, open `/pnl?window=1h`. Browser readback:
- strip accessible label: **Closed trades in the last 1 hour**;
- range select: **value `24h`, selectedIndex 0, text `1D`**;
- options: `24h`, `7d`, `30d`, `all`, no `1h`.

Artifact: `docs/qa/repro/shots/pnl-window-1h.png`. `pnl_ui_repro.mjs` records the selector values. **Expected:** normalize unsupported range consistently or offer the accepted range. **Impact:** user sees a 1D control while reading one-hour statistics. It is not a blank select in the tested Chromium/React build.

### F4 — Relative ranges move between pages and summary/ledger requests

**Locations:** `services/backend/api/src/rules.ts:91-106`; `apps/web/app/(app)/pnl/page.tsx:42-47,194-203`; `apps/web/lib/http-api.ts:108-120`; desktop `apps/desktop/src-tauri/src/backend/http.rs:826-861`.

**Reproduce:** run `docs/qa/repro/pnl_paging_window.sql`. It mirrors the actual range/keyset predicates, advancing the request clock deterministically rather than sleeping:
- 60 closes in a one-hour window; page 1 returns 50;
- page 2 immediately has **10** rows;
- page 2 with the same relative window ten minutes later has **0** rows: **10 omitted relative to page 1's range**.

The web sends `window` again, not the summary's echoed `from`, on both initial requests and older-page links. The desktop separately requests summary and its ledger with `window`, also allowing boundary disagreement. A close in the interval between their two calculated lower bounds may count in one and not the other. The ten-minute example quantifies the paging case; millisecond drift is enough for a boundary close.

**Expected:** pin bounds for a report/paging session if “same range, no lost rows” is required. **Impact:** a moving report cannot be exhaustively paged or reconciled to its initial strip. No duplicate was observed. The SQL also demonstrates that reusing a cursor with another filter silently skips rows; this is **not counted as a separate UI bug** because bc93f50 already removes cursor on ordinary filter changes. A cursor is a position, not a filter-bound snapshot.

**Limit:** deterministic query-level reproduction, not an end-to-end timed HTTP test. Concurrent inserts/updates are not covered. Mobile echoes the summary bounds and avoids this specific relative-bound drift.

### F5 — Cursor UUID validation accepts 36 hyphens

**Locations:** `services/backend/api/src/wire.ts:185,191-197`; use as UUID at `routes.ts:132-139`; unexpected errors handled by `src/server.ts:46-52`.

**Reproduce:** `node --experimental-strip-types docs/qa/repro/cursor_validation_repro.ts`:
`decodeCursor` returns `{ts:"2026-11-06T03:00:00.000000Z",id:"------------------------------------"}` rather than `bad`.

PostgreSQL check `select '------------------------------------'::uuid` raises **invalid input syntax for type uuid**. The positions handler binds that accepted value as `$9::uuid`. Its generic error path produces INTERNAL rather than CURSOR_INVALID.

**Expected:** reject malformed UUID cursor before querying. **Impact:** an authenticated malformed request triggers an avoidable server-error path; no data disclosure or auth bypass demonstrated. Decoder + DB-cast reproduction verified; full HTTP status not separately exercised.

## Latent mode/epoch risks — NOT reachable in current paper-only main

Evidence: `docs/qa/repro/pnl_mode_isolation_latent.sql`. It first confirms the real snapshot check rejects `mode=real`, then temporarily drops checks **inside a rolled-back scratch transaction** to model a future Real rollout. These are not current live incidents:

- **L1 (Phase-7 P2):** `0002_contracts_v1_1.sql:300-305` uses `distinct on (workspace_id)`, not workspace+mode. A newer real snapshot hides the practice snapshot: `portfolio_latest` has one row, and the practice-filtered query has **0**. `/stats/pnl` then loses the practice card.
- **L2 (Phase-7 P1 risk, not current severity):** `0002_contracts_v1_1.sql:346-354` closes/archives every mode and advances workspace practice_epoch. Scratch reproduction: a real open row becomes **closed, archived=true, exit_reason=practice_reset**, retains epoch 0 while workspace becomes 1. `0022_pnl_report.sql:69` and `routes.ts:127-128` also apply practice epoch to every mode. Review before removing practice-only constraints; do not enable Real on this evidence alone.

## Checks without a verified defect

- **Money:** reviewed `pnl = sol_out - sol_in`, reported-fee context (no second subtraction), decimal percentage division, BigInt total addition, desktop BigInt sorting, mobile partial-TP cost treatment. No ordinary paper-flow arithmetic bug reproduced. Web converts display SOL to Number; large-value exactness was not exhaustively proven and is not certified by this audit.
- **Stable-bound keyset:** `docs/qa/repro/keyset_paging.sql` returned **137/137 rows over 3 pages** with many tied timestamps. Correct `(timestamp,id)` descending predicate. This is a fixed-fixture SQL check, not a concurrency guarantee.
- **Null close time candidate rejected:** `positions_check` requires closed status iff closed_at is present, so a current closed row with null close time cannot establish the proposed aggregate/ledger discrepancy.
- **SIWS/auth:** reviewed strict message reconstruction, address/domain/URI/chain/time/statement nonce binding, ed25519 verification, single-use nonce, owner allowlist, HS256 algorithm restriction, audience/expiry/sid checks, refresh successor/grace/reuse revocation, and per-request session_check. **No SIWS bypass verified.** No new auth integration suite was executed for this audit; code review is not a penetration-test certificate.
- Already-fixed cursor-on-filter change (bc93f50) and null summary card (bfed32e) are not reported as new defects.
- Mode-tab filter reset is not counted: current paper-only UI renders one badge, so a normal reachable two-mode interaction was not reproduced.

## Gates and handoff

- Flutter targeted repro: **3/3 pass** (asserts current defect, not desired behavior).
- SQL null-realized repro: expected 0 portfolio rows / 1 close / 150000000 window lamports; rollback.
- SQL stable keyset: 137 seen / 3 pages; rollback.
- SQL moving window: 10 omitted; foreign filter cursor skips 50; rollback.
- SQL latent mode checks: current rejection confirmed, modeled L1/L2 reproduced; rollback.
- Browser mock readback: one-hour strip vs 1D selected control confirmed.
- Node null/cursor repro outputs confirmed. No full build/lint/API suite claim is made for this documentation-only change.
- Some successful psql NOTICE / Node warning output is rendered by Windows PowerShell as native stderr; statements reached DO/ROLLBACK as recorded. Initial draft runners had import/path errors; those are harness errors, not product findings.

Only `docs/qa/BUG_HUNT_v1.md` and the named `docs/qa/repro/` artifacts belong to this assignment. Other QA documents and other owners' working-tree changes must not be staged as part of this report. Lead assigns fixes and commits/pushes.
