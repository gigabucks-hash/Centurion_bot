# QA plan v1 — paper trading end to end

**Owner:** Product Tester · **For:** Apex Dev Lead · **Version:** 1.1 (6 Nov 2026, 03:10 WIB)
**Scope:** web, desktop, mobile against the mock data source. Paper only; no secrets, no deploy.
**Invariants under test:** integer lamports server-side; clients never re-sum totals; one workspace mode
per read; WIB (GMT+7) times; sign + label on every PnL; null → em dash; token pin 0.3.4 unchanged.

## 1. Environment actually used

| Target | How | Data |
|---|---|---|
| Web | `cd apps/web && npm run dev` → http://localhost:3100 | mock (`ws_mock`), in-memory |
| Desktop | `cd apps/desktop && npm run dev` → http://localhost:1420 | `browserMockAdapter` (no Tauri IPC) |
| Mobile | `flutter test` / `flutter analyze` (no emulator on this box) | widget tests |
| Repo | `C:\cw\app`, `HEAD = origin/main = 77a10e3` | 42 dirty paths from 6 agents, `docs/qa` mine |

Screenshots and DOM measurements were taken in the private browser at 1024/1280/1440 CSS px, dark
theme, EN and ID. All data is mock/example data.

## 2. Gates at `77a10e3` (final tree, including other agents' uncommitted work)

| Gate | Result |
|---|---|
| web `npm run typecheck` (`next typegen && tsc --noEmit`) | **exit 0** |
| web `npm test` | **73 tests: 72 pass, 1 skip, 0 fail** (was 72 at bc93f50) |
| web `npm run build` | **exit 0**, 36 routes, `/pnl` dynamic, standalone config builds |
| desktop `npm run test:ui` | **31/31 pass** (+2 new receipt tests) |
| desktop `npm run build` | **exit 0**, 646 ms |
| mobile `flutter analyze` | **No issues found** |
| mobile `flutter test` | **248/248 pass** (+1 receipt test) |
| mobile `dart format --set-exit-if-changed lib test` | 109 files, **0 changed** |
| mobile vendored pins (sha256 computed directly; no bash on this box) | **4/4 match** — ARB en `fc1ee202…`, ARB id `1d896a4c…`, tokens `5043960a…`, Inter Bold `28831609…` |
| CI web `77a10e3` | **success** |
| CI mobile `c213821` | success (APK/AAB + symbols) |

Not run: `cargo test` (local EXE fails `0xc0000139`; CI only), Docker image build (no engine), Play
upload (no secrets), production deploy (out of scope).

## 3. Executed checklist and results

Legend: **PASS** = observed in the running UI or a gate. **FAIL** = reproduced defect (see §4).
**UNVERIFIED** = cannot be tested on this box; reason given.

### 3.1 Login / session — web, mock

| ID | Check | Result |
|---|---|---|
| AUTH-01 | Connect Phantom → message review (domain, nonce, URI, expiry) → sign → lands on requested page (`/pnl` preserved from `?next=`) | **PASS** |
| AUTH-02 | Signed-out `/pnl` redirects to `/login?next=%2Fpnl` | **PASS** |
| AUTH-03 | Guarded sign-in: Connect disabled while connecting; Sign disabled while waiting for Phantom | **PASS** |
| AUTH-04 | Expired/replayed nonce rejected by the real API | **UNVERIFIED** — needs local API + Postgres; mock never expires a nonce |

### 3.2 Portfolio / dashboard — web, mock

| ID | Check | Result |
|---|---|---|
| PORT-01 | Overview renders cash, equity, realized, open positions, awaiting approval, strategy table | **PASS** |
| PORT-02 | Paper banner + `EXAMPLE DATA` chip visible on every route | **PASS** |
| PORT-03 | Card realized/unrealized/total are wire values, total = realized + unrealized (no client re-sum visible) | **PASS (display)**; arithmetic cross-check against DB **UNVERIFIED** |
| PORT-04 | Coin logos/identicons present on dashboard and ledger rows | **PASS** |
| PORT-05 | Dashboard and Positions agree on open-position count | **FAIL** — dashboard `6 / 21 · 1.40 paper SOL`, `/positions` `2 open · 0.50 paper SOL` in the same session (D4) |

### 3.3 Approvals — web, mock

| ID | Check | Result |
|---|---|---|
| APP-01 | Approve opens a review sheet with price, min received, network/priority/swap fee, slippage, total (max), then confirms | **PASS** |
| APP-02 | Confirm is disabled while the quote refreshes; enabled only with a fresh quote | **PASS** |
| APP-03 | After confirm: pending 8 → 7, Approved 1 → 2, nav badge 8 → 7, toast `Approved: $TIDE · Order is being placed` | **PASS** |
| APP-04 | Skip-with-reason path | **UNVERIFIED** (not exercised this pass; covered by mobile widget tests) |
| APP-05 | Keyboard shortcuts (A/S, J/K) work on the focused pick | **UNVERIFIED** |
| APP-06 | Approved order shows up as an open position with the quoted entry | **FAIL** — `/positions` did not gain the approved TIDE position; mock stores are per-route (D4) |

