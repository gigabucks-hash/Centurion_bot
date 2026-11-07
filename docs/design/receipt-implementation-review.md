# Receipt + Markets implementation review (v1.1)

> Supported app targets are now the web app and the Windows desktop. Findings that name `apps/mobile` describe the removed Flutter app. They are not remaining app work, and there is no vendored ARB pin to update.

Reviewed snapshot: `HEAD = origin/main = eaa561e`, working tree dated **2026-11-06 08:48 WIB**.
The tree is shared: desktop and mobile files below are uncommitted WIP owned by their specialists, so
line numbers can move. Each finding quotes the code anchor as well as the line.

Scope: `docs/design` only. This review changed no app or package file, no token, no contract.
Canonical spec: [receipt-and-discovery.md](receipt-and-discovery.md) (A1–A11 receipt, B1–B13 markets).

## 0. Verdict

| surface | state | P1 | P2 | P3 |
|---|---|---:|---:|---:|
| Desktop `PnlReportDialog` receipt + ledger | closes A2 for server values, order, labels, prices, WIB, provenance and action; remaining issues are label/format consistency | 0 | 3 | 4 |
| Mobile `_ClosedReceipt` | structurally close, but 3 paths still invent or mislabel money and the provenance line is absent | 3 | 5 | 3 |
| Web `/pnl` ledger (parity) | D1 and D2 are visually fixed and measured; null-value adapter still invents zeros | 1 | 1 | 3 |
| Markets `/markets` | not built yet; 89 keys and the S1–S15 state matrix are now final | — | — | — |

D1 is **fixed** in the working tree (measured below). D2 is **fixed at 1280/1440**; the only residual
risk is that hint visibility is still breakpoint-driven, not overflow-driven.

## 1. P1 — fix before the receipt can claim “server-reported”

| ID | surface | file:line | gap | required behaviour |
|---|---|---|---|---|
| P1-1 | mobile | `apps/mobile/lib/data/models/models.dart:287` (`pnlLamports`) and `:290` (`pnlPct`), used at `apps/mobile/lib/features/positions/positions_screen.dart:392,394` | A closed row with `pnl_lamports = null` falls back to `proceeds + value − cost`; `pnl_pct` falls back to `pnl / cost`. The receipt can print a number the server never sent. | Receipt reads `lockedPnlLamports` / `lockedPnlPct` only; either null → `—`. Keep the derived getters for open rows only. |
| P1-2 | mobile | `apps/mobile/lib/data/models/models.dart:199` (`proceedsLamports ?? Lamports.zero`), `:225`; `apps/mobile/lib/data/api/wire.dart:169`; `positions_screen.dart:407` | `sol_out_lamports = null` becomes `0.000`. A missing proceeds value is displayed as a real zero. | Make the receipt field nullable and render `—`; never coalesce a closed-row money field to zero. |
| P1-3 | mobile | `wire.dart:165` (`entryPriceUsd: entry ?? Decimal.zero`), `models.dart:240` (`exitPriceUsd` is actually `exit_price_sol`), `positions_screen.dart:412` | A missing entry price renders `$0.00`; the SOL prices are formatted with `fmtUsd`, so a SOL value is prefixed with `$`. | Add nullable SOL price fields (`entryPriceSol`, `exitPriceSol`) mapped from `avg_entry_price_sol` / `exit_price_sol`; format with the SOL price formatter and per-side `—`. No `$` on a SOL price. |
| P1-4 | web | `apps/web/lib/contracts.ts:686-697` (`closedTradeFromWire`) | `pnl_lamports = null` → `0`; `sol_out_lamports = null` → `solIn + pnl`; `closed_at = null` → `opened_at`. Three invented values on a legacy row drive the ledger. | Keep `pnlSol`, `solOutSol`, `closedAt` nullable and render `—`; never derive a closed-row money value or close time on the client. |

Why P1: the receipt's provenance line (“Server-reported · not recalculated”) is only true after these
four paths are fixed. Fix P1-1…P1-3 before adding that line to mobile.

## 2. P2 — missing fields, labels and format rules

