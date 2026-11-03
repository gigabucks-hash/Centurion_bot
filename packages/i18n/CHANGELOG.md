# Changelog · @centurion/i18n

Sumber: `ux-solbot/scripts/build_locales.py` (UX). Format: [Keep a Changelog](https://keepachangelog.com/), versi 0.x (setiap minor/patch boleh breaking; ditandai **BREAKING**). Waktu WIB.

## 0.4.11 · 3 Nov 2026 · hapus 2 key deprecated (**BREAKING** untuk pembaca key ini; tidak ada pembaca tersisa)
786 key (−2, 0 ditambah, 0 rename, copy lain tidak berubah). Hanya `en.json`, `id.json`, `arb/`, `key-migrations.json`, `REPORT.md` dan test Flutter yang berubah.

### Dihapus
| Key | Pengganti | Deprecated |
|---|---|---|
| `kill_switch.action.open` | `kill_switch.action.engage` (label aksi) / `kill_switch.dialog.title` (judul tombol Real di Desktop) | 0.4.9 (`a615ba3`) |
| `kill_switch.dialog.effect.buys` | `kill_switch.dialog.effect.exits_keep` | 0.4.9 (`a615ba3`) |

Syarat hapus terpenuhi: Desktop StopControl sudah migrasi (`8af282e`). rg seluruh `/workspace/centurion` (3 Nov 2026, 15.10 WIB): tidak ada pemanggil di
apps/web, apps/desktop, apps/mobile (termasuk getter `killSwitchActionOpen` / `killSwitchDialogEffectBuys`). Sisa hanya definisi di salinan ARB
`apps/mobile/lib/l10n/app_{en,id}.arb` + `gen/` (bukan pemanggil); hilang saat Mobile menyalin ARB 0.4.11 dan menjalankan gen-l10n. `apps/desktop/README.md`
baris 124–125 hanya mencatat migrasinya.

### Build
- `key-migrations.json`: rilis 0.4.11 `removed` (dengan `use` pengganti). Cek release log: key `deprecated` di 0.4.9 tidak wajib ada lagi bila dihapus di rilis berikutnya.
- gen-l10n, analyze (0 issue), test Flutter 11/11 (2 ekspektasi key deprecated dihapus), `format.test.mjs` 10/10.

## 0.4.10 · 3 Nov 2026 (G1-blue v2) · contracts 1.1.6 (errors.json v7, RealLockedReason, paper_progress), design-tokens 0.3.4
788 key (+97, 0 dihapus, 0 rename). 62 key copy berubah. Contracts working tree = HEAD (bersih saat build). `errors.map.json` ikut berubah (9 kode errors v7
sekarang punya copy sendiri: 67/67 · copy 56 · fallback 11). `notifications.map.json`, `reject_reasons.map.json`, `format.mjs` sama dengan 0.4.9.

### Keputusan lead
- **'Practice' → 'Paper' di SEMUA copy** (EN+ID), termasuk prefix push: `[REAL SOL]`/`[PRACTICE]` → **`[REAL]`/`[PAPER]`**. Build gagal kalau
  'Practice' atau prefix lama masih ada di copy.
- **Nama key TIDAK berubah di 0.4.10.** `mode.practice.*`, `*.practice_reset`, `notif.mode_practice.*`, dll. tetap; nilai wire `practice` tetap
  (contracts 1.1.6). **Rename key `practice` → `paper` menunggu 0.5.0** (akan tercatat di `key-migrations.json` sebagai `renamed` old→new).
- `MODE_NOT_ALLOWED` = per strategi, wording contracts 1.1.6 (Backend `0a2d1b2`): **"This strategy is not approved for Real mode"** /
  **"Strategi ini belum disetujui untuk mode Real"** (`error.code.mode_not_allowed` dan `order.fail_reason.mode_not_allowed`).
- `StrategyRealGateFields` (contracts 1.1.6): wire `mode` tetap `practice|real`, label UI `practice` = "Paper"; `real_locked_reason` 4/4 punya copy;
  `paper_progress.*_required = null` → `strategy.real_gate.not_set` ("Rule not set yet" / "Aturan belum ditetapkan") + `.days_done`/`.trades_done`
  tanpa pembagi. Jangan pernah mengasumsikan 7 hari.
- Tidak ada copy yang memakai nama kerja lama (cek brand tetap jalan).

### Copy berubah
- 16 key Practice → Paper (label mode `PAPER`, banner, toast, subtitle dashboard, `practice_reset` badge/detail/exit reason, review note, login default,
  setting notif, RESET_COOLDOWN, PRACTICE_CASH_INSUFFICIENT, MODE_NOT_ALLOWED).
- **Judul push verb-first** untuk N-01…N-46 (mis. "Review {symbol}: awaiting approval" / "Tinjau {symbol}: menunggu approval", "Check {symbol}: take
  profit hit", "[REAL] Resume buying when ready: new buys stopped", "{failed_count, plural, =0 {View sell all: done} other {Retry sell all: # failed}}").
  Variabel dan select/plural tidak berubah.
- `notif.mode_real.body` / `notif.mode_practice.body`: per strategi.

### Ditambahkan (97)
| Grup | Key |
|---|---|
| Strategi + mode | `strategy.list.{title,filter.all,filter.real,filter.paper,summary,col.strategy,col.mode,col.status,pnl_7d}`, `strategy.{new,save,edit_params}`, `strategy.editor.{eyebrow,rev_note,section.entry,section.exit,section.approval}`, `strategy.mode.{label,paper,real,paper_desc,scope_note}`, `strategy.approval.hold_note` |
| Real terkunci (contracts 1.1.6) | `strategy.real_locked.{chip,chip_short,badge,explain,list_note,a11y}`, `strategy.real_locked_reason.{needs_owner_approval,gate_not_met,policy,other}` (build cek 4/4 vs `RealLockedReason`) |
| Gate Paper→Real (**placeholder**) | `strategy.real_gate.progress_days` "{days_done}/{days_required} hari", `.progress_trades`, `.days_done` / `.trades_done` (dipakai saat `*_required = null`), `.not_set` "Aturan belum ditetapkan". **Tanpa angka hardcoded**: aturan gate menunggu keputusan Boss |
| Dashboard | `dashboard.balance.{real_label,today}`, `dashboard.stat.{realized_today,open_positions,win_rate_7d,paper_strategies,daily_limit_real}`, `dashboard.needs_action.{title,count}` |
| Quote card | `review.buy_title`, `review.quote.{you_pay,you_receive_est,rate,details,expires_countdown,stale_action}` |
| Receipt | `receipt.{title.buy,title.sell,paid,received,fees,exit_plan_armed,view_tx,done}` |
| PnL block + statistik | `positions.pnl.unrealized`, `positions.stats.{title,value_cost,qty,entry_price,mcap,volume_24h,age}` |
| TP/SL ticket | `positions.tpsl.{title,take_profit,stop_loss,sell_pct,was,note,reset,save}` |
| Risk chip | `risk.chip.{guard,daily_limit,usage,a11y}` |
| Alert verb-first in-app | `alert.{guard_rejected,tp_hit,approve_before}`, `kill_switch.status.resume_when_ready`, `wallet.authorize.regrant_title`, `kill_switch.sell_all.retry_title` |
| errors v7 (contracts 1.1.6) | `error.code.{logo_not_found,logo_rejected,loosen_requires_app,resume_requires_app,buys_paused,agent_budget_exceeded,agent_trade_disabled,siws_session_required,agent_request_expired}` |

Tema terang/gelap/sistem memakai key yang sudah ada `settings.appearance.theme.{label,dark,light,system}` (tidak dibuat `theme.*`).
`review.quote.expires_in` (plural detik) tidak berubah; hitung mundur mm:ss = key baru `review.quote.expires_countdown`.

### Build
- Arg ICU dibaca depth-aware (isi cabang select seperti `{sell}` bukan argumen).
- Build gagal jika key didefinisikan dua kali, jika 'Practice'/prefix lama ada di copy, atau jika `RealLockedReason` tidak punya copy.
- Test Flutter (`test/flutter/l10n_plural_test.dart`): ekspektasi prefix/Paper diperbarui + grup 0.4.10. gen-l10n, analyze (0 issue), 11/11 test lulus;
  `format.test.mjs` 10/10.

## 0.4.9 · 3 Nov 2026 (G1-blue) · contracts HEAD (errors.json v6, events 1.1.5), design-tokens 0.3.1
691 key (+13 −7 dibanding 0.4.8 yang dipublish: 12 key G1 + `kill_switch.action.resume`). Build: `CONTRACTS_ERRORS`/`CONTRACTS_EVENTS_TS` = versi **commit HEAD** contracts (working tree contracts
punya perubahan Backend yang belum di-commit, tidak dipakai). `errors.map.json`, `notifications.map.json`, `reject_reasons.map.json`, `format.mjs` sama dengan 0.4.8.

### Ditambahkan: copy G1-blue (HANDOFF_G1_BLUE §6)
| Key | EN | ID |
|---|---|---|
| `positions.density.label` | Table density | Kepadatan tabel |
| `kill_switch.dialog.effect.exits_keep` | Exit plans, TP and SL keep running. | Exit plan, TP & SL tetap jalan. |
| `kill_switch.status.resume_hint` | Bot authority stays active. No cooldown: resume any time with one click. | Izin bot tetap aktif. Tanpa cooldown: lanjutkan kapan saja dengan 1 klik. |
| `review.quote.age_valid` | Quote {age_seconds} s old · valid {valid_seconds} s | Umur quote {age_seconds} dtk · berlaku {valid_seconds} dtk |
| `queue.real.within_limits` | Within limits: just hold, no Phantom. | Dalam batas: cukup tahan, tanpa Phantom. |
| `positions.exit_held.badge` | Exits on hold | Exit ditahan |
| `positions.exit_held.detail` | Exit plans, TP and SL are on hold until you grant trading authority again. | Exit plan, TP & SL ditahan sampai kamu memberi izin trading lagi. |
| `positions.sell.manual` | Sell manually | Jual manual |
| `positions.sell.manual_note` | Manual selling still works, signed in Phantom. | Jual manual tetap bisa, ditandatangani di Phantom. |
| `wallet.authorize.regrant_note` | Needs Phantom + passkey. Once authority is active, exit plans resume automatically. | Butuh Phantom + passkey. Setelah izin aktif, exit plan lanjut otomatis. |
| `dashboard.eyebrow` | Command deck | Command deck |
| `dashboard.headline` | All your positions at a glance. | Semua posisimu, sekilas. |

### Dipakai ulang (tidak dibuat key baru)
Toggle Nyaman/Ringkas → `settings.appearance.density.{comfortable,compact}` · Hentikan pembelian → `kill_switch.action.engage` · Hentikan pembelian? →
`kill_switch.dialog.title` · Lanjutkan pembelian → `kill_switch.action.resume` · banner → `kill_switch.status.title` / `.exits` · baris quote → `review.network_fee`,
`review.ata_rent`, `review.total_max`, `review.quote.refresh` · CTA izin ulang → `wallet.authorize.regrant`.

### Copy berubah
- `settings.appearance.density.comfortable` / `.compact` ID: "Comfortable"/"Compact" → **"Nyaman"/"Ringkas"** (sebelumnya belum diterjemahkan).
- **Perubahan Rev 5.2 yang terlewat di publish 0.4.8** (5d778c8 dibuat dari source yang lebih lama; `key-migrations.json` 0.4.8 sudah mencatatnya, sekarang dipindah ke 0.4.9):
  `kill_switch.action.engage` "Stop buying"/"Hentikan pembelian"; `kill_switch.dialog.title` hanya buy baru; `kill_switch.status.exits` jadi teks polos
  (**placeholder `{state}` dihapus**; Flutter: `killSwitchStatusExits` jadi getter, tidak ada pemanggil di apps/mobile); `notif.real.kill_switch.cleared.body`;
  `notif.real.signer.revoked.body` (cabang `kill_switch` dihapus → `other`); `wallet.owner.title` "Main wallet"/"Wallet utama"; `kill_switch.action.resume` (baru).

### Dihapus (**BREAKING ringan**, tidak ada pemakai di kode apps/*; rg 3 Nov 2026)
`kill_switch.option.exits_freeze`, `kill_switch.option.revoke`, `kill_switch.reenable.action`, `kill_switch.reenable.resume_note`, `kill_switch.revoke_pending`,
`wallet.owner.add_backup`, `wallet.owner.backup` (Rev 5.1; keputusan Boss: Stop = buy saja, tanpa wallet cadangan). Hanya ada di salinan ARB `apps/mobile/lib/l10n`.

### Deprecated (tetap ada sampai Desktop migrasi)
`kill_switch.action.open` → pakai `kill_switch.action.engage`; `kill_switch.dialog.effect.buys` → pakai `kill_switch.dialog.effect.exits_keep`.
Keduanya masih dibaca `apps/desktop/src/components/StopControl.tsx`, jadi tidak dihapus di rilis ini.
**Catatan penghapusan:** kedua key ini **dihapus di rilis i18n pertama setelah** `StopControl.tsx` Desktop pindah ke `kill_switch.action.engage` dan
`kill_switch.dialog.effect.exits_keep` (bukan versi tertentu). Metadata: `key-migrations.json` → `releases[0.4.9].deprecated[]` (`use`, `remove_when`) dan
description ARB berawalan `DEPRECATED 0.4.9`. Hanya metadata/docs yang berubah di 0.4.9, copy tetap sama.
`kill_switch.status.exits` (teks polos sejak 0.4.9): tidak ada pemanggil runtime di apps/web, apps/desktop, atau kode Dart apps/mobile (rg 3 Nov 2026). Hanya salinan ARB +
gen l10n `apps/mobile/lib/l10n` yang masih punya versi `{state}` lama, dan tidak ada yang memanggilnya. Re-sync ARB aman.

### Validasi
ICU parse + paritas argumen EN/ID 691/691 (bad 0) · ARB tanpa `#` (26 plural ditulis ulang ke `{var}`) · `flutter gen-l10n` + `dart analyze` 0 issue ·
`test/flutter/l10n_plural_test.dart` 10/10 (grup baru "0.4.9: G1-blue copy keys"; ekspektasi warna diperbarui ke design-tokens 0.3.0/0.3.1) · `node --test format.test.mjs` 10/10.

## 0.4.8 · 29 Okt 2026 (UX Rev 4.8) · diverifikasi ke contracts 1.1.5 (working tree Backend, belum di-commit)
685 key (+13). Tidak ada key dihapus/di-rename. **Placeholder berubah (reserved Phase 7, belum ada konsumen):**
`notif.real.sell_all.requested.body` `{count}` → `{requested_count}`; `notif.real.sell_all.completed.total` `{amount_lamports}` → `{amount_out_lamports}`.

### Diverifikasi ke contracts 1.1.5
- `CONTRACTS_VERSION` 1.1.5 ada di working tree `packages/contracts` (`src/wire/events.ts`, belum di-commit Backend). Build sekarang mengecek:
  19/19 event `ReservedPhase7Payloads` = N-id kita; setiap var copy dan field `payload` ada di interface (termasuk `Phase7Actor`/`Phase7Device`);
  enum `KillSwitchReason`, `WithdrawFailReason`, `RealLimitSetting`, `McapSource`, `KillSwitchScope` = key. Quote fields 12/12 (tidak ada lagi
  yang *pending*), `expire_reason` 8/8 (`kill_switch` sudah di contracts).
- **Mismatch diperbaiki:** `real.deposit.detected` tidak punya `cap_lamports` → N-39 body jadi "+{amount_lamports} · saldo {balance_lamports}".
- 1.1.5 baru: `ProposalKind` `sell_position` → `queue.pick.kind.sell_position`; sell quote (`expected_out_lamports`, `min_out_lamports`;
  `total_max_lamports` = network fee) → `close.preview.*`; 409 `QUOTE_MISSING_OR_STALE` `reason: missing|stale|mismatch`, `quote_id`,
  `expected_quote_id` → `errors.map.json` `details` + `reason_values`.

### Ditambahkan / diubah (payload final Backend)
- `kill_switch.reason.provider_error` + cabang N-29 "Dihentikan otomatis: masalah provider/signer · hanya exit yang berjalan." (default: exit saja).
- N-45 `{requested_count}`; N-46 `{sold_count} dari {requested_count}` + kegagalan "tetap terbuka, exit plan tetap jalan"; baris total
  `{amount_out_lamports}` (hanya bila tidak null); `kill_switch.sell_all.failure_row` per `failures[]`.
- Sell all ~1/60 dtk: `kill_switch.sell_all.in_progress` (`{requested_count}`), `kill_switch.sell_all.rate_limited` (`{retry_after_s}` = wire, "Coba lagi dalam # detik").
- N-31 `kill_switch.cleared`: select `{signer_state}` (`revoked` → CTA `wallet.authorize.regrant` "Berikan izin trading lagi").
- N-44 `buys.resumed` langsung ("jalan lagi sekarang"). Field datar `actor_type/user_id/device_id/device_label` dikonfirmasi.
- `wallet.limits.setting.*` dikonfirmasi; `daily_lamports` "Maks. per 24 jam bergulir".
- `wallet.withdraw.fail_reason.{withdraw_simulation_failed,insufficient_balance,destination_not_owned,tx_expired,provider_error,user_rejected,other}`;
  `unknown` tetap fallback (sekarang huruf kecil, dipakai di tengah kalimat).
- `auth.siws.statement`: ID = EN verbatim "Sign in to Centurion Trade" (statement yang ditandatangani, `statement_version` server naik).
- Skema deep link sekarang `centurion://` (keputusan lead); catatan "skema `centurion://` tetap" di 0.4.7 **tidak berlaku lagi**. `@centurion/*` tetap.
- `format.mjs`: `quoteState(..., {kind: buy|sell|close_preview})`, `REQUIRED_SELL_QUOTE_FIELDS`, `REQUIRED_CLOSE_PREVIEW_FIELDS`,
  `totalMaxCheck(..., {side})`, `withdrawFailReasonKey`, `killSwitchReasonSelect` (null → other). Tes 10/10.
- ARB: placeholder `*_count` polos sekarang bertipe `int` (`requested_count`).

## 0.4.7 · 29 Okt 2026 (UX Rev 4.7) · aligned to Backend's 1.1.5 spec, pre-merge
672 key (+134). Tidak ada key dihapus/di-rename → **tidak ada breaking change**. contracts 1.1.5 **belum** masuk repo
(`CONTRACTS_VERSION` masih 1.1.4): field 1.1.5 (`quote_id`, `est_ata_rent_lamports`, `expire_reason=kill_switch`, `mcap_source`,
`decimals`/`token_program` di proposal, close preview, event `real.*`) diambil dari jawaban Backend; build mencatatnya sebagai *pending 1.1.5*.

### Brand
- Nama produk = **Centurion Trade** (Boss). Satu konstanta `APP_NAME` di `build_locales.py` (ICU tidak bisa mereferensikan key lain, jadi
  disubstitusi saat build). Key baru `app.name`, `app.title`, `app.splash.loading`, `app.about.{title,version}`, `auth.siws.statement`
  ("Masuk ke Centurion Trade", copy tampilan; statement SIWS yang ditandatangani ditentukan server).
- Copy berubah: `screener.not_tradeable.detail`, `login.telegram.consent`. Build gagal bila nama kerja lama muncul di copy EN/ID.
- **Tidak** diubah: nama paket `@centurion/*`, nama key, skema `centurion://`, logo, tokens.

### Ditambahkan (contracts 1.1.5, jawaban Backend 1–8)
- Quote: `review.quote.{id,auto_refreshing,loading}`, `review.ata_rent` (disembunyikan bila "0"), `review.network_fee_breakdown`
  (`{base}`, `{priority}`; priority hanya rincian, tidak dijumlah dua kali), `review.swap_fee_from_input`, `review.total_max_hint`.
- `token.program.token_2022`; `coin.mcap_source.{curve,pool,unavailable}`; catatan "indikatif" hanya untuk curve/pool (`mcapView`).
- Sell preview `close.preview.{you_sell,expected_out,min_received,swap_fee_from_output,valid,refreshing,expired,refresh,unavailable}`.
- `expire_reason.kill_switch.{badge,detail}`.
- `errors.map.json`: `QUOTE_MISSING_OR_STALE` + `details` `{missing, quote_ts, quote_expires_at, current}` + `on_current` (render `current`
  sebagai Updated); `GUARD_WEAKEN_REQUIRES_APPROVAL` `client_visible: false` (RPC saja; klien pakai REST 202).
- `format.mjs`: `REQUIRED_QUOTE_FIELDS`, `quoteState` (+`complete`; Real diblokir sampai fresh **dan** lengkap), `quoteChanged` (quote_id,
  bukan rev), `networkFeeParts`, `showAtaRent`, `totalMaxCheck`, `isToken2022`, `formatIdShort`, `formatAddressShort`, `formatCountdownHms`,
  `formatLimitValue`, `mcapView`. Tes 9/9.

### Ditambahkan (Real money, Phase 7 RESERVED)
- `notif.real.*`: 39 key = 19 event × title/body (N-23..N-29, N-31..N-34, N-39..N-46) + `notif.real.sell_all.completed.total`
  (baris ekstra bila `amount_lamports` tidak null). `notifications.map.json`: `reserved: true`, `channels`, `payload` (field wire di luar copy), `extra_lines`.
  Event final Backend: henti manual = `real.buys.paused`/`resumed` (N-43/44), auto trip = `real.kill_switch.tripped`/`cleared`
  (`reason` select `policy_mismatch|loss_velocity|other`), `real.sell_all.requested`/`completed` (N-45/46, plural, varian gagal sebagian).
  **Dibuang** (nomor tidak dipakai ulang): N-30 `clear_requested`, N-35..37 `owner_wallet.*`, N-38 `limit.reverted` (auto-revert dihapus).
  N-28 `loosen_requested` final: "berlaku mulai {activates_at} sampai kamu ubah".
- `notifications.meta.json` → `reserved_real` (rules, dropped, decisions, enums, flattening actor/device, activity-only `real.order.*`,
  `real.presign.denied`); `computed.address_short`; `var_format` untuk var baru.
- Layar: `stepup.*` (24), `wallet.owner.*` (9), `wallet.limits.setting.*` (5, nama setting = usulan), `wallet.withdraw.fail_reason.unknown`,
  `kill_switch.*` (28: action, dialog, option, sell_all (konfirmasi + hold 2,5 dtk, tanpa Phantom), status, reenable, offline,
  revoke_pending, scope, reason).

### Diubah
- `proposal.updated` (`silent_events`): refresh quote **tidak** menaikkan rev; reset hold Real berdasarkan `quote_id` (`reset_on`).
- Deskripsi: `review.quote.{updated_inline,changed_during_hold,refresh,stale}`, `review.{total_max,priority_fee,swap_fee,min_received_value}`,
  `mcap.usd_indicative`.
- Nama dari REAL_MONEY_FLOWS §9 yang direkonsiliasi: `killswitch.*` → `kill_switch.*`; `positions.sell.preview_valid` → `close.preview.valid`;
  `positions.sell.preview_pending` → `close.preview.unavailable` (lihat `key-migrations.json` `releases[1]`).

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

| Lama (`apps/desktop` local.ts) | Baru (`@centurion/i18n`) | Catatan |
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