### 3.4 Open / close a position — web, mock

| ID | Check | Result |
|---|---|---|
| POS-01 | Position detail shows size, PnL, loss guard, peak trail, exit-plan link | **PASS** |
| POS-02 | Sell sheet: 25/50/100 %, estimated proceeds, `Exit plan cancelled (100%)`, hold-to-confirm 1.2 s | **PASS** |
| POS-03 | Holding 1.5 s sells 100 %; open count 2 → 1; list refreshes | **PASS** |
| POS-04 | Newest closed trade appears in the PnL ledger | **FAIL** — ledger still `Latest 50 closes`, newest MOCHI, 1102 closed after the sell; server-rendered `/pnl` reads its own mock store (D4) |
| POS-05 | Sell sheet on first open shows a neutral, no-attempt state | **FAIL** — shows `Released early — nothing was sold` before any pointer down (D8) |
| POS-06 | Cancel/Esc closes the sheet without selling | **PASS (button present)**; not exercised |

### 3.5 PnL report — web, mock (EN + ID)

| ID | Check | Result |
|---|---|---|
| PNL-01 | Card order unrealized → realized → total; total = realized + unrealized shown | **PASS** |
| PNL-02 | Range strip labels use 1D/7D/30D/All; default 7D | **PASS** |
| PNL-03 | Reconciliation note shown when all-time ≠ range; hidden when equal | **PASS** (both states observed) |
| PNL-04 | Ledger headers: Coin, Strategy, In, Out, PnL, PnL %, Fees (reported), Entry → exit, Hold, Exit reason; no duplicate `Closed` | **PASS** |
| PNL-05 | Unit once in the note (`Amounts in paper SOL · times in WIB (GMT+7)`); no unit in In/Out cells | **PASS** |
| PNL-06 | Cross-midnight: exit date appears only when the WIB day differs (`Oct 28 · 11:52 PM → Oct 29 · 12:12 AM`) | **PASS** |
| PNL-07 | 50 rows/page; `Older closes` sets `?cursor=`; label switches `Latest 50 closes` → `50 closes on this page`; `Newest first` returns | **PASS** |
| PNL-08 | Changing range/strategy drops the keyset cursor | **PASS** (`/pnl?window=7d&cursor=…` → `/pnl?window=30d`) |
| PNL-09 | Bot filter: card stays workspace+mode, scope note explains the narrower range/ledger | **PASS** (`str_001`, 30D: card −6.66 all bots, range −1.96) |
| PNL-10 | 10-column ledger fits without scroll at 1440 | **PASS** (overflow 0) |
| PNL-11 | 10-column ledger fits at 1280/1366 as claimed | **FAIL** — needs 1054 px; 39 px overflow at 1280 and the scroll hint is hidden there (D2) |
| PNL-12 | 5-cell range strip shows complete values at 1024–1280 | **FAIL** — realized cell clipped to `paper SO` at 1280 and 1024, fees clipped at 1024 (D1) |
| PNL-13 | `?window=1h` legacy URL handled consistently | **FAIL** — data is 1h but the dropdown renders `1D`, so the control lies (D6) |
| PNL-14 | Mode tab keeps range + bot filter | **FAIL** — tab href is `/pnl` / `/pnl?mode=real`, dropping `window`/`strategy` (D7) |
| PNL-15 | Null wire values render an em dash, not `0.00` | **PASS (unit test)** `bfed32e`; not visible in mock (no null rows) |
| PNL-16 | ID copy: `Nilai dalam paper SOL · waktu WIB (GMT+7)`, `Biaya (dilaporkan)`, `Rasio menang` | **PASS** |
| PNL-17 | ID has no English leftovers in the ledger | **FAIL** — `Entry → exit`, `Hold`, `50 close terbaru` (D9) |
| PNL-18 | Empty range shows empty state, not a zero strip | **PASS** (desktop); web 1h has data, not re-checked |

### 3.6 Pause / resume — web, mock

| ID | Check | Result |
|---|---|---|
| STRAT-01 | Strategies list exposes a pause/resume control | **FAIL** — only status chips (`Running`, `Paused`, `Archived`), `Edit`, `Duplicate`; no toggle on list or edit page (D5) |
| STRAT-02 | Pause stops new picks / resume restarts | **UNVERIFIED** — no control on web; mobile widget test covers the toggle |

### 3.7 Desktop (browser mock, 1420)