| ID | surface | file:line | gap | required behaviour |
|---|---|---|---|---|
| P2-1 | mobile | `positions_screen.dart:361` (`ModeChip(p.mode)`), `:416` (`_Kv(l.pnlClosed, '${fmtTime(...)} WIB')`) | Identity shows Paper/Real, not a `Closed` chip, and the close time is a bottom key/value without a date. | Identity: logo 32 → `$SYMBOL` → bot → `Closed` chip (A5 `pnl.closed`) → `06 Nov · 14:32 WIB` (A5 `pnl.receipt.closed_at`). |
| P2-2 | mobile | `positions_screen.dart:392` (`PnlText(..., unit: true)`) | The hero repeats `paper SOL`; A2 #15 puts the unit once in the unit line. | Hero number only; add the A2 #15 line (`pnl.receipt.units`) above provenance. |
| P2-3 | mobile | `positions_screen.dart:409`; `models.dart:279-283` (`holdAt`) | Hold falls back to `closed_at − opened_at` when `hold_seconds` is null, including on the receipt. | Receipt uses `hold_seconds` only; null → `—`. |
| P2-4 | mobile | `positions_screen.dart:337,414`; `apps/mobile/lib/core/exit_reason_l10n.dart:25` (`?? key`) | Unknown exit code prints the raw snake_case key; known codes print the label but no explanation. | Unknown → `Closed`, no explanation. Known → label + one-line A8 explanation. |
| P2-5 | mobile | `positions_screen.dart:415` | Bot appears twice (identity and breakdown) and there is no `View bot`; A9 allows only that action. | Remove the duplicate `Bot` row; render one secondary `View bot` only when the bot resolves. |
| P2-6 | desktop | `apps/desktop/src/components/PnlReportDialog.tsx:113-114` (`botText`), used at `:210,413` | An unknown `strategy_id` prints the first 8 characters of the raw UUID plus `…`. | Unknown bot → `—`; keep `View bot` hidden (already correct at `:197,242`). |
| P2-7 | desktop | `apps/desktop/src/components/pnlReportView.ts:62` (`hour: "numeric"`), `:78-82` (`entryExitText`); hint at `apps/desktop/src/i18n/local.ts:62,167`; rendered at `PnlReportDialog.tsx:362,415` | Ledger times use a 12-hour clock in EN and show the date only on the exit side (`11:52 PM → Nov 6 · 12:12 AM`). A6 requires 24-hour WIB and dates on **both** sides when the day changes. | `14:02 → 15:37`; cross-day `28 Okt · 23:52 → 29 Okt · 00:12`; hint says both dates appear when the day differs. Receipt already uses 24 h correctly. |
| P2-8 | desktop | `apps/desktop/src/i18n/local.ts:179` (`"pnl.report.hold": "Tahan"`) | ID ledger header uses “Tahan”; A5 says use “Durasi tahan”, never “Tahan”. | Change the ID value to `Durasi tahan`; one label for ledger and receipt. |
| P2-9 | web | `apps/web/app/(app)/pnl/page.tsx:164`; `apps/web/components/ui/Table.tsx:80` | Hint visibility is `hidden sm:inline xl:hidden`, i.e. breakpoint-driven. At exactly 1280 on Windows a 15 px scrollbar can keep `xl` false and show “Scroll sideways” while `scrollWidth − clientWidth = 0`; add a column later and it stays hidden while overflow exists. | Bind the hint and right-edge fade to a measured `scrollWidth > clientWidth + 1` (ResizeObserver), with the breakpoint only as the initial state. Keep `aria-describedby` pointing at the hint node only when visible. |

## 3. P3 — consistency and polish

