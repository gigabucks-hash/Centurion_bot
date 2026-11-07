# QA plan v1 — paper trading end to end

**Owner:** Product Tester · **For:** Apex Dev Lead · **Version:** 1.3 (7 Nov 2026, WIB)
**Scope:** web paper surface against mock plus a local HTTP decoder harness. Paper only; no secrets, no deploy, no app-code change.
**Branch under test:** `HEAD = origin/main = 025e488` plus the shared uncommitted web/backend fix tree (not included in the HEAD claim). The QA agent changed only this document.
**Invariants under test:** integer lamports server-side; clients never re-sum totals; one workspace mode per read;
WIB (GMT+7) times; sign + label on every PnL; null → em dash; token pin 0.3.4 and contracts 1.1.6 unchanged.

## 1. Environment actually used

| Target | How | Data |
|---|---|---|
| Web | `cd apps/web && npm run dev` → http://localhost:3100 | mock (`ws_mock`), in-memory, per-route stores |
| Desktop | `cd apps/desktop && npm run dev` → http://localhost:1420 | `browserMockAdapter` (no Tauri IPC) |
| Mobile | `flutter analyze` / `flutter test` (no emulator on this box) | widget tests |
| Browser | private browser, dark theme, EN + ID, widths **1024 / 1280 / 1366 / 1440** CSS px | example data |

## 2. Gates at `eaa561e` + fix tree

| Gate | Result |
|---|---|
| web `npm run typecheck` (`next typegen && tsc --noEmit`) | **exit 0** |
| web `npm test` | **73 tests: 72 pass, 1 skip, 0 fail** |
| web `npm run build` | **exit 0**, 36 routes |
| desktop `npm run test:ui` | **38/38 pass** (31 + 7 receipt/paging tests) |
| desktop `npm run build` | **exit 0** (853 ms) |
| mobile `flutter analyze` | **No issues found** |
| mobile `flutter test` | **260/260 pass** (248 + receipt + REST wire + WIB tests) |
| mobile `dart format --set-exit-if-changed lib test` | 110 files, **0 changed** |
| mobile vendored pins (sha256 computed directly; no bash here) | **4/4** — ARB en `87edf194…`, ARB id `f5525123…`, tokens `5043960a…` (0.3.4), Inter Bold `28831609…` |
| contracts 1.1.6 / `services/backend/contracts` | **unchanged** (no diff) |
| CI at latest code SHAs | web `06b85b2` success · backend `064f876` success · desktop `c84ff94` success · mobile `90d213d` success |

Not run: `cargo test` (local `0xc0000139` linker), Docker build (no engine), Play upload, any deploy.

## 3. Executed checklist and results

Legend: **PASS** observed in the running UI or a gate · **FAIL** reproduced defect (repro in §4/§5) ·
**UNVERIFIED** not testable on this box (reason given).

### 3.1 Login / session — web, mock

| ID | Check | Result |
|---|---|---|
| AUTH-01 | Connect Phantom → sign → lands on the requested page (`?next=/pnl?window=7d` preserved) | **PASS** |
| AUTH-02 | Signed-out `/pnl` redirects to `/login?next=%2Fpnl%3Fwindow%3D7d` | **PASS** |
| AUTH-03 | Connect/Sign disabled while connecting/awaiting the wallet | **PASS** |
| AUTH-04 | Expired / replayed nonce rejected by the real API | **UNVERIFIED** — needs local API + Postgres |

### 3.2 Portfolio / dashboard — web, mock

| ID | Check | Result |
|---|---|---|
| PORT-01 | Cash, equity, realized, open positions, awaiting approval, strategy table render | **PASS** |
| PORT-02 | Paper banner + `EXAMPLE DATA` chip on every route | **PASS** |
| PORT-03 | Card realized/unrealized/total come from the wire (no client re-sum) | **PASS (display)**; DB arithmetic **UNVERIFIED** |
| PORT-04 | Coin logos/identicons on dashboard and ledger rows | **PASS** |
| PORT-05 | Dashboard and Positions agree on open positions | **FAIL** — `6 / 21 · 1.40 paper SOL` vs `/positions` `2 open · 0.50 paper SOL` (D4) |

### 3.3 Approvals — web, mock

