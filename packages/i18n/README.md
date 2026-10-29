# @sentra/i18n · v0.4.1 (UX Rev 4.1, 29 Okt 2026 WIB)

Copy catalog milik UX. **Jangan edit manual**: sumber ada di `ux-solbot/scripts/build_locales.py` (EN = source, ID = locale). Perubahan copy → minta UX, lalu publish ulang ke folder ini.

| File | Isi | Konsumen |
|---|---|---|
| `en.json`, `id.json` | 408 key, nested, ICU MessageFormat (plural/select) | Web (next-intl), Desktop |
| `arb/app_en.arb`, `arb/app_id.arb` | key lowerCamel (`notif.pick_pending.title` → `notifPickPendingTitle`), placeholder bertipe dari AST ICU (`int` untuk plural, `String` lainnya). Lolos `flutter gen-l10n` + `dart analyze` 0 issue | Flutter |
| `format.mjs` | formatter angka/waktu terikat locale UI | Web, Desktop (Flutter: port 1:1) |
| `notifications.map.json` | N-01..N-22 → wire `type`, kondisi, key title/body, `vars`, aksi push per mode | push worker, Flutter/Web notif handler |
| `REPORT.md` | hasil cek ICU, paritas argumen EN/ID, rasio panjang ID/EN | QA |

## Aturan
- **Placeholder = nama field wire (snake_case)**, contoh `{mm_ss}`, `{current_rev}`, `{base_rev}`, `{changed_at}`, `{cooldown_until}`, `{auto_revert_at}`, `{scheduled_for}`, `{retry_after_s}`. Push `vars` langsung dipetakan ke placeholder tanpa rename.
- **Angka domain diformat dulu, baru masuk ICU** (argumen string): `formatSol`, `formatLamports("250000000", locale)`, `formatSolVar("0.25", locale, {paper})`, `formatPct`, `formatUsd`, `formatDateTime`. Locale angka = bahasa UI. SOL ≥ 1 → 2 desimal; < 1 → 2–4 (PnL 3–4); < 0,01 → s.d. 6. NBSP sebelum unit, minus U+2212, Practice = "paper SOL".
- Label mode tidak diterjemahkan: `{mode, select, real {REAL SOL} other {PRACTICE}}`.
- **Countdown**: `skew = skewFrom(server_now)` dari setiap respons REST / envelope stream / heartbeat `clock`; `formatCountdown(remainingMs(expires_at, skew))`. Jangan pernah menghitung TTL lokal.
- Enum wire → key: `expire_reason.<ProposalExpiredReason>.badge|detail`, `exit_reason.<ExitReason>`, `error.code.<code lowercase>`. Nilai tak dikenal → fallback (`error.code.internal`), jangan tampilkan nilai mentah.
- Push data-only dirender **di device** dari `notif.<key>.title|body` (lihat `notifications.map.json`). Real SOL: aksi push hanya `open`; token + approve/skip hanya Practice `buy_pick`. Event/`v` tak dikenal atau `mode` hilang → fail closed (generik "Buka app").

## Changelog
- **0.4.1 (Rev 4.1)**: N-05 = `order.failed` (contracts 1.1.2) — `notif.failed.*` kini `{side}`, `{symbol}`, `{reason_code}`, `{amount_lamports}` (sebelumnya `{coin}`, `{reason}`); `order.fail_reason.*` untuk `SLIPPAGE_EXCEEDED`, `INSUFFICIENT_PRACTICE_BALANCE`, `GUARD_FAILED`, `UNSUPPORTED_QUOTE_MINT`, `POOL_STALE` + fallback `unknown`; `screener.not_tradeable.badge|detail` (netral, tanpa Approve); grace hapus akun 7–30 default 7 (read-only dari server); N-14 client-only.
- **0.4.0 (Rev 4)**: selaras contracts v1.1.1. `expire_reason.*` (7 nilai wire, mengganti `queue.expired.reason.*`), `exit_reason.*` (13), `error.code.*` (26), `guard.impact.*` (Estimasi/replay), `settings.devices.*`, `settings.delete.*`, `settings.section.devices|danger`, `conflict.banner.changed_by|fields`, `conflict.guard_change_cancelled`, `common.you`, Telegram OIDC (`login.telegram.*`; `reopen/expired` dihapus), N-01..N-22 dengan vars wire (`{mm_ss}` menggantikan `{time}`/`{mm:ss}`; N-07a–d → N-07 + `{reason}`; N-18..N-22 baru). `format.mjs`: `lamportsToSol`, `formatLamports`, `formatSolVar`, `skewFrom`, `remainingMs`.
- 0.3.0 (Rev 3): 313 key awal (dipakai `apps/web/messages` sebagai salinan).

## Catatan untuk konsumen
`apps/web/messages/*.json` dan `apps/web/lib/i18n/format.mjs` saat ini salinan Rev 3; key yang di-rename di Rev 4: `queue.expired.reason.timed_out` → `expire_reason.timeout.badge`, `queue.expired.reason.price_ran` → `expire_reason.price_moved.badge`, `conflict.banner.body` args `{actor,theirs,time,base}` → `{current_rev,base_rev}` + `conflict.banner.changed_by`, `common.timer.left`/`queue.pick.expires_in` `{time}` → `{mm_ss}`, `notif.action.open_pick` → `notif.action.open`. Tim Web/Flutter yang memutuskan kapan pindah.