| ID | surface | file:line | gap | direction |
|---|---|---|---|---|
| P3-1 | desktop | `PnlReportDialog.tsx:207-210` | Identity order is chip → time → bot; A2 #3–#5 is bot → chip → time. | Reorder to bot, `Closed` chip, close time. |
| P3-2 | desktop | `PnlReportDialog.tsx:255-263` and `:205` | `$SYMBOL` appears in both the receipt header and the identity block. | Keep the symbol in the identity block; header is `← Closed trade` only, or drop the body repeat. |
| P3-3 | desktop | `PnlReportDialog.tsx:224` | “Fees are already in SOL in/out” is only a `title` tooltip on the label. | Add one visible 10–11 px hint under the breakdown (the A2 #10 rule), or an info affordance that is keyboard reachable. |
| P3-4 | desktop | `apps/desktop/src/components/PnlReportDialog.tsx:369-378` vs `apps/web/app/(app)/pnl/page.tsx:179-199` | Desktop ledger order is Coin · Realized · % · In · Out · Fees · Bot · Exit reason · Entry→exit · Hold; web is Coin · Strategy · In · Out · Realized · % · Fees · Entry→exit · Hold · Exit. | Pick one order for both. Recommended: desktop order (result first, then amounts, owner, why, when, how long) and align web after v1.1; also rename web `Strategy` → `Bot`. |
| P3-5 | mobile | `positions_screen.dart:358`; `wire.dart:213-218` | Short-mint fallback is `abcd.wxyz` and still gets a `$` prefix; A2 #2 says short mint without `$`. | Use `7xK…9fQ` style and omit `$` when the symbol is unknown. |
| P3-6 | mobile | `positions_screen.dart:254` and `:358` | AppBar title and identity both show `$SYMBOL`. | AppBar title can stay context; drop the duplicate inside the card or make the AppBar the title only. |
| P3-7 | mobile | `positions_screen.dart:416` | Literal `" WIB"` is spliced into the string instead of the localized time helper. | Use `formatTime(..., zone: 'WIB')` / the A5 key so the suffix is not hardcoded. |
| P3-8 | web | `apps/web/components/ui/StatStrip.tsx:28,57` | Comments describe “2 + 2 + 2 on row 1, 3 + 3 on row 2”, but the code is 3 cells × 2 tracks then 2 × 3 tracks (3 + 2). | Fix the comment; keep the 3 + 2 code (verified). |
| P3-9 | web | `C:\Users\H P\OpenBot\Shared\centurion-work\pnl-web\v1.1-fix\measure.json` | `hintVisible` records the note paragraph text and width, so it cannot prove the hint span is hidden at 1280/1440. | Next evidence pass: `getClientRects().length` and `offsetParent` per hint span, plus the measured overflow. |

## 4. Mobile receipt: target order (for the fix pass)

```
logo 32 · $SYMBOL · Bot: <name> · [Closed] · 06 Nov · 14:32 WIB
────────────────────────────────────────
Realized PnL                         +0.214
                                     +31.0%
Locked at close, does not follow the live price
────────────────────────────────────────
SOL in        SOL out       Fees (reported)   Hold
0.200         0.414         0.002             2h 5m
────────────────────────────────────────
Entry → exit                 0.000000255 → 0.000000412 SOL
                             14:02 → 15:37 WIB
Take profit
The take-profit target was hit
────────────────────────────────────────
Amounts in paper SOL · times in WIB (GMT+7)
Server-reported · not recalculated
                                             [View bot]
```

Rules: no `ModeChip` in the receipt, no `Sell`, no duplicate bot row, no unit in the hero, every null
keeps its row and shows `—`, and the button is the only action.

## 5. Labels missing on mobile (EN / ID)

Present already: `pnlRealized`, `pnlRealizedHeroHint`, `pnlClosed`, `pnlReceiptSolIn`, `pnlReceiptSolOut`,
`pnlReceiptFees`, `pnlReceiptHold`, `pnlReceiptEntryExit`, `pnlReceiptExitReason`, `pnlReceiptBot`.

| canonical key | ARB identifier | EN | ID | use |
|---|---|---|---|---|
| `pnl.receipt.title` | `pnlReceiptTitle` | Closed trade | Trade tertutup | receipt semantic title / screen label |
| `pnl.receipt.closed_at` | `pnlReceiptClosedAt` | Closed {time} WIB | Ditutup {time} WIB | accessible label for the chip + time |
| `pnl.receipt.fees_hint` | `pnlReceiptFeesHint` | Swap fees are already included in SOL in and SOL out | Biaya swap sudah termasuk di SOL masuk dan SOL keluar | visible/tooltip hint |
| `pnl.receipt.entry_exit_value` | `pnlReceiptEntryExitValue` | {entry} → {exit} | {entry} → {exit} | SOL prices |
| `pnl.receipt.entry_exit_value_dates` | `pnlReceiptEntryExitValueDates` | {entry_date} · {entry_time} → {exit_date} · {exit_time} | {entry_date} · {entry_time} → {exit_date} · {exit_time} | cross-day price line, if dates are added |
| `pnl.receipt.entry_exit_time` | `pnlReceiptEntryExitTime` | {entry} → {exit} WIB | {entry} → {exit} WIB | same-day times |
| `pnl.receipt.entry_exit_time_dates` | `pnlReceiptEntryExitTimeDates` | {entry_date} · {entry_time} → {exit_date} · {exit_time} WIB | {entry_date} · {entry_time} → {exit_date} · {exit_time} WIB | cross-day times |
| `pnl.receipt.units` | `pnlReceiptUnits` | Amounts in {unit} · times in WIB (GMT+7) | Nilai dalam {unit} · waktu WIB (GMT+7) | A2 #15 |
| `pnl.receipt.provenance` | `pnlReceiptProvenance` | Server-reported · not recalculated | Dari server · tidak dihitung ulang | A2 #16 |
| `pnl.receipt.view_bot` | `pnlReceiptViewBot` | View bot | Lihat bot | A9 |
| `pnl.receipt.back` | `pnlReceiptBack` | Back to closed trades | Kembali ke trade ditutup | back control a11y |

### 5.1 Exit-reason explanations (all 14 missing)

| code | ARB identifier | EN | ID |
|---|---|---|---|
| `sell_floor` | `pnlReceiptWhySellFloor` | The floor price you set was hit | Harga batas bawah yang kamu pasang tersentuh |
| `profit_target` | `pnlReceiptWhyProfitTarget` | The take-profit target was hit | Target take-profit tersentuh |
| `loss_guard` | `pnlReceiptWhyLossGuard` | The stop-loss limit was hit | Batas stop-loss tersentuh |
| `peak_trail` | `pnlReceiptWhyPeakTrail` | Price fell from its peak by the trail margin | Harga turun dari puncaknya sebesar jarak trailing |
| `max_hold` | `pnlReceiptWhyMaxHold` | The maximum holding time ran out | Batas waktu tahan habis |
| `idle` | `pnlReceiptWhyIdle` | The coin stopped moving, so the bot exited | Koin berhenti bergerak, bot keluar |
| `sell_pressure` | `pnlReceiptWhySellPressure` | Sell pressure crossed the exit threshold | Tekanan jual melewati ambang keluar |
| `no_new_high` | `pnlReceiptWhyNoNewHigh` | No new high within the time window | Tidak ada high baru dalam jendela waktu |
| `rug_detected` | `pnlReceiptWhyRugDetected` | Guard detected rug risk and exited | Guard mendeteksi risiko rug lalu keluar |
| `drawdown_halt` | `pnlReceiptWhyDrawdownHalt` | The workspace drawdown limit was hit | Batas drawdown workspace tersentuh |
| `manual` | `pnlReceiptWhyManual` | You closed this trade manually | Kamu menutup trade ini secara manual |
| `strategy_retired` | `pnlReceiptWhyStrategyRetired` | The bot was retired, so the position was closed | Bot dihentikan, posisi ditutup |
| `practice_reset` | `pnlReceiptWhyPracticeReset` | The paper account was reset | Akun paper direset |
| `stall` | `pnlReceiptWhyStall` | Price stalled on the exit rule | Harga mandek pada aturan keluar |

Delivery: published in `packages/i18n` 0.4.12 — `arb/app_en.arb` + `app_id.arb` now carry all 25 keys
(ARB 975 strings, EN/ID parity). Those ARB files stay in the shared catalog. The Flutter app that vendored
them was removed, so there is no `apps/mobile/lib/l10n` copy and no vendored-pin script to update.
Do not re-add these keys to the package.

Desktop has all 14 `pnl.receipt.why.*` keys in EN/ID (`apps/desktop/src/i18n/local.ts:106-119,222-235`).

## 6. Markets keys — final

The canonical table is now B10 in [receipt-and-discovery.md](receipt-and-discovery.md). Final set:
**89 keys = 75 P0 + 14 P1**, no duplicates.

```
markets.title, markets.tablist, markets.tab.trending, markets.tab.new, markets.tab.graduated,
markets.tab_count, markets.subtitle, markets.window.15m, markets.window.1h, markets.window.6h,
markets.window.24h, markets.window_label, markets.live, markets.stale, markets.offline,
markets.updated, markets.updated_now, markets.caption, markets.trending_note, markets.graduated_note,
markets.new_chip, markets.venue.curve, markets.venue.amm, markets.col.rank, markets.col.coin,
markets.col.age, markets.col.graduated_age, markets.col.venue, markets.col.mcap, markets.col.change,
markets.col.activity, markets.col.guard, markets.activity_hint, markets.mcap_indicative,
markets.mcap_as_of, markets.mcap_source, markets.guard_passed, markets.guard_failed,
markets.guard_not_evaluated, markets.guard_not_evaluated_hint, markets.empty.new,
markets.empty.graduated, markets.empty.trending, markets.empty_filtered, markets.clear_filters,
markets.widen, markets.refresh, markets.retry, markets.load_more, markets.loading_more,
markets.loading, markets.error.title, markets.error.body, markets.feed_down,
markets.rate_limited, markets.rate_limited_unknown, markets.offline_cached, markets.stale_row,
markets.new_rows, markets.new_rows_action, markets.new_rows_announce, markets.row_open,
markets.row_a11y, markets.row_a11y_rank, markets.row_a11y_compact, markets.filter.title,
markets.filter.launchpad_all, markets.hide_failed, markets.show_not_tradeable,
markets.tooltip_score, markets.age.now, markets.age.seconds, markets.age.minutes,
markets.age.hours, markets.age.hours_minutes, markets.age.days,
markets.detail.market_only, markets.detail.breadcrumb, markets.detail.tradeable,
markets.detail.not_tradeable, markets.detail.send_to_review, markets.detail.sent,
markets.detail.no_strategies, markets.detail.first_seen, markets.detail.migrated,
markets.detail.venue, markets.detail.mcap, markets.detail.chart_unavailable, markets.detail.back
```

13 additions finalized in this pass:

| canonical | ARB | EN | ID | prio |
|---|---|---|---|---|
| `markets.tab_count` | `marketsTabCount` | {tab}, {count} listed | {tab}, {count} terdaftar | P0 |
| `markets.window_label` | `marketsWindowLabel` | Time window | Jendela waktu | P0 |
| `markets.empty_filtered` | `marketsEmptyFiltered` | No markets match these filters | Tidak ada pasar yang cocok dengan filter ini | P0 |
| `markets.clear_filters` | `marketsClearFilters` | Clear filters | Hapus filter | P0 |
| `markets.loading_more` | `marketsLoadingMore` | Loading more… | Memuat lagi… | P0 |
| `markets.rate_limited_unknown` | `marketsRateLimitedUnknown` | Feed rate-limited · retrying shortly | Feed kena rate limit · segera dicoba lagi | P0 |
| `markets.new_rows_action` | `marketsNewRowsAction` | {count} new · tap to refresh | {count} baru · ketuk untuk memuat | P0 |
| `markets.row_a11y_rank` | `marketsRowA11yRank` | Rank {rank}, {symbol}, {age}, market cap {mcap}, {venue}, {guard} | Peringkat {rank}, {symbol}, {age}, market cap {mcap}, {venue}, {guard} | P0 |
| `markets.row_a11y_compact` | `marketsRowA11yCompact` | {symbol}, {age}, market cap {mcap}, change {change}, activity {activity}, {guard} | {symbol}, {age}, market cap {mcap}, perubahan {change}, aktivitas {activity}, {guard} | P0 |
| `markets.mcap_source` | `marketsMcapSource` | Source: {source} | Sumber: {source} | P1 |
| `markets.detail.breadcrumb` | `marketsDetailBreadcrumb` | Markets / {symbol} | Pasar / {symbol} | P1 |
| `markets.detail.tradeable` | `marketsDetailTradeable` | Tradeable | Bisa ditradingkan | P1 |
| `markets.detail.not_tradeable` | `marketsDetailNotTradeable` | Not tradeable right now | Belum bisa ditradingkan | P1 |

Reuse `common.exampleData` for the mock banner; do not add a `markets.example_data` duplicate.

### 6.1 States (authoritative matrix in B6.1)

| state | rows | copy | action |
|---|---|---|---|
| loading, first paint | 8 skeletons, tab counts `—` | `markets.loading`, `markets.updated` with `—` | none |
| loading, cached tab | existing rows, no jump | previous `markets.updated` | none |
| empty New / Graduated | empty panel | `markets.empty.new` / `.graduated` | `markets.widen` (< 24 h) else `markets.refresh` |
| empty Trending | empty panel | `markets.empty.trending` | `markets.refresh` |
| empty after filter | empty panel | `markets.empty_filtered` | `markets.clear_filters` |
| first-load error | error panel | `markets.error.title` + `markets.error.body` | `markets.retry` |
| feed down with rows | rows kept, stale rows marked | `markets.feed_down` {time}, `markets.stale_row` | `markets.retry` |
| 429 with `retry_after_s` | rows kept | `markets.rate_limited` {seconds} | auto at 0, then backoff; no manual loop |
| 429 without header | rows kept | `markets.rate_limited_unknown` | 5→10→20→40 s, cap 60 s |
| offline device | cache kept | `markets.offline_cached` {time} | `markets.retry`, enabled on `online` |
| per-row stale ≥ 60 s | row kept | `markets.stale_row`, title `markets.stale` | replaced by next poll |

Priority when several apply: **offline > 429 > feed down > per-row stale**. A 429 or error never clears
existing rows. Ages come from server `as_of` + `skewFrom(server_now)`, never arrival time.

## 7. D1 visual direction — 5-cell KPI strip

Accepted measurements on `main = cc77fb7` (dark, EN + ID; `measure.json` + PNGs in
`Shared\centurion-work\pnl-web\cc77fb7`; method in §11):

| viewport | layout | strip width | clipped cells | evidence |
|---|---|---:|---|---|
| 1024 | 3 + 2 (3 × 257 px, 2 × 387 px) | 774 / 774 | none | `pnl-en-1024.png`, `pnl-id-1024.png` |
| 1280 | 5 × 205 px | 1030 / 1030 | none | `pnl-en-1280.png`, `pnl-id-1280.png` |
| 1440 | 5 × 237 px | 1190 / 1190 | none | `pnl-en-1440.png`, `pnl-id-1440.png` |

Direction:

- **Never 5 across below 1280.** At 1024 five tracks are ~155 px and “Realized · 7D” + `−8,98 paper
  SOL` clips (the original P1). 1280 is the first width where 5 across is allowed.
- 768–1279: 6-track grid, first three cells span 2 tracks, last two span 3 tracks → **3 + 2**, no orphan
  cell. 1024 cells are 257 / 387 px.
- <768: 2 tracks, 5th cell spans both columns (2 + 2 + 1 full width), never a lone half-cell.
- Cell anatomy: label (overline, 2 lines max) → value (number, `white-space: nowrap`) → unit (caption,
  second line, may wrap) → hint (caption, 1 line, ellipsis with `title`). Numbers never ellipsize.
- One container, 1 px hairline gap, radius 8; no per-cell shadow or separate cards.
- All five KPIs stay visible at every width. Do not hide one, move it to a tooltip, or add horizontal
  scroll to the strip; overflow is a layout defect.
- Fixed label height on the 3 + 2 row so values align even when one label wraps.
- Verify: `scrollWidth ≤ clientWidth` for the strip **and** each value node; longest negative value,
  exact zero and null (`—`); EN/ID; 1024/1280/1440; 200% text zoom (effective 640 → 2 columns).

## 8. D2 visual direction — closed ledger at 1280

Current measured state on `main = cc77fb7` (dark, EN + ID; `measure.json` in
`Shared\centurion-work\pnl-web\cc77fb7`): table **1030 / 1030**, overflow **0** at 1280 and 1440; at 1024
the table is 983 (EN) / 1013 (ID) against 774, so it scrolls by **209 / 239 px** and the hint is visible.
That part of the progression is correct. Two implementation gaps remain against this direction: the row
renders **69 px**, not 52 (the `py-3` cell padding plus the 44 px coin link overrides `h-[52px]`), and the
Coin column is **not sticky** at 1024 (`sm:static` removes it exactly where overflow starts). Full numbers
in §11.

Direction:

| width | behaviour |
|---|---|
| ≥1280 | 10 columns fit; no horizontal scroll; no hint; no right-edge fade |
| 1024–1279 | horizontal scroll; persistent hint **visible**, not hover-only; sticky Coin column; right-edge fade |
| <640 | switch to the existing card list; no table |

Column budget at 1280 (content 1030 px, dense 6 px side padding, 12 px font):

| column | width | rules |
|---|---:|---|
| Coin | 112–128 | logo 24 + `$SYMBOL`, one line, link hit area ≥ 24 px |
| Bot | 96–112 | one line, ellipsis at ~14 ch, full name in `title`; never wrap |
| In / Out | 56–64 each | numeric only, right aligned, tabular, never wrap |
| Realized | 64–80 | sign + tone; zero neutral; null `—` |
| % | 44–52 | one decimal, sign; null `—` |
| Fees (reported) | 76–92 | header may wrap to 2 lines; value numeric |
| Entry → exit | 104–124 | same-day `14:02 → 15:37` one line; cross-day two lines (`28 Okt · 23:52` / `→ 29 Okt · 00:12`), fixed row height 52 so rows do not jump |
| Hold | 44–56 | `2h 5m`; null `—` |
| Exit reason | 88–104 | header may wrap; label may ellipsize to 1 line with `title` |

Rules:

- Row height 52 px, vertical padding 10 px, horizontal 6 px (`px-1.5`). Header 11–12 px, 2 lines max;
  numeric headers never wrap.
- Numeric cells are mono, tabular, right aligned, `white-space: nowrap`; never shrink below 11 px and
  never clip a value. If space runs out, drop padding or wrap the header, not the number.
- Bot names are the only freely long text: ellipsize, never wrap, keep the full name in `title`.
- Hint logic: measure `scrollWidth − clientWidth > 1` on the scroll container and toggle the hint +
  right-edge mask from that measurement (`ResizeObserver`). Breakpoints set the initial expectation
  only; this removes the Windows-scrollbar/1280 ambiguity. When visible, the hint is a real line above
  the table and is referenced by `aria-describedby`.
- At 1024, keep Coin sticky while scrolling (current `sm:static` removes stickiness exactly where
  overflow exists). Sticky only while overflow is real; no shadow when not scrolling.
- Accessibility: scroll container `role="region"`, `aria-label` from the ledger title, `tabIndex=0`;
  header sort controls keep `aria-sort`; focus ring visible on the row/coin link.
- Verify with hostile fixtures: bot name 24 chars, ID “Biaya (dilaporkan)” header, cross-year timestamps,
  null row, zero row, 50 rows. Expected: overflow 0 at 1280/1440 in EN and ID; hint visible iff
  overflow > 0; screenshot + JSON with `scrollWidth`, `clientWidth`, `hintRects`.

## 9. Desktop and mobile: what is already right

Desktop:

- Server values only: `receiptSol(selected.pnl_lamports)`, `receiptPct(selected.pnl_pct)`,
  `holdText(selected.hold_seconds)` (`PnlReportDialog.tsx:192-193,225`); no client PnL math.
- SOL prices from `avg_entry_price_sol` / `exit_price_sol` (`:230`, `pnlReportView.ts:187-196`), one
  trailing `SOL`, per-side `—`.
- Receipt WIB 24 h and close-time date/year (`pnlReportView.ts:88-115`), entry→exit time on the same
  WIB clock (`:122-140`).
- Null → `—`, zero neutral, logo 32 with identicon, unit + provenance lines, 14 explanations, only
  `View bot` (`:197-247`), `Esc` back/focus restore (`:63,90-99`), 760 px receipt class applied
  (`:255`, `app.css:331`).
- Ledger has In / Out / Fees / Bot / Entry→exit / Hold with em dash on null (`:372-378,410-416`).

Mobile:

- `hold_seconds` wins over timestamps when present (`models.dart:279-283`); fees are context only; no
  Sell on the closed branch; unknown bot shows `—`.
- WIB conversion is fixed in the working tree: `fmtTime` converts with `toWib` before formatting
  (`apps/mobile/lib/core/format.dart:59-60`, `l10n_format.dart:107`). The earlier F2 “device zone
  labelled WIB” defect is **closed**; do not re-report it.

Web:

- D1 and D2 measurements above; 10 columns at 1280; null fees/pct/hold → `—` in the ledger; D3/D6/D7
  fixes are in the same uncommitted web set.

## 10. Handoff

- **Desktop specialist:** P2-6…P2-8, P3-1…P3-4. These are local label/format changes in
  `PnlReportDialog.tsx`, `pnlReportView.ts`, `local.ts`, `app.css`.
- **Mobile:** the Flutter app was removed. Mobile P1–P3 rows in this review are a historical record, not remaining app work.
- **Web specialist:** P1-4 (`contracts.ts:686-697`), P2-9 (measured hint), P3-4/P3-8/P3-9. Keep the
  verified D1/D2 measurements; do not change the 3 + 2 / 5-across breakpoints or `wrapUnit`.
- **Backend:** unchanged by this review. Discovery still needs `capabilities`, `rank_position`,
  `weights_version`, weights/inputs and `price_change_since_migration_pct` (B11); `capabilities` must be
  authoritative for columns.
- **Lead:** commit `packages/i18n` 0.4.12 (six paths: `package.json`, `CHANGELOG.md`, `README.md`,
  `key-migrations.json`, `arb/app_en.arb`, `arb/app_id.arb`) and the two `docs/design` docs from this
  scope. The app tree is dirty with other owners’ work; do not bundle it into this commit.

Gate run for this pass:

| gate | result |
|---|---|
| `git status --short -- packages/i18n docs/design` | 8 paths (6 package + 2 design docs), no app code |
| `git diff --check -- packages/i18n docs/design` | clean |
| ARB keys | 975 EN + 975 ID; +114 (25 receipt, 89 markets), 0 duplicates |
| ICU parse / `flutter gen-l10n` / `npm test` | 0 errors / exit 0 / 10 of 10 |
| D1 + D2 evidence | §11 tables, measured on `cc77fb7` |
| vendored `apps/mobile/lib/l10n` + pins | untouched |
| evidence limits | snapshot archive of `cc77fb7` + local Chrome; no device/emulator/live backend |

Limits: this is a code-and-evidence review, not a runtime pass on desktop/mobile. Mobile receipt fixes
still need a widget/golden run after the ARB lands; desktop needs the dialog screenshots at the receipt
state, not only the ledger.

## 11. Evidence re-run on `cc77fb7` (6 Nov 2026)

Method: pristine tree from `git archive cc77fb7` (the shared worktree is dirty with other owners’ work),
local `next dev` (Turbopack, mock data), `CENTURION_AUTH_GATE=0` (screenshot-only, no session), locale set
through `POST /api/locale`, Chrome at 1024/1280/1440 × EN/ID, `/pnl?window=7d` with 50 closed rows.
Measured `scrollWidth − clientWidth` on the document, the 5-cell strip, and the ledger scroll container.
No app code was edited. Raw runs and PNGs:
`C:\Users\H P\OpenBot\Shared\centurion-work\pnl-web\cc77fb7\` (`measure.json`, `pnl-{en,id}-{1024,1280,1440}.png`).
The older `v1.1-fix` folder is uncommitted-tree evidence; do not mix it with these numbers.

### 11.1 D1 — 5-cell KPI strip

| viewport | locale | layout | strip `scrollWidth` / `clientWidth` | diff | cell widths | clipped values | doc diff |
|---:|---|---|---:|---:|---|---:|---:|
| 1024 | EN | 3 + 2 | 774 / 774 | **0** | 257, 257, 257, 387, 387 | 0 | 0 |
| 1024 | ID | 3 + 2 | 774 / 774 | **0** | 257, 257, 257, 387, 387 | 0 | 0 |
| 1280 | EN | 5 across | 1030 / 1030 | **0** | 205 × 5 | 0 | 0 |
| 1280 | ID | 5 across | 1030 / 1030 | **0** | 205 × 5 | 0 | 0 |
| 1440 | EN | 5 across | 1190 / 1190 | **0** | 237 × 5 | 0 | 0 |
| 1440 | ID | 5 across | 1190 / 1190 | **0** | 237 × 5 | 0 | 0 |

All five cells stay inside the strip at every width; no value node overflows. Cell height grows when the
unit wraps: 108 px at 1024, 142 px EN / 158 px ID at 1280, 142 px at 1440. **D1 passes** the direction in
§7 on this commit.

### 11.2 D2 — closed ledger

| viewport | locale | wrapper `clientWidth` | table / `scrollWidth` | diff | hint | Coin sticky | row height |
|---:|---|---:|---:|---:|---|---|---:|
| 1024 | EN | 774 | 983 | **209** | visible | no | 69 |
| 1024 | ID | 774 | 1013 | **239** | visible | no | 69 |
| 1280 | EN | 1030 | 1030 | **0** | hidden | no | 69 |
| 1280 | ID | 1030 | 1030 | **0** | hidden | no | 69 |
| 1440 | EN | 1190 | 1190 | **0** | hidden | no | 69 |
| 1440 | ID | 1190 | 1190 | **0** | hidden | no | 69 |

Page-level `scrollWidth − clientWidth` is **0** in all six runs: the 1024 overflow stays inside the table
scroll container, so the page itself never scrolls sideways. Dense horizontal padding is 6 px.

Gaps against §8, all in `apps/web` (not fixed by this UX pass):

1. **Row height 69 px, not 52.** `Table.tsx:93` sets `h-[52px]`, but the cells keep `py-3`
   (`Table.tsx:95-105`) and the coin link has `min-h-11` — 44 px of content plus 24 px padding.
2. **Coin column not sticky at 1024.** `Table.tsx:85,103` adds `sticky left-0` and then removes it with
   `sm:static`, so stickiness disappears from 640 px up, exactly where the overflow begins.
3. **Hint is breakpoint-only, not measured.** `page.tsx:169` uses `hidden sm:inline xl:hidden`. It matches
   the current data by luck; a long bot name at 1280 fits today only because the table is at 1030/1030, and
   the direction asks for a `ResizeObserver` measurement instead.
4. **No right-edge fade at 1024.** `Table.tsx:80` keeps the mask only below `sm` (`sm:[mask-image:none]`).
5. **Scroll container is a plain div.** `Table.tsx:80` has no `role="region"`, `tabIndex=0`, or
   `aria-describedby` back to the hint.

The ledger’s null/zero formatting and the 1024 hint copy were verified visually in the same PNGs; the
remaining D2 gaps are layout/a11y, not money formatting.

### 11.3 i18n publish gates (`@centurion/i18n` 0.4.12)

| gate | result |
|---|---|
| ARB keys | **975 EN + 975 ID** (+114: 25 receipt = 11 labels + 14 `pnlReceiptWhy*`; 89 markets = 75 P0 + 14 P1), 0 duplicates |
| ARB ↔ design docs | 114/114 canonical keys and EN/ID strings match §5 + B10, **0 mismatches** |
| `en.json` / `id.json` | unchanged at 786 (Web/Desktop catalogs; receipt keys are Flutter-only and the markets copy still lives in the consumer files per B10.1) |
| ICU parse, EN + ID | 1950 messages, **0 errors**; placeholder parity EN/ID and ARB metadata **0 errors** |
| `flutter gen-l10n` | **exit 0** on a copy of both ARBs; 975 keys; `marketsNewRowsAnnounce` emits `one`/`other` with `int count` (no `#`) |
| `npm test` (`format.test.mjs`) | 10/10 pass |
| `git diff --check -- packages/i18n docs/design` | clean |
| vendored `apps/mobile/lib/l10n` + pins | untouched at this snapshot; the Flutter app was later removed |