| ID | Check | Result |
|---|---|---|
| APP-01 | Approve opens the review sheet: price, min received, network/priority/swap fee, slippage, total (max) | **PASS** |
| APP-02 | Confirm disabled while the quote refreshes (`Refreshing quote…`), enabled with a fresh quote | **PASS** |
| APP-03 | Confirm: Pending 7 → 6, Approved 1 → 2, nav badge 7 → 6 | **PASS** |
| APP-04 | Skip-with-reason path | **UNVERIFIED** (not exercised this pass; widget tests cover it) |
| APP-05 | Keyboard shortcuts (A/S, J/K) on the focused pick | **UNVERIFIED** |
| APP-06 | Approved order appears as an open position | **FAIL** — `/positions` stays at 2 open (D4) |

### 3.4 Open / close a position — web, mock

| ID | Check | Result |
|---|---|---|
| POS-01 | Position detail: size, PnL, loss guard, peak trail, exit-plan link | **PASS** |
| POS-02 | Sell sheet: 25/50/100 %, estimated proceeds, `Exit plan cancelled (100%)`, hold-to-confirm 1.2 s | **PASS** |
| POS-03 | Holding 1.5 s sells 100 %: open 2 → 1, list refreshes | **PASS** |
| POS-04 | Newly closed trade appears in the PnL ledger | **FAIL** — ledger still `Latest 50 closes`, newest `MOCHI`, 1102 closed after the sell (D4) |
| POS-05 | Sell sheet is neutral before the first attempt | **FAIL** — shows `Released early — nothing was sold` on open (D8) |
| POS-06 | Cancel/Esc closes the sheet without selling | **PASS (button present)**; not exercised |

### 3.5 PnL report — web, mock (EN + ID)

| ID | Check | Result |
|---|---|---|
| PNL-01 | Card order unrealized → realized → total; total = realized + unrealized | **PASS** |
| PNL-02 | Strip: 1D / 7D / 30D / All, default 7D | **PASS** |
| PNL-03 | Reconciliation note when all-time ≠ range (incl. 1h and bot filter) | **PASS** |
| PNL-04 | Ledger columns: Coin, Strategy, In, Out, PnL, PnL %, Fees (reported), Entry → exit, Hold, Exit reason; no duplicate `Closed` | **PASS** |
| PNL-05 | Unit once in the note (`Amounts in paper SOL · times in WIB (GMT+7)`); In/Out cells unitless | **PASS** |
| PNL-06 | Exit date appears only when the WIB day differs | **UNVERIFIED** this pass (no cross-midnight row in the 50 latest; formatter tests cover it, passed last pass) |
| PNL-07 | 50 rows/page; `Older closes` sets `?cursor=`; label → `50 closes on this page` | **PASS** |
| PNL-08 | Changing range/strategy drops the keyset cursor | **PASS** (`?window=7d&cursor=…` → `?window=30d`) |
| PNL-09 | Bot filter: card stays workspace+mode, scope note explains the narrower range/ledger | **PASS** (`str_001`, 30D: card −6.66 all bots, range narrower) |
| PNL-10 | 10-column ledger fits at 1440 | **PASS** — 1175/1175, overflow 0 |
| PNL-11 | 10-column ledger fits at 1366 and 1280 | **PASS** — 1101/1101 and 1015/1015, overflow 0 (EN + ID) |
| PNL-12 | 1024: ledger scrolls with a visible hint | **PASS** — 983 px table in 759 px, hint `Scroll sideways for every column` / `Geser ke samping untuk semua kolom` visible; hidden at ≥1280 where there is no overflow |
| PNL-13 | 5-cell strip shows complete values at 1024–1440, EN + ID | **PASS** — every cell `scrollWidth − clientWidth = 0`; 3+2 reflow below xl |
| PNL-14 | `?window=1h` handled consistently | **PASS** — select `1h` / `1 hour` / `1 jam`, strip `Realized · 1h` / `Terealisasi · 1 jam`, 3 closed |
| PNL-15 | Mode tab keeps range + bot filter | **PASS (code)** — `modeHref()` rebuilds `mode + strategy + window`, drops `cursor`; not clickable in mock because 0 Real strategies → tabs collapse to the Paper badge |
| PNL-16 | Null wire values render an em dash, not `0.00` | **PASS (unit)** — `unreported value stays null (em dash)` |
| PNL-17 | ID copy: `Nilai dalam paper SOL · waktu WIB (GMT+7)`, `Biaya (dilaporkan)`, `Rasio menang` | **PASS** |
| PNL-18 | ID has no English leftovers in the ledger | **FAIL** — headers `Entry → exit` and `Hold` still English (D9) |

### 3.6 Pause / resume — web, mock