| ID | Check | Result |
|---|---|---|
| DT-01 | `npm run build`, `test:ui` | **PASS** 31/31, exit 0 |
| DT-02 | PnL dialog opens from `Lihat laporan`, default 7D, tabs 1D/7D/30D/Semua waktu | **PASS** |
| DT-03 | Reconciliation note + `Waktu WIB (GMT+7) · tanggal keluar hanya bila beda hari` | **PASS** |
| DT-04 | Empty state when no closed trades | **PASS** |
| DT-05 | New ledger columns In/Out/Fees/Bot/Entry→exit visually | **UNVERIFIED** — browser mock starts with 0 closed trades; covered by the 2 new unit tests, not by pixels |
| DT-06 | Tauri window/IPC, installer, multi-window | **UNVERIFIED** — no Tauri runtime here; CI covers build |

### 3.8 Mobile

| ID | Check | Result |
|---|---|---|
| MOB-01 | `flutter analyze`, `flutter test`, `dart format`, vendored pins | **PASS** (248/248, 4/4 pins) |
| MOB-02 | Receipt closed position: logo, bot, realized + %, SOL in/out, fees, hold, entry→exit, exit reason, close time WIB, no Sell | **PASS (widget test)** `pnl_report_test.dart`/`positions_test.dart` |
| MOB-03 | 23 `pnl_strings.dart` keys migrated to ARB; file deleted; pin updated | **PASS** (file gone, pins match) |
| MOB-04 | `/pnl?window=` deep link opens the right range on first frame | **PASS (widget test)** |
| MOB-05 | Real device/emulator pass (scroll, hold, Impeller) | **UNVERIFIED** — no emulator/device on this box |

## 4. Defects with reproduction steps

Severity: P1 blocks sign-off on a primary surface; P2 visible bug/gap with a workaround; P3 polish.

| ID | Sev | Surface | Steps | Expected | Actual |
|---|---|---|---|---|---|
| D1 | **P1** | Web `/pnl` | Open `/pnl?window=7d` at 1280 px, then 1024 px | Every strip value complete | Realized cell clipped to `−6.66 paper SO` at 1280 and 1024; at 1024 EN clips 2 of 5 cells (realized, fees) and ID 3 of 5 (adds avg hold) |
| D2 | **P2** | Web `/pnl` | 1280 px, scroll ledger right | Table fits or a scroll hint is visible | Needs 1054 px inside 1030–1015 px; 39 px overflow at 1280; hint `hidden … xl:hidden` so no hint appears at 1280–1300 (measured gap 19 px at 1300, hint hidden) |
| D3 | **P2** | Web `/strategies` | Open Strategies, look at the filter chips | `All / Paper / Real` | Raw keys `strategy.list.filter.all`, `…paper`, `…real` (links, visible in DOM and screenshot) |
| D4 | **P2** | Web mock, all routes | Approve a pick, sell a position, then open `/` and `/pnl` | One workspace state everywhere | Dashboard says 6 open / 1.40 SOL while `/positions` says 2 open / 0.50 SOL; after selling, `/pnl` still shows 1102 closed and the old newest row. Approve/sell only mutate the route-local mock store |
| D5 | **P2** | Web strategies | Open `/strategies` and `/strategies/str_001/edit` | Pause/resume control (mobile has one; checklist requires it) | No toggle anywhere; only status chips + Edit/Duplicate |
| D6 | P3 | Web `/pnl` | Open `/pnl?window=1h` | Dropdown and data agree (1H) | Strip uses 1h data, dropdown displays `1D` (first option fallback), URL stays `window=1h` |
| D7 | P3 | Web `/pnl` | Set `window=30d&strategy=str_001`, switch mode tab | Filters preserved | Tabs link to `/pnl` and `/pnl?mode=real`; range and bot filter are lost |
| D8 | P3 | Web `/positions` | Open Sell on an open position, do not press anything | Neutral idle state | Shows `Released early — nothing was sold` before the first attempt |
| D9 | P3 | Web `/pnl` ID | Switch to ID | Fully Indonesian ledger | `Entry → exit`, `Hold`, `50 close terbaru`; also two hint keys (`pnl.scrollHint`, `table.scrollHint`) |

Notes: console `style-src` CSP errors are the Next devtools overlay in dev only (not counted). Safari/
Firefox, 320 px, light theme, and keyboard-only flows were not part of this pass.

## 5. Not testable on this box (blocked, not failed)

- Real API paths: `/stats/pnl` aggregation vs the ledger, SIWS nonce expiry, RLS/keyset SQL — needs
  Postgres + API and a signed nonce; specialist suites cover them (backend 160/160, EXPLAIN evidence).
- Desktop Tauri runtime, installer, cargo tests (`0xc0000139` locally).
- Mobile on device/emulator; iOS build; Play upload (Boss-only secrets).
- Docker image build (no engine) and any deploy.

## 6. Exit criteria for v1 sign-off

All AUTH/PORT/APP/POS/PNL/STRAT items PASS on web + mobile, PNL subset PASS on desktop, no open P0/P1,
every failure has a repro in §4, and the tree is committed and pushed with all four CI workflows green.
Current status: **not sign-off ready** — D1 is open P1; D2/D3/D4/D5 are open P2.