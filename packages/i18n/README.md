# @sentra/i18n · v0.4.3 (UX Rev 4.3, 29 Okt 2026 WIB)

Copy catalog milik UX. **Jangan edit manual**: sumber ada di `ux-solbot/scripts/build_locales.py` (EN = source, ID = locale). Perubahan copy → minta UX, lalu publish ulang ke folder ini.

| File | Isi | Konsumen |
|---|---|---|
| `en.json`, `id.json` | 464 key, nested, ICU MessageFormat (plural/select) | Web (next-intl), Desktop |
| `arb/app_en.arb`, `arb/app_id.arb` | key lowerCamel (`notif.pick_pending.title` → `notifPickPendingTitle`), placeholder bertipe dari AST ICU (`int` untuk plural, `String` lainnya). **Plural tanpa `#`**: `#` diganti `{count}` (dll.) + metadata `int`/`decimalPattern`. Lolos `flutter gen-l10n` + `dart analyze` 0 issue + `test/flutter/l10n_plural_test.dart` | Flutter |
| `format.mjs` | formatter angka/waktu terikat locale UI | Web, Desktop (Flutter: port 1:1) |
| `notifications.map.json` | N-01..N-22 → wire `type`, kondisi, key title/body, `vars` (wire), `computed` (dihitung di device), aksi push + `token` per mode | push worker, Flutter/Web notif handler |
| `notifications.meta.json` | aturan push (Real open-only, token hanya Practice `buy_pick`, fail closed) + formatter per var | idem |
| `errors.map.json` | 56 kode `errors.json` v4 → key copy (`source: copy` atau `fallback`), kind/http/retryable | Web, Desktop, Flutter error handler |
| `format.test.mjs` | `npm test`: aturan PnL nol (T-15), presisi SOL, lamports, `fraction_bps` | CI |
| `CHANGELOG.md` | riwayat versi, **BREAKING** ditandai | semua |
| `REPORT.md` | hasil cek ICU, paritas argumen EN/ID, rasio panjang ID/EN | QA |

## Aturan
- **Placeholder = nama field wire (snake_case)**, contoh `{symbol}`, `{amount_lamports}` (teks SOL hasil `formatLamports`), `{mm_ss}` (computed), `{current_rev}`, `{base_rev}`, `{changed_at}`, `{cooldown_until}`, `{auto_revert_at}`, `{scheduled_for}`, `{retry_after_s}`. Push `vars` langsung dipetakan ke placeholder tanpa rename.
- **Angka domain diformat dulu, baru masuk ICU** (argumen string): `formatSol`, `formatLamports("250000000", locale)`, `formatSolVar("0.25", locale, {paper})`, `formatPct`, `formatUsd`, `formatDateTime`. Locale angka = bahasa UI. SOL ≥ 1 → 2 desimal; < 1 → 2–4 (PnL 3–4); < 0,01 → s.d. 6. NBSP sebelum unit, minus U+2212, Practice = "paper SOL".
- Label mode tidak diterjemahkan: `{mode, select, real {REAL SOL} other {PRACTICE}}`.
- **Countdown**: `skew = skewFrom(server_now)` dari setiap respons REST / envelope stream / heartbeat `clock`; `formatCountdown(remainingMs(expires_at, skew))`. Jangan pernah menghitung TTL lokal.
- **Manual sell**: UI persen, wire `fraction_bps` (`pctToFractionBps(50)` → 5000; `formatFractionBps(bps, locale)` untuk teks %).
- **Error**: `errors.map.json` → `codes[code].key` (fallback `error.code.internal`); field error = placeholder.
- Enum wire → key: `expire_reason.<ProposalExpiredReason>.badge|detail`, `exit_reason.<ExitReason>`, `error.code.<code lowercase>`. Nilai tak dikenal → fallback (`error.code.internal`), jangan tampilkan nilai mentah.
- Push data-only dirender **di device** dari `notif.<key>.title|body` (lihat `notifications.map.json`). Real SOL: aksi push hanya `open`; token + approve/skip hanya Practice `buy_pick`. Event/`v` tak dikenal atau `mode` hilang → fail closed (generik "Buka app").

## Changelog
Lihat [`CHANGELOG.md`](CHANGELOG.md) (0.4.0–0.4.3, BREAKING ditandai).

## Catatan untuk konsumen
`apps/web/messages/*.json` dan `apps/web/lib/i18n/format.mjs` saat ini salinan Rev 3; key yang di-rename di Rev 4: `queue.expired.reason.timed_out` → `expire_reason.timeout.badge`, `queue.expired.reason.price_ran` → `expire_reason.price_moved.badge`, `conflict.banner.body` args `{actor,theirs,time,base}` → `{current_rev,base_rev}` + `conflict.banner.changed_by`, `common.timer.left`/`queue.pick.expires_in` `{time}` → `{mm_ss}`, `notif.action.open_pick` → `notif.action.open`. Tim Web/Flutter yang memutuskan kapan pindah. **0.4.3**: `{coin}`/`{sol}` → `{symbol}`/`{amount_lamports}` di semua key, `mm_ss` tidak lagi di push `vars` (lihat CHANGELOG).