| ID | Check | Result |
|---|---|---|
| STRAT-01 | Strategy list / edit exposes pause-resume | **FAIL** — status chips + `Edit`/`Duplicate` only (D5) |
| STRAT-02 | Pause stops new picks, resume restarts | **UNVERIFIED** — no web control; backend `buys_paused` (A) implemented, not reachable from this UI |

### 3.7 Desktop (browser mock, 1420)

| ID | Check | Result |
|---|---|---|
| DT-01 | `npm run build`, `npm run test:ui` | **PASS** — build 0, 38/38 |
| DT-02 | PnL dialog opens from `Lihat laporan`; 1D/7D/30D/Semua waktu, default 7D | **PASS** |
| DT-03 | Reconciliation line + `Waktu WIB (GMT+7) · tanggal keluar hanya bila beda hari`; header `RATA-RATA TAHAN` | **PASS** |
| DT-04 | Empty state (`Belum ada trade ditutup`) with 0 closed | **PASS** |
| DT-05 | Receipt drill-down + In/Out/Fees/Bot/Entry→exit columns, `Load more` paging | **UNVERIFIED (pixels)** — browser mock starts with 0 closed trades and approving a pick does not create a fill there; covered by 7 new unit tests |
| DT-06 | Tauri window/IPC, installer, multi-window | **UNVERIFIED** — no Tauri runtime; CI `windows-bundle` owns the artifacts |

### 3.8 Mobile

| ID | Check | Result |
|---|---|---|
| MOB-01 | analyze, test, format, vendored pins | **PASS** — 260/260, 4/4 pins |
| MOB-02 | Closed-position receipt: logo, bot, realized + %, SOL in/out, fees, hold, entry→exit, exit reason, WIB close time, no Sell | **PASS (widget tests)** |
| MOB-03 | PnL copy in ARB, `pnl_strings.dart` gone, pin updated | **PASS** |
| MOB-04 | REST `PositionWire` mapping (sol_in/out, pnl_lamports/pct, hold, fees, strategy_id, logo) | **PASS** — `rest_position_wire_test.dart` |
| MOB-05 | WIB conversion `03:00Z → 10:00 WIB` | **PASS** — `l10n_format_test.dart` |
| MOB-06 | `/pnl?window=` deep link opens the right range on first frame | **PASS (widget test)** for 24h/7d/30d/all |
| MOB-07 | `?window=1h` | **FAIL** — `PnlWindow` has only d1/d7/d30/all, so `1h` falls back to 7D (F3 mobile half) |
| MOB-08 | Real device/emulator (scroll, hold, Impeller) | **UNVERIFIED** — no emulator on this box |

## 4. Defect status: D1–D9 and F1–F5

Severity: P1 blocks sign-off on a primary surface · P2 visible bug/gap with a workaround · P3 polish.

| ID | Sev | Status | Evidence / repro |
|---|---|---|---|
| D1 | P1 | **CLOSED** | Strip cells measured `scrollWidth − clientWidth = 0` at 1440/1366/1280/1024 EN and 1280/1024 ID; 5 cells reflow 3+2 below xl; no page h-scroll |
| D2 | P2 | **CLOSED** | Table 1175/1175 (1440), 1101/1101 (1366), 1015/1015 (1280) overflow 0 EN+ID; at 1024 table 983 in 759 → hint visible; hint hidden where there is no overflow |
| D3 | P2 | **CLOSED** | `/strategies` chips render `All · 7 / Paper · 7 / Real · 0` (ID `Semua · 7 / Paper · 7 / Real · 0`); 0 nodes matching `strategy.list.*` |
| D4 | P2 | **OPEN** | Approve a pick, then open `/` and `/positions`: dashboard `6 / 21 · 1.40 paper SOL`, positions `2 open · 0.50 paper SOL`. Sell 100 % (2 → 1 open), then `/pnl`: still `Latest 50 closes`, newest `MOCHI`, 1102 closed. Route-local mock stores |
| D5 | P2 | **OPEN** | `/strategies` and `/strategies/str_001/edit`: no Pause/Resume/Jeda control (only status chips, Edit, Duplicate) |
| D6 | P3 | **CLOSED** | `/pnl?window=1h` → select value `1h`, label `1 hour` / `1 jam`; strip `Realized · 1h` / `Terealisasi · 1 jam`; 3 closed |
| D7 | P3 | **CLOSED (code)** | `modeHref()` keeps `strategy` + `window`, sets `mode=real` only for Real, drops `cursor`. Not clickable in mock: 0 Real strategies → mode chips collapse to the Paper badge (UI **UNVERIFIED**) |
| D8 | P3 | **OPEN** | `/positions` → `Sell` on GLUM, touch nothing: sheet already shows `Released early — nothing was sold` |
| D9 | P3 | **PARTIAL** | ID ledger headers still `Entry → exit`, `Hold` (`pnl.colWindow`, `pnl.colHold` in `lib/i18n/id.ts`); footer label `50 close terbaru`; only one scroll hint renders (duplicate keys not visible) |
| F1 | P1 | **CLOSED** | Web: unreported realized/unrealized/total stay `null` → em dash (`pnl-report.test.ts`); mock has no null row, so UI evidence is unit-level |
| F2 | P1 | **CLOSED** | Mobile: `03:00Z → 10.00 WIB` (id) / `10:00 AM WIB` (en) asserted in `l10n_format_test.dart`; no device-local time used |
| F3 | P2 | **PARTIAL** | Web closed (1h option EN/ID, PNL-14). Mobile open: `PnlWindow` lacks `1h`, so `/pnl?window=1h` shows 7D (MOB-07) |
| F4 | P1 | **CLOSED (logic)** | Cursor carries `ts\|id\|from\|to\|window`; page 2 replays the frozen range byte-identically; another window or `from` → 400 `CURSOR_INVALID` `cursor belongs to another range` (verified by direct `pagedRange`/`decodeCursor` calls). DB-backed `paging_range.test.ts` 10/10 is the backend owner's evidence, not re-run here |
| F5 | P1 | **CLOSED (logic)** | Canonical `8-4-4-4-12` hex only. 36 hyphens, 35/37 chars, no hyphens, non-hex, bad grouping, full-width digits → `bad` → 400 `CURSOR_INVALID`; valid UUID decodes |

