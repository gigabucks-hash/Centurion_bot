# QA plan v1 — paper trading end to end

> Supported app targets are now the web app and the Windows desktop. Mobile rows in this plan are a historical record of the removed Flutter app, not a current gate. macOS desktop is not a supported target. Phone-width checks that remain are responsive web layouts.

**Owner:** Product Tester · **For:** Apex Dev Lead · **Version:** 1.2 (6 Nov 2026, 09:35 WIB)
**Scope:** web, desktop, mobile against the mock data source. Paper only; no secrets, no deploy, no app-code change.
**Branch under test:** `HEAD = origin/main = eaa561e` plus the uncommitted fix set (web 8 files, desktop 17, mobile 20, backend 14).
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
- The Flutter app, iOS build, and Play upload are removed and are not remaining gates.
- Windows Tauri installer, Authenticode, and the W-NOFOCUS popup gate (not run on this Linux box).
- Docker image build (no engine) and any deploy.

## 7. Exit criteria for v1 sign-off

All AUTH/PORT/APP/POS/PNL/STRAT items PASS on web, the PNL subset PASS on the Windows desktop, no open P0/P1,
every failure has a repro above, and the fix tree is committed and pushed with the web, backend, and desktop CI workflows green.

Current: **close, not signed off** — D1, D2, D3, D6, D7, F1, F2, F4, F5 closed; open are D4 (P2), D5 (P2),
D8 (P3), D9 (P3). The former F3 mobile item left with the Flutter app. No P1 left. Sign-off is web plus Windows desktop.
