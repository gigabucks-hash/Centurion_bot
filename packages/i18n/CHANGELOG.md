# Changelog · @sentra/i18n

Sumber: `ux-solbot/scripts/build_locales.py` (UX). Format: [Keep a Changelog](https://keepachangelog.com/), versi 0.x (setiap minor/patch boleh breaking; ditandai **BREAKING**). Waktu WIB.

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