## 5. New / still-open defects with reproduction

| ID | Sev | Surface | Steps | Expected | Actual |
|---|---|---|---|---|---|
| D4 | P2 | Web mock, all routes | Approve a pick, then `/` and `/positions`; sell 100 %, then `/pnl` | One workspace state everywhere | Dashboard 6 open / 1.40 SOL vs positions 2 open / 0.50 SOL; after sell `/pnl` unchanged (1102 closed, newest MOCHI) |
| D5 | P2 | Web strategies | `/strategies`, then `/strategies/str_001/edit` | Pause/resume control (mobile + desktop kill switch exist) | No toggle anywhere |
| D8 | P3 | Web `/positions` | Open Sell on GLUM and press nothing | Neutral idle state | `Released early — nothing was sold` before any pointer down |
| D9 | P3 | Web `/pnl` ID | Switch to ID | Fully Indonesian ledger | `Entry → exit`, `Hold` (`lib/i18n/id.ts`, `pnl.colWindow`/`pnl.colHold`) |
| F3m | P3 | Mobile `/pnl` | Open `/pnl?window=1h` or look for a 1H chip | 1h range like web | Falls back to 7D; enum `PnlWindow { d1, d7, d30, all }` |

Notes: console `style-src` CSP errors are the Next devtools overlay in dev only (not counted). Keyboard-only,
light theme, Safari/Firefox and 320 px were not part of this pass. The desktop browser mock cannot create a
closed trade (approve does not fill), so DT-05 stays a test-level PASS, not a pixel pass.

## 6. Not testable on this box (blocked, not failed)

- Real API paths: `/stats/pnl` vs ledger, SIWS expiry, RLS/keyset SQL — needs Postgres + API.
- Desktop Tauri runtime, installer, `cargo test` (`0xc0000139` locally); CI owns build + artifacts.
- Mobile on device/emulator, iOS build, Play upload (Boss-only secrets).
- Docker image build (no engine) and any deploy.

## 7. Exit criteria for v1 sign-off

All AUTH/PORT/APP/POS/PNL/STRAT items PASS on web + mobile, the PNL subset PASS on desktop, no open P0/P1,
every failure has a repro above, and the fix tree is committed and pushed with all four CI workflows green.

Current: **close, not signed off** — D1, D2, D3, D6, D7, F1, F2, F4, F5 closed; open are D4 (P2), D5 (P2),
D8 (P3), D9 (P3), F3 on mobile (P3). No P1 left.


## 8. QA v1.3 web-paper re-run — HEAD 025e488

This section is additive; §1–§7 retain the v1.2 history. Visual checks used the running mock build at `http://localhost:3101` with the shared uncommitted web fix tree. Exact probe evidence is recorded below. A local Postgres 17 Windows service was listening on `127.0.0.1:5432`; the requested `centurion_e2e` database on `127.0.0.1:55432` was not available. The real paper API health endpoint was reachable on `:8090`/`:8080`, but authenticated SIWS was not performed because Phantom signature and owner-wallet credentials were unavailable. An isolated HTTP decoder stub on `127.0.0.1:8099` was used only to prove null rendering; it is not a paper API acceptance result.

