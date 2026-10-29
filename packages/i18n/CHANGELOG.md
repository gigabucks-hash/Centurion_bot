# Changelog · @sentra/i18n

Sumber: `ux-solbot/scripts/build_locales.py` (UX). Format: [Keep a Changelog](https://keepachangelog.com/), versi 0.x (setiap minor/patch boleh breaking; ditandai **BREAKING**). Waktu WIB.

## 0.4.6 · 29 Okt 2026 (UX Rev 4.6, contracts 1.1.4)
538 key (+23). Tidak ada key dihapus/di-rename → **tidak ada breaking change**. Satu perubahan copy (lihat "Diubah").

### Ditambahkan
- errors.json **v6**: `error.code.quote_missing_or_stale` (`QUOTE_MISSING_OR_STALE`, 409, retryable, Real saja). Coverage 58/58 (copy 47, fallback 11).
- `errors.map.json`: field opsional baru per kode (aditif): `tone` (`pending`/`warning`; default error), `title_key`, `cta_key`, `inline_key`, `modes`.
  `QUOTE_MISSING_OR_STALE` → tone `warning`, CTA `review.quote.refresh`, inline `review.quote.stale`, modes `["real"]`.
  `GUARD_WEAKEN_REQUIRES_APPROVAL` → tone `pending`, title `guard.weaken.pending.title`, CTA `guard.weaken.pending.open`.
- Kesegaran quote di review sheet WF-22 `review.quote.*` (9): `updated_ago` (`{seconds}` plural, `=0` "baru diperbarui"), `expires_in` (`{seconds}`),
  `stale` ("Quote kedaluwarsa — perbarui untuk lanjut"), `missing`, `practice_stale` (Practice tidak pernah diblokir), `refresh` (CTA), `refreshing`,
  `updated_inline` ("Quote diperbarui", untuk `proposal.updated`), `changed_during_hold` (hold Real di-reset saat quote berubah).
- Market cap `mcap.{label,as_of,usd_indicative,sol_value}`; nilai null → "—" + `common.value.unavailable`.
- `exit_reason.stall` ("Stall exit" / "Exit stagnan", contracts 1.1.4 `stall_exit`; bukan `stall` v1.0 = `no_new_high`). `max_hold` juga dipakai `time_stop_s`.
  Build gagal bila `ExitReason` di `contracts/src/wire/events.ts` ≠ key `exit_reason.*` (14/14).
- Builder: `builder.exit.time_stop_hint` (`{duration}`), `builder.exit.stall`, `builder.exit.stall_hint` (`{min_move_pct}`, `{window}`).
- Guard weakening lewat REST PATCH → `202 {proposal, guard_change}`: `guard.weaken.pending.{title,body,open}` (`{expires_at}`), tone info/pending, bukan error.
  `guard.change_status.{rejected,expired}` (status `guard.changed` baru).
- `format.mjs` (semua null-safe → `DASH` "—"): `formatLamportsOrDash`, `formatBps` (25 → 0,25%), `formatRawQty(raw, decimals)` (BigInt, decimals tidak diasumsikan),
  `quoteState(q, skew, {mode})` → `{state: missing|fresh|stale, ageS, expiresInS, blocksApprove}` (Real saja yang diblokir),
  `formatRelativeSeconds` (Intl.RelativeTimeFormat, Web), `formatMcapUsd` ("$1.2M" / "$1,2 jt"), `formatMcapSol` ("8.4K SOL"). Tes: 7/7.
- `notifications.meta.json`: blok baru `silent_events`. **`proposal.updated` = senyap** (tanpa push, tanpa toast, tanpa N-id): merge field quote, simpan
  `rev` baru untuk `expected_rev`, label inline `review.quote.updated_inline` hanya bila review sheet terbuka; bila hold Real sedang berjalan → batalkan
  hold + `review.quote.changed_during_hold`. Alasan: refresh quote rutin (~15 dtk di practice), notifikasi = noise.
- Build: cek baru `ProposalQuoteFields` (8/8 field) ↔ key `review.*`.
- `key-migrations.json`: array baru `releases` (per versi: `renamed`, `removed`, `copy_changed`, `description_changed`).

### Diubah
- `error.code.guard_weaken_requires_approval` copy jadi status menunggu: EN "Change waiting for approval. It loosens a guard, so nothing applies until you
  approve it." / ID "Perubahan menunggu approval. Ini melonggarkan guard, jadi belum berlaku sampai kamu approve." Snapshot test yang mencari
  "perlu approval" harus diganti (referensi Flutter test sudah).
- Deskripsi ARB (bukan copy) `review.{network_fee,priority_fee,swap_fee,slippage,min_received_value,total_max,estimate_note}` menunjuk field wire 1.1.4
  dan helper baru; `exit_reason.max_hold` mencatat `time_stop_s`.

## 0.4.5 · 29 Okt 2026 (UX Rev 4.5)
515 key (+33). Tidak ada key dihapus/di-rename → **tidak ada breaking change**.

### Ditambahkan
- Transaction review sheet `review.*` (15): `title` (`{side}` select sell/other), `you_pay`, `price`, `network_fee`, `priority_fee`, `swap_fee`, `slippage`, `min_received`, `min_received_value` (`{min_out}`, `{symbol}`), `total_max`, `estimate_note` (`{time}`), `practice_note`, `real_note`, `price_moved` (`{pct}`), `details_toggle`.
- Portfolio hero `portfolio.balance.{label,change,updated,hidden}`, `portfolio.sparkline.a11y` (`{trend}` select up/down/other, `{range}`, `{start}`, `{end}`); `common.range.{1d,7d,30d,all}`.
- `common.value.unavailable` ("Data belum tersedia"): tooltip/aria untuk "—" muted (mis. Mcap sampai Backend mengirim market cap). `common.state.loading`, `common.state.loading_section` (skeleton container).
- contracts 1.1.3 `ApprovalRejectReason` → `reject_reason.{user_declined,not_tradeable,price_moved,other}` (Activity/Audit). Build gagal bila enum di `contracts/src/wire/events.ts` ≠ key.
- `queue.skip_reason.price_moved`; **`reject_reasons.map.json`** baru: chip skip → wire `reject_reason` (+ `reason` detail). `queue.skip_reason.not_tradeable` → wire `reject_reason: "not_tradeable"` (bukan `reason`, koreksi catatan 0.4.4).
- errors.json **v5**: `error.code.guard_weaken_requires_approval` (`GUARD_WEAKEN_REQUIRES_APPROVAL`, 409). Coverage 57/57.

## 0.4.4 · 29 Okt 2026 (UX Rev 4.4)
482 key (+18). Tidak ada key yang dihapus atau di-rename, jadi **tidak ada breaking change untuk konsumen paket**. Untuk Desktop: string lokal `desktop.*` diganti key paket (tabel di bawah). Tiga di antaranya mengganti nama placeholder.

### Ditambahkan
- 18 key bersama (platform-agnostic, tanpa `desktop.*`): `queue.title_short`, `chart.title`, `screener.status.pending_guard`, `screener.empty`, `screener.legend`, `screener.detail.score_value_info`, `screener.detail.chart_note`, `screener.detail.skip_hint`, `queue.skip_reason.not_tradeable`, `queue.batch.excluded_not_tradeable`, `queue.empty`, `positions.title_paper`, `positions.empty` (`{mode}` select), `positions.sell.unavailable`, `positions.sell.not_tradeable_detail`, `positions.sell.confirm_title`, `positions.sell.quote_ttl`, `feed.actor.ingest`.
- `key-migrations.json`: `desktop.*` → key baru (dicek saat build: semua target ada).
- Keputusan: kartu not-tradeable **boleh Skip** (menolak bukan trade); Approve tidak ada/disabled; tidak ikut batch approve. Reason Skip preselect `queue.skip_reason.not_tradeable` (wire `reason: "not_tradeable"`).

### Migrasi key Desktop (`apps/desktop/src/i18n/local.ts`)
Perhatian, ganti nama placeholder: `rejected_score` `{pass}` → `{score_threshold}`; `quote_not_sol` `{quote}` → `{quote_symbol}`; `score_value_info` `{max}` → `{max_score}`; `quote_ttl` `{s}` → `{seconds}`. Ada juga beberapa perubahan copy EN (mis. "Approve — not available").

| Lama (`apps/desktop` local.ts) | Baru (`@sentra/i18n`) | Catatan |
|---|---|---|
| `desktop.tab.queue` | `queue.title_short` | sama |
| `desktop.tab.chart` | `chart.title` | sama |
| `desktop.screener.title` | `screener.title` | sama |
| `desktop.screener.filter.passed` | `screener.filter.passed` | sama |
| `desktop.screener.filter.rejected` | `screener.filter.rejected` | sama |
| `desktop.screener.col.coin` | `screener.col.coin` | sama |
| `desktop.screener.col.venue` | `screener.col.venue` | sama |
| `desktop.screener.col.liquidity` | `screener.col.liquidity` | sama |
| `desktop.screener.col.score` | `screener.col.score` | sama |
| `desktop.screener.col.guard` | `screener.col.guard` | sama |
| `desktop.screener.col.status` | `screener.col.status` | sama |
| `desktop.screener.col.action` | `screener.col.action` | sama |
| `desktop.screener.status.pick` | `screener.status.pick_queued` | sama |
| `desktop.screener.status.pending_guard` | `screener.status.pending_guard` | new |
| `desktop.screener.status.rejected_guard` | `screener.status.rejected_guard` | sama |
| `desktop.screener.status.rejected_score` | `screener.status.rejected_score` | var {pass} → {score_threshold} |
| `desktop.screener.open_queue` | `screener.action.open_queue` | sama |
| `desktop.screener.empty` | `screener.empty` | new |
| `desktop.screener.legend` | `screener.legend` | new, rewritten as user copy (+ Skip allowed) |
| `desktop.nt.pair_quote` | `screener.detail.quote_pair` | sama |
| `desktop.nt.pair_quote_value` | `screener.detail.quote_not_sol` | var {quote} → {quote_symbol} |
| `desktop.nt.pair_sol` | `screener.detail.sol_pair` | sama |
| `desktop.nt.pair_sol_none` | `screener.detail.none` | sama |
| `desktop.nt.score` | `screener.detail.score` | sama |
| `desktop.nt.score_value` | `screener.detail.score_value_info` | new; var {max} → {max_score} |
| `desktop.nt.guard` | `screener.detail.guard` | sama |
| `desktop.nt.guard_value` | `screener.detail.guard_not_run` | sama |
| `desktop.nt.reason_code` | `screener.detail.reason_code` | ID copy “Kode alasan” |
| `desktop.nt.chart_note` | `screener.detail.chart_note` | new, shorter |
| `desktop.nt.approve_unavailable` | `screener.detail.approve_unavailable` | EN “Approve — not available” |
| `desktop.nt.sell_unavailable` | `positions.sell.unavailable` | new; ID “Jual — tidak tersedia” |
| `desktop.nt.sell_detail` | `positions.sell.not_tradeable_detail` | new |
| `desktop.nt.cta_note` | — (dihapus) | removed: design annotation, not UI copy (reason is already shown above the button) |
| `desktop.nt.batch_skipped` | `queue.batch.excluded_not_tradeable` | new; meaning = left out of batch approve (not a Skip) |
| `desktop.settings.language` | `settings.language.label` | sama |
| `desktop.queue.empty` | `queue.empty` | new; “(mock)” dev suffix stays app-local |
| `desktop.positions.paper` | `positions.title_paper` | new; whole header, no string concatenation |
| `desktop.positions.empty` | `positions.empty` | new; {mode} select |
| `desktop.sell.confirm_title` | `positions.sell.confirm_title` | new |
| `desktop.sell.quote_ttl` | `positions.sell.quote_ttl` | new; var {s} → {seconds} |
| `desktop.actor.ingest` | `feed.actor.ingest` | new |


## 0.4.3 · 29 Okt 2026 (UX Rev 4.3, contracts 1.1.2)
464 key (+56). Selaras `packages/contracts` 1.1.2 (`errors.json` v4, EVENTS_SCHEMA §4/§6).

### BREAKING
- **Placeholder `{coin}` → `{symbol}` dan `{sol}` → `{amount_lamports}` di semua key** (feed, queue, positions, coin trail, notif). Nama = field wire, jadi push `vars` masuk langsung tanpa mapping. Nilai `{amount_lamports}` tetap **teks SOL hasil formatter** (`formatLamports(vars.amount_lamports, locale, {paper})`), bukan lamports mentah. ARB: parameter method ikut berubah (mis. `notifPickPendingTitle(mode, symbol)`, `notifPickPendingBody(amount_lamports, mm_ss, strategy)`, `queueRealHold(amount_lamports)`).
- **`mm_ss` bukan var push lagi.** `notifications.map.json`: N-01/N-02 `vars` = `symbol`, `strategy`, `amount_lamports`; `{mm_ss}` pindah ke field baru `computed` (dihitung di device: `formatCountdown(remainingMs(exp, skewFrom(server_now)))`). Copy tidak berubah.
- `notifications.map.json` entri mendapat field `computed` dan `token` (`{practice, real}`). Iterasi tetap hanya N-id; aturan + formatter per var di file baru `notifications.meta.json`.

### Ditambahkan
- `errors.map.json`: 56/56 kode `errors.json` v4 → `{key, source: copy|fallback, kind, http, retryable}`; kode tak dikenal → `error.code.internal`. **Build gagal** bila ada kode errors.json tanpa copy atau fallback, fallback menunjuk key yang tidak ada, atau `error.code.*` yang tidak ada di errors.json.
- `error.code.*` +19 (copy diadaptasi dari `messages.en/id` errors.json): `unauthenticated`, `forbidden_scope`, `forbidden_role`, `approval_requires_app`, `not_found`, `validation_failed`, `settings_schema_invalid`, `version_conflict`, `strategy_retired`, `mode_not_allowed`, `confirmation_required`, `confirmation_invalid`, `webauthn_invalid`, `replay_unavailable`, `position_already_closed`, `invalid_fraction`, `practice_cash_insufficient`, `job_dead_lettered`, `source_degraded`. Fallback eksplisit (11): `IDEMPOTENCY_KEY_REUSED`, `CURSOR_INVALID`, `DEVICE_TOKEN_INVALID` → `error.code.internal`; `CURSOR_EXPIRED` → `error.code.unavailable`; `REPLAY_WINDOW_EXCEEDED` → `error.code.validation_failed`; `PRECONDITION_REQUIRED` → `error.code.version_conflict`; 5 kode order → `order.fail_reason.*`.
- `order.fail_reason.position_already_closed|validation_failed|mode_not_allowed` (set `reason_code` order.failed 1.1.2 lengkap = 8 kode, dicek saat build).
- `screener.*` (34 key): label list + detail WF-20/21 (`screener.title`, `filter.*`, `col.*`, `status.*`, `card.*`, `action.open_queue`, `detail.*`). Placeholder = field `screener.scored` (`{score}`, `{max_score}`, `{score_threshold}`) + `{quote_symbol}`.
- `format.mjs`: `pctToFractionBps(pct)` (RangeError `INVALID_FRACTION` di luar 0,01–100%), `fractionBpsToPct(bps)`, `formatFractionBps(bps, locale)`. Manual sell: UI persen, wire `fraction_bps`.
- Validasi map saat build: setiap placeholder copy = var wire atau `computed`; Real hanya `["open"]`; approve/skip hanya Practice `proposal.created` `buy_pick`; tidak ada var lama `coin`/`sol`/`mm_ss`.

### Diubah
- `notif.tp_hit.body`: tanda `+` kembali: "Sold {pct_sold} at +{pct} · {pnl}" / "Terjual {pct_sold} di +{pct} · {pnl}". `{pct}` = `formatPct` **tanpa tanda**; `{pnl}` = `pnlSol` (bertanda).
- N-18..N-22 dicek: sudah ada di map + copy (tidak berubah).

## 0.4.2 · 29 Okt 2026 (UX Rev 4.2)
- ARB: 15 key plural `#` → placeholder eksplisit (`builderStepWeakened`, `commonDurationHours/Minutes/Seconds`, `conflictBannerConflicts`, `conflictDiscardConfirm`, `dashboardKpiExpiringSoon`, `errorCodeRateLimited`, `loginOtpWrong`, `notifGroupedTitle`, `positionsOpenCount`, `queueBatchApprove`, `queueBatchSelected`, `queueRealBatchConfirmTitle`, `settingsDeleteGrace`); placeholder plural `int` + `decimalPattern`. JSON tidak berubah.
- **BREAKING (tampilan)**: `format.mjs` `pnlSol()` / `pnlPct()` → `{text, tone, arrow, sign}` (T-15). Nol persis = `0.00` netral tanpa panah/tanda; non-nol tidak pernah tampil 0. `formatSol(…, {kind:'pnl'})` menampilkan PnL 0 sebagai `0.00 SOL` (sebelumnya `0.000 SOL`).

## 0.4.1 · 29 Okt 2026 (UX Rev 4.1)
- **BREAKING**: N-05 = `order.failed` (contracts 1.1.2). `notif.failed.*` memakai `{side}`, `{symbol}`, `{reason_code}`, `{amount_lamports}` (sebelumnya `{coin}`, `{reason}`).
- `order.fail_reason.*` untuk `SLIPPAGE_EXCEEDED`, `INSUFFICIENT_PRACTICE_BALANCE`, `GUARD_FAILED`, `UNSUPPORTED_QUOTE_MINT`, `POOL_STALE` + fallback `unknown`.
- `screener.not_tradeable.badge|detail` (netral, tanpa Approve). Grace hapus akun 7–30 default 7 (read-only dari server). N-14 client-only.

## 0.4.0 · 29 Okt 2026 (UX Rev 4, contracts 1.1.1)
- **BREAKING**: `queue.expired.reason.*` → `expire_reason.<wire>.badge|detail` (7 nilai); `conflict.banner.body` args `{actor,theirs,time,base}` → `{current_rev,base_rev}` + `conflict.banner.changed_by`; `common.timer.left` / `queue.pick.expires_in` `{time}` → `{mm_ss}`; `notif.action.open_pick` → `notif.action.open`; N-07a–d → N-07 + `{reason}`; `login.telegram.reopen|expired` dihapus (Telegram OIDC).
- Baru: `exit_reason.*` (13), `error.code.*` (26), `guard.impact.*`, `settings.devices.*`, `settings.delete.*`, `settings.section.devices|danger`, `conflict.banner.changed_by|fields`, `conflict.guard_change_cancelled`, `common.you`, N-18..N-22, `notifications.map.json`.
- `format.mjs`: `lamportsToSol`, `formatLamports`, `formatSolVar`, `skewFrom`, `remainingMs`.

## 0.3.0 (UX Rev 3)
- 313 key awal (salinan di `apps/web/messages` dan app Flutter).
