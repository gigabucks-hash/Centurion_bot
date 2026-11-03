# @sentra/i18n · v0.4.9 (G1-blue copy, Centurion Trade, contracts 1.1.5, 3 Nov 2026 WIB)

Copy catalog milik UX. **Jangan edit manual**: sumber ada di `ux-solbot/scripts/build_locales.py` (EN = source, ID = locale). Perubahan copy → minta UX, lalu publish ulang ke folder ini.

| File | Isi | Konsumen |
|---|---|---|
| `en.json`, `id.json` | 691 key, nested, ICU MessageFormat (plural/select) | Web (next-intl), Desktop |
| `arb/app_en.arb`, `arb/app_id.arb` | key lowerCamel (`notif.pick_pending.title` → `notifPickPendingTitle`), placeholder bertipe dari AST ICU (`int` untuk plural dan `*_count`, `String` lainnya). **Plural tanpa `#`**: `#` diganti `{count}` (dll.) + metadata `int`/`decimalPattern`. Lolos `flutter gen-l10n` + `dart analyze` 0 issue + `test/flutter/l10n_plural_test.dart` | Flutter |
| `format.mjs` | formatter angka/waktu terikat locale UI | Web, Desktop (Flutter: port 1:1) |
| `notifications.map.json` | N-01..N-22 + RESERVED Real N-23..N-46 (`reserved`, `channels`, `payload`) → wire `type`, kondisi, key title/body, `vars` (wire), `computed` (dihitung di device), aksi push + `token` per mode | push worker, Flutter/Web notif handler |
| `notifications.meta.json` | aturan push (Real open-only, token hanya Practice `buy_pick`, fail closed) + formatter per var + `silent_events` (`proposal.updated`, 0.4.6) | idem |
| `errors.map.json` | 58 kode `errors.json` v6 → key copy (`source: copy` atau `fallback`), kind/http/retryable; opsional `tone`/`title_key`/`cta_key`/`inline_key`/`modes` (0.4.6) | Web, Desktop, Flutter error handler |
| `format.test.mjs` | `npm test`: aturan PnL nol (T-15), presisi SOL, lamports, `fraction_bps`, quote/bps/mcap (0.4.6) | CI |
| `CHANGELOG.md` | riwayat versi, **BREAKING** ditandai | semua |
| `reject_reasons.map.json` | wire `reject_reason` (contracts 1.1.3) → label key; chip skip → `reject_reason` + `reason` (0.4.5) | semua app |
| `key-migrations.json` | key lama app-lokal (`desktop.*`) → key paket (0.4.4); `releases[]` per versi (0.4.6) | Desktop |
| `REPORT.md` | hasil cek ICU, paritas argumen EN/ID, rasio panjang ID/EN | QA |

## Aturan
- **Placeholder = nama field wire (snake_case)**, contoh `{symbol}`, `{amount_lamports}` (teks SOL hasil `formatLamports`), `{mm_ss}` (computed), `{current_rev}`, `{base_rev}`, `{changed_at}`, `{cooldown_until}`, `{auto_revert_at}`, `{scheduled_for}`, `{retry_after_s}`. Push `vars` langsung dipetakan ke placeholder tanpa rename.
- **Angka domain diformat dulu, baru masuk ICU** (argumen string): `formatSol`, `formatLamports("250000000", locale)`, `formatSolVar("0.25", locale, {paper})`, `formatPct`, `formatUsd`, `formatDateTime`. Locale angka = bahasa UI. SOL ≥ 1 → 2 desimal; < 1 → 2–4 (PnL 3–4); < 0,01 → s.d. 6. NBSP sebelum unit, minus U+2212, Practice = "paper SOL".
- Label mode tidak diterjemahkan: `{mode, select, real {REAL SOL} other {PRACTICE}}`.
- **Countdown**: `skew = skewFrom(server_now)` dari setiap respons REST / envelope stream / heartbeat `clock`; `formatCountdown(remainingMs(expires_at, skew))`. Jangan pernah menghitung TTL lokal.
- **Quote (0.4.6)**: field quote `ApprovalWire` boleh null → `formatLamportsOrDash` / `formatBps` / `formatRawQty(min_out_raw, decimals)`; null = "—" + `common.value.unavailable`. Kesegaran = `quoteState(q, skew, {mode})`; Real dengan `blocksApprove` → hold/Approve nonaktif + `review.quote.refresh`. `proposal.updated` senyap (lihat `notifications.meta.json`).
- **Mcap (0.4.6)**: `formatMcapUsd(mcap_usd)` utama, `formatMcapSol(market_cap_lamports)` sekunder, tooltip `mcap.as_of` + `mcap.usd_indicative`.
- **Brand (0.4.7)**: nama produk dari `app.name` (Centurion Trade); nama paket `@sentra/*` dan nama key tetap; skema deep link `centurion://` (0.4.8).
- **Real notif (0.4.7, reserved)**: hanya stream Real, tidak pernah actionable; lamports → `formatLamports`, waktu ISO → `formatDateTime`, `address_short` = `formatAddressShort(address)` (bukan var wire).
- **Manual sell**: UI persen, wire `fraction_bps` (`pctToFractionBps(50)` → 5000; `formatFractionBps(bps, locale)` untuk teks %).
- **Error**: `errors.map.json` → `codes[code].key` (fallback `error.code.internal`); field error = placeholder.
- Enum wire → key: `expire_reason.<ProposalExpiredReason>.badge|detail`, `exit_reason.<ExitReason>`, `error.code.<code lowercase>`. Nilai tak dikenal → fallback (`error.code.internal`), jangan tampilkan nilai mentah.
- Push data-only dirender **di device** dari `notif.<key>.title|body` (lihat `notifications.map.json`). Real SOL: aksi push hanya `open`; token + approve/skip hanya Practice `buy_pick`. Event/`v` tak dikenal atau `mode` hilang → fail closed (generik "Buka app").

## Changelog
Lihat [`CHANGELOG.md`](CHANGELOG.md) (0.4.0–0.4.9, BREAKING ditandai). 0.4.9: key copy G1-blue (kepadatan tabel, stop/resume, baris quote, exit ditahan, jual manual, izin ulang, dashboard); 2 key `kill_switch.*` deprecated (masih dipakai Desktop).

### Migrasi key Desktop (0.4.4)
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


## Catatan untuk konsumen
`apps/web/messages/*.json` dan `apps/web/lib/i18n/format.mjs` saat ini salinan Rev 3; key yang di-rename di Rev 4: `queue.expired.reason.timed_out` → `expire_reason.timeout.badge`, `queue.expired.reason.price_ran` → `expire_reason.price_moved.badge`, `conflict.banner.body` args `{actor,theirs,time,base}` → `{current_rev,base_rev}` + `conflict.banner.changed_by`, `common.timer.left`/`queue.pick.expires_in` `{time}` → `{mm_ss}`, `notif.action.open_pick` → `notif.action.open`. Tim Web/Flutter yang memutuskan kapan pindah. **0.4.3**: `{coin}`/`{sol}` → `{symbol}`/`{amount_lamports}` di semua key, `mm_ss` tidak lagi di push `vars` (lihat CHANGELOG).