### 8.1 Gates actually run by Product Tester

| Gate | Result | Evidence |
|---|---|---|
| `git rev-parse HEAD` | **PASS** | `025e4884f321706f8647ed5b1cc19b16fe7cd606` (`025e488`) |
| Web production build | **PASS** | `cd apps/web; npm.cmd run build` — completed; route table included `/pnl`, `/positions`, `/strategies`, `/coins` |
| Web HTTP mock render | **PASS** | `DATA_SOURCE=mock`, auth gate disabled, production server on `:3101`; `/pnl?window=7d` returned HTTP 200 |
| Web visual probe | **PASS** | Playwright/Chrome, Asia/Jakarta, EN+ID, 1024/1280/1366/1440; no browser errors |
| F1 HTTP null render harness | **PASS** | HTTP stub on `:8099`, web `DATA_SOURCE=http` on `:3102`, `/pnl?window=7d`; 3 summary em dashes and 7 null ledger cells observed |
| Web `npm.cmd run typecheck` | **PASS** | exit 0, `next typegen` + `tsc --noEmit` |
| Web `npm.cmd test` | **PASS** | **99 tests: 98 pass, 1 skip, 0 fail** |
| Web `npm.cmd run lint` | **PASS** | 0 errors, 3 warnings (`CoinsVirtualList` unused `useFmt`; 2 non-literal `readFileSync` in a test) |
| Postgres/API authenticated acceptance | **UNVERIFIED** | `:55432/centurion_e2e` unavailable; `:8090/readyz` returned 200/db ok but workspace reads returned 401 without session |
| Docker / device / Tauri | **UNVERIFIED** | Docker executable absent; no device/emulator/Tauri runtime |

### 8.2 D1–D9 and F1–F5 web checklist

| ID | Result | Current evidence / repro |
|---|---|---|
| D1 | **PASS** | `/pnl?window=7d`; strip had 5 cells. At 1024: 3+2 cells, widths 257/257/257 and 387/387; at 1280: 5×205; 1366: 5×222; 1440: 5×237. Each cell `scrollWidth=clientWidth`; page horizontal overflow 0. EN and ID both measured. |
| D2 | **PASS with known design deviation** | Ledger 50 rows, row height 69 px. At 1024 table `scrollWidth/clientWidth=983/774`, visible scroll hint; at 1280/1366/1440 1030/1030, 1116/1116, 1190/1190. Page overflow 0. The historical 52 px/sticky-Coin specification remains unmet, so this is a web usability PASS, not a pixel-spec closure. |
| D3 | **PASS** | `/strategies`: `All · 7`, `Paper · 7`, `Real · 0`; zero raw `strategy.*` keys in rendered text. |
| D4 | **PASS (mock)** | Before action dashboard and `/positions`: `2 / 21`, `0.50 paper SOL` vs `2 open`, `0.50 paper SOL`. After approving `$TIDE` (`Pending 8 → 7`, review sheet, approve button enabled), both became dashboard `3 / 21`, `0.74 paper SOL` and `/positions` `3 open`, `0.74 paper SOL`. After holding `Hold 1.2 s to sell 100%`, both returned to dashboard `2 / 21`, `0.50` and `/positions` `2 open`, `0.50`; `/pnl` newest row `TIDE`, `Manual sell`, closed count `1103`. HTTP source-of-truth path remains UNVERIFIED. |
| D5 | **PASS (mock)** | `/strategies`: `Fresh Bonding Scout` button `Pause`; after click card text changed `Running → Paused`, rev `15 → 16`, `Resume` appeared; after Resume, `Paused → Running`, rev `16 → 17`, `Pause` returned. |
| D6 | **PASS** | `/pnl?window=1h`: select value `1h`, group label `Closed trades in the last 1 hour`, 3 ledger rows, strip `REALIZED · 1 HOUR`. |
| D7 | **UNVERIFIED UI / PASS code** | Mode URL fallback `/pnl?window=7d&mode=real` rendered Paper because mock had `Real · 0`; modeHref code preserves strategy/window and drops cursor. No clickable Real surface was available. |
| D8 | **PASS** | `/positions` → first Sell → idle sheet: `Sell GLUM`, 25/50/100%, `Estimated proceeds`, `Exit plan cancelled (100%)`, `Hold 1.2 s to sell 100%`, and **no** `Released early`. A short pointer down/up then produced `Released early — nothing was sold`, proving the hint is interaction-dependent. |
| D9 | **PASS** | ID `/pnl?window=7d`: headers exactly `Koin`, `Strategi`, `Masuk`, `Keluar`, `PnL`, `PnL %`, `Biaya (dilaporkan)`, `Masuk → keluar`, `Durasi tahan`, `Alasan exit`; no `Entry → exit`, no `Hold`, no raw `pnl.*` keys. |
| F1 | **PASS** | HTTP null harness: `/pnl` summary showed `UNREALIZED PNL —`, `REALIZED PNL —`, `TOTAL PNL —`; ledger row showed In/Out/PnL/PnL%/Fees/Hold/Exit reason all `—`; `0.00 paper SOL` absent. Unit/repro: `docs/qa/repro/v3/f1_retest_v3.ts`. |
| F2 | **PASS (web) / UNVERIFIED mobile** | `/pnl?window=7d` rendered the identical row time `Nov 7 · 1:10 AM → 1:11 AM` under browser timezones `Asia/Jakarta`, `UTC` and `America/New_York`, with `Amounts in paper SOL · times in WIB (GMT+7)`; formatting is independent of the device TZ. No mobile/device re-run in this assignment. |
| F3 (web) | **PASS** | 1h control, deep URL, 3 rows and range label measured above; `24h/7d/30d/all` controls remain in source/UI. Mobile half remains outside this web assignment. |
| F4 | **PASS (mock)** | `/pnl?window=all`: page 1 50 rows; `Older closes →` produced URL cursor and page 2 50 rows with 0 row overlap; changing select to `30d` produced `/pnl?window=30d` with cursor dropped. HTTP DB freeze remains UNVERIFIED. |
| F5 | **FAIL (new reproducible web defect)** | `/pnl?window=7d&cursor=not-a-uuid` returned HTTP 200 shell `This page couldn’t load / A server error occurred / ERROR 827497098`; the error was not converted to a user-safe `CURSOR_INVALID` response. This is **F5-WEB-01 P3**, distinct from backend UUID validation. |

### 8.3 Defect table update

| ID | Sev | Status at v1.3 | Evidence |
|---|---:|---|---|
| D4 | P2 | **CLOSED mock / UNVERIFIED HTTP** | Single mock store values matched after approve and after full sell; see §8.2. |
| D5 | P2 | **CLOSED mock / UNVERIFIED HTTP** | Pause/resume status and revisions changed in UI; see §8.2. |
| D8 | P3 | **CLOSED** | Idle sell sheet had no early-release hint; hint appeared only after pointer interaction. |
| D9 | P3 | **CLOSED** | ID ledger had no English `Entry → exit` or `Hold` headers. |
| F3m | P3 | **OPEN / outside web scope** | Mobile device/emulator was unavailable; web F3 is closed. |
| F5-WEB-01 | P3 | **OPEN — new** | Malformed UI cursor crashes the server-rendered page into generic Next error shell instead of a safe invalid-cursor state; repro §8.2. |

**Final web open/closed list:** closed D1, D3, D4(mock), D5(mock), D6, D8, D9, F1, F2(web), F3(web), F4; code/logic closed F5 backend but **F5-WEB-01 remains open (P3)**; D2 is usability PASS with the documented 69 px/sticky deviation; D7 UI unverified because no Real strategy; F2 mobile and F3m open outside web scope; HTTP/API/DB/Phantom acceptance unverified. No new P1.

## 9. Web paper acceptance (Boss DoD A–F)

| DoD | Result | One command / click sequence and evidence |
|---|---|---|
| A — local stack | **UNVERIFIED** | `Get-NetTCPConnection` showed PostgreSQL on 5432 and `GET http://127.0.0.1:8090/readyz` 200/db ok, but requested `centurion_e2e` on 55432 was absent and no authenticated web stack was booted. |
| B — SIWS/session | **UNVERIFIED** | Run `npm run dev` with `DATA_SOURCE=http`, open `http://localhost:3100`, click Phantom and sign. No Phantom/provider/owner signature was available; synthetic repro is not a Phantom PASS. |
| B — dashboard | **PASS mock / UNVERIFIED HTTP** | Mock: open `/`, saw `30.00 paper SOL` start, cash, realized, open positions, pending approvals, strategies and activity. HTTP needs the SIWS session. |
| B — approvals approve+reject | **PASS mock / UNVERIFIED HTTP** | Mock approve: `/approvals` → `Approve` → review sheet → `Approve · 0.24 paper SOL`; pending 8→7. Mock reject: `Skip` → `Skip $TIDE?` → `Skip without reason`; pending 8→7 and `Skipped· 2` after the 5 s undo window. HTTP needs API auth; not claimed. |
| B — positions sell | **PASS mock / UNVERIFIED HTTP** | `/positions` → Sell → choose 100% → hold 1.2 s; row removed and manual close appended. HTTP needs authenticated API. |
| B — PnL | **PASS mock + null stub / UNVERIFIED real API** | `/pnl?window=1h` gave 3 rows; `/pnl?window=all` paging was 50/page; null stub gave 3 summary em dashes and null ledger cells. |
| B — coins/detail | **PASS mock / UNVERIFIED HTTP** | Mock `/coins`: 14 rows, `All / Passed / Rejected / Not tradeable` chips, grey `Not tradeable` rows. Detail `/coins/EGgs…BVDA`: `$PIXL · coin trail`, `USDC · not SOL`, `UNSUPPORTED_QUOTE_MINT`, `Approve — not available`, and trail steps `Screen → Guard → Entry → Buy → TP → Exit`. HTTP trail payload was not authenticated. |
| B — practice reset | **PASS mock / UNVERIFIED HTTP** | Mock `POST /api/v1/workspaces/ws_mock/practice/reset`: first 200 `epoch 2`, `starting_balance 30 SOL`, archived 2 positions/4 pending; second immediate call 429 `RESET_COOLDOWN`, `next_allowed_at` +86400 s. HTTP API path needs an authenticated session. |
| C — open marks/tradeability/trails/routes | **PASS mock / UNVERIFIED HTTP** | Mock UI/source exposes pause/resume, tradeability (`Not tradeable` + `UNSUPPORTED_QUOTE_MINT`), coin trail steps and marks; API route validation needs the unavailable `centurion_e2e:55432` authenticated session. |
| D — QA closure | **PASS mock for D4/D5/D8/D9/F1** | Exact evidence in §8.2; HTTP portions remain explicitly unverified. |
| E — smoke documentation | **PASS** | `docs/release/web-local.md` contains the 10-step five-minute click-by-click checklist; reproduced as §10 below. |
| F — container | **UNVERIFIED** | `docker` executable/engine absent; no build claimed. |

## 10. Five-minute smoke sequence (matches `docs/release/web-local.md`)

1. **API health:** `curl http://127.0.0.1:8080/healthz`. Expect HTTP 200, `mode: "practice"`, `real_enabled: false`; open `http://localhost:3100` and expect sign-in.
2. **SIWS:** click **Phantom**, approve the SIWS signature. Expect dashboard with 30 paper SOL start, cash/realized/open/pending tiles, strategies and activity.
3. **Trading stop:** Settings → **Stop buying** → confirm. Expect **Buying paused**, WIB `Paused at`, and `GET /trading` `buys_paused:true` with bumped rev.
4. **Trading resume:** Settings → **Resume buying** → confirm. Expect **Buying active**, paused timestamp/banner gone, rev bumped.
5. **Approve:** Approvals → pending buy → **Approve** → review quote → hold/confirm. Expect pending count down and the new position in Positions; dashboard open count/in-position SOL equal Positions.
6. **Sell:** Positions → row → **Sell** → 100% → hold 1.2 s. Before hold, expect no `Released early`; after a short release, expect the hint; after completed hold, row disappears and PnL gets newest `manual` close.
7. **PnL/ID:** PnL → select `1h`, then Settings → Language → ID. Expect 1h label/rows and Indonesian headers `Masuk → keluar`, `Durasi tahan`, with no English ledger headers.
8. **Mode lock:** Strategies → edit Paper strategy → click Real. Expect 2.5 s hold and inline `MODE_NOT_ALLOWED` / real-locked explanation; no Real trading.
9. **Null/paging:** PnL → inspect `—` for missing money; open **Older closes**. Expect 50 rows/page, no duplicate, and filter change drops cursor.
10. **Not in this environment:** malformed cursor should show a safe error state (currently F5-WEB-01 open); practice reset second attempt should return 429; Docker build and Phantom/API acceptance require the local stack and are not claimed here.

## 11. QA v1.3 exit status

**Not signed off for HTTP paper release.** Mock web D4/D5/D8/D9/F1 and the DoD approve/reject/sell/coins/reset click paths are verified; F5-WEB-01 is a new P3; Phantom, authenticated API/DB, container, and mobile/device evidence remain unverified. Lead must merge the shared web/backend paths, rerun `npm run ci`, and fix F5-WEB-01 before HTTP sign-off.

## 12. Lead final pass — web + paper API over HTTP (2026-11-07)

Scope: the shared tree above v1.3 (backend mode-switch route + migration 0026, web mode/Stop wiring, null-money fixes,
F5-WEB-01 fix). Stack: Postgres 17 `centurion_e2e` on `127.0.0.1:55432`, paper API on `:8090`, web `next start`
`DATA_SOURCE=http` on `:3100`. Login used a synthetic ed25519 **owner** wallet through the real SIWS nonce/verify
endpoints (the same wire Phantom uses); the Phantom extension UI itself was not driven.

### 12.1 End-to-end result

`e2e-web-smoke.mjs` (Lead scratch, not committed): **35/35 checks pass**.

| Area | Check and observed result |
|---|---|
| Session | SIWS nonce 200, verify 200, `centurion_at` + `centurion_ws` cookies set for workspace `0f6c55d4…` |
| Pages | `/`, `/positions`, `/pnl?window=7d`, `/pnl?window=1h`, `/coins`, `/strategies`, `/activity`, `/stats`, `/settings` all 200 without an error shell |
| Marks | open row with mark 0.30 → `unrealized_pnl_lamports=100000000`; USDC-quoted open row keeps `unrealized=null` (em dash, not 0) |
| Tradeability | `/coins` rows carry booleans; one row `tradeable=false` `UNSUPPORTED_QUOTE_MINT`; coin detail renders the chip |
| PnL | `/stats/pnl` 200 realized `1010000000`; closed ledger 3 rows; coin timeline 3 items |
| Approvals | 2 pending; approve 200 `approved`; same-token replay 200 `replayed=true`; approve→reject 409 `APPROVAL_ALREADY_DECIDED`; reject 200 `rejected` |
| Workspace Stop | `GET /trading` 200; pause 200 `buys_paused=true`; resume 200 `false` (both with `If-Match` + idempotency) |
| Strategy | pause 200 `paused`; resume 200 `running`; `practice → real` 403 `MODE_NOT_ALLOWED` |
| Sell | manual close 50 % 200 (order `manual_close`) |
| D4 (http) | `portfolio/overview.open_positions` == `/positions?state=open` length (2) |
| Reset | first 200, second 429 `RESET_COOLDOWN` |

### 12.2 F5-WEB-01 — CLOSED

`GET /pnl?cursor=not-a-uuid` now answers **200**, renders the page with a `pnl-cursor-reset` status note
(`apiError.CURSOR_INVALID`), and falls back to the first ledger page. No `This page couldn't load` / `ERROR …` shell.
Unit coverage: `apps/web/lib/__tests__/pnl-report.test.ts` ("an invalid ledger cursor is a CURSOR_INVALID error…").

### 12.3 Null-money defects from BUG_HUNT_v3

| ID | Status | Fix |
|---|---|---|
| V3-P1-COIN-REAL | CLOSED | Real timeline probe swallows paper-only 403; coin detail renders both fixtures |
| V3-P2-OVERVIEW-NULL | CLOSED | Overview money/open count stay `null`; dashboard tiles print em dash |
| V3-P2-STRATEGY-STATS | CLOSED | Strategy stats absent on the wire stay `null` (no hardcoded 0) |
| V3-P3-TRAIL-PNL | CLOSED | Dashboard trail link drops unknown PnL instead of `0.00` |
| V3-P3-USD-DERIVED | CLOSED | HTTP open positions set `priceUnknown`; USD cells render em dash |
| V3-P3-MOCK-PAUSE | CLOSED | Mock Stop no longer flips `agentTradeEnabled`; test updated to API semantics |
| V3-P3-EXIT-NULL | CLOSED | `pnlReport`/summary paths keep null parts null; total only when both parts reported |

### 12.4 DoD A–F after this pass

A **PASS (local)** — DB + migrations through 0026, API `:8080`/`:8090`, web http `:3100`, SIWS owner workspace.
B **PASS (HTTP, synthetic owner)** — all surfaces in §12.1. Phantom *extension* click-through remains UNVERIFIED.
C **PASS (HTTP)** — open marks, coin trail, Stop/pause/resume, per-strategy mode switch, tradeable chip.
D **PASS** — D4/D5/D8/D9/F1 closed in mock and D4/D5 also exercised over HTTP; F5-WEB-01 closed.
E **PASS** — `docs/release/web-local.md` now has the exact fast path plus the 10-step checklist.
F **UNVERIFIED** — no Docker engine on this machine; build not claimed.
