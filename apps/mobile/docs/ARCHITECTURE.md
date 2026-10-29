# SolBot Mobile: arsitektur Fase 5 (Flutter Android + iOS)

**Owner:** Flutter Mobile Specialist · **Untuk:** Apex Dev Lead · 29 Okt 2026
**Basis:** blueprint "HOTBOT — Architecture & How It Works" (data model Postgres, roadmap Fase 5), SPEC UX (`/workspace/ux-solbot/docs/SPEC.md` Rev 2, `NOTIFICATIONS.md`, wireframe 11/12), token `@sentra/design-tokens` 0.2.1 (vendored, lihat §3a).
**Prinsip:** perilaku setara, tapi code, UI, dan aset orisinal. Tidak ada code, aset, atau nama HOTBOT di repo ini.
**Nama:** working name produk **Sentra**, placeholder app ID `com.sentra.app`, package `sentra_mobile`. Rename di app dilakukan saat pindah ke monorepo `/workspace/sentra/apps/mobile`. Prototype ini masih `solbot_mobile`.

## 1. Scope Fase 5
- Push notification untuk approval: pick buy (approve/skip) dan perubahan setting/guard.
- PnL (team overview + equity curve), daftar posisi dengan exit progress + manual sell, dan detail posisi dengan ladder exit plan (SPEC §6).
- Katalog notifikasi 17 event ID/EN (`NOTIFICATIONS.md`).
- Activity feed realtime dengan filter actor.
- Pause/resume per strategi.
- Di luar scope: strategy builder (dikerjakan di web), Real SOL onboarding/custody (Fase 7), dan login lengkap (alur sudah ada di SPEC, tapi tergantung keputusan auth backend).

## 2. State management: Riverpod 2 (tanpa codegen)
| Opsi | Alasan |
|---|---|
| **Riverpod 2 ✔** | `StreamProvider` cocok 1:1 dengan Supabase Realtime. Override provider di composition root memudahkan swap mock→Supabase dan test. Tidak butuh `BuildContext`, jadi push handler dan background isolate bisa membaca repo. Notifier kecil dipakai untuk state optimistik. |
| Bloc | Boilerplate event/state lebih banyak, dan swap repo tetap butuh DI tambahan. |
| Provider/ChangeNotifier | Tidak ada auto-dispose, family, atau AsyncValue. |

Aturan yang dipakai:
- Tanpa `build_runner`. Provider ditulis manual.
- Read model berupa `StreamProvider`. Aksi berupa fungsi atau `Notifier` kecil (`StrategyToggleController` untuk optimistic toggle, `busy`/`skipping` set untuk approval).
- UI hanya bergantung pada interface di `data/repositories/`.

## 3. Struktur folder (feature-first)
```
app/lib/
  main.dart                 # entry mock; nanti main_supabase.dart (flavor)
  app/  app.dart router.dart
  core/
    theme/ app_tokens.dart (VENDORED verbatim dari @sentra/design-tokens, jangan diedit)
           solbot_theme.dart (app chrome + pnlColor epsilon, 33 baris)
    widgets/ common.dart (PnlText, ModeBanner, TagChip, RiskBadge, ExpiryCountdown, HoldToConfirmButton) · sparkline.dart
    push/ push_payload.dart (PushMessage: kontrak payload FCM `event=N-xx`, pure Dart, fail closed)
    notifications/
      notification_catalog.dart   # 17 event typed (enum) + copy ID/EN const map + channel/prioritas/aksi + policy
      notification_renderer.dart  # isi variabel, format locale, filter keamanan aksi, grouping >3/60 dtk
      local_notifier.dart         # pipeline push → parse → render → shade (mock flutter_local_notifications) + handler aksi
    approval_guard.dart     # gate biometrik (interface; mock = dialog)
    feature_flags.dart      # realSolEnabled=false (Fase 7), telegramOidcEnabled=false
    format.dart             # id-ID, ▲/▼ + tanda (T-15: 0 persis = 0,00 netral), mm:ss (Lamports/Decimal)
  data/
    money.dart              # Lamports (extension type BigInt) + Decimal helper; tanpa double untuk uang/harga
    models/models.dart      # Strategy, Position (lamports, soldBps, harga Decimal), ActivityEvent, Approval(version), PortfolioSummary
    api/                    # SATU-SATUNYA tempat yang tahu wire kontrak v1.1
      api_errors.g.dart     # GENERATED dari errors.json (tool/gen_errors.dart)
      api_exception.dart    # ApiException(code, rawCode, sqlState, details): fromCode/fromPostgres/fromRestBody
      wire.dart             # enum ↔ wire (rejected↔skipped, buy_pick, practice|real, ask_first_buy, expire reason)
      settings_keys.dart    # tabel rename v1.0→v1.1 (settings, exit preset, checks, venue, exit reason, metric)
      decide_approval.dart  # DecideApprovalRequest/Result (p_* params)
      sentra_rpc.dart       # interface SentraRpc: 6 RPC + portfolio_latest + exit_stats()
      events_feed.dart      # EventEnvelope + EventSequencer (dedupe id, urut seq, watermark safe_seq)
      marks.dart            # Broadcast marks:<ws>:<mode> (mark/clock)
      server_clock.dart     # skew = server_now − now device
      auth.dart             # AuthRepository stub (Supabase Auth; Telegram OIDC + SIWS via Edge Function)
      real_confirmation.dart# proof-of-confirmation Real SOL (stub, Fase 7)
    repositories/repositories.dart  # Portfolio/Activity/Strategy/Approval/PushSource/PracticeReset
    mock/mock_backend.dart  # simulator + exit plan + push v1.1 + events envelope + marks + reset + update_strategy
    mock/mock_rpc.dart      # MockSentraRpc (lewat bentuk wire: toRpcParams → JSON → DTO)
    providers.dart          # composition root + StreamProvider
  features/
    positions/ positions_screen.dart (list + detail ladder) · widgets/ equity_card · exit_progress_bar · sell_sheet
    settings/ settings_screen.dart (Lainnya: Reset Practice, status flag Real) · practice_reset_tile.dart · notifications_screen.dart
    coins/ coins_screen.dart (screener list + detail, WF-20/21: `UNSUPPORTED_QUOTE_MINT` = kartu netral tanpa aksi)
    dashboard · activity · approvals (+guard_review) · strategies · shell
  l10n/ app_en.arb app_id.arb (verbatim dari @sentra/i18n 0.4.3) · gen/ (gen-l10n output)
  core/l10n_format.dart     # mirror format.mjs
test/  flutter_test_config · mock_backend · push_payload · notification_catalog · notification_pipeline · l10n_format · positions
       theme_tokens · widget_flows · contract_v11 · api_errors_gen · settings_keys · pnl_zero · i18n_reference
       fonts_bundled · line_length
assets/google_fonts/  Inter + JetBrains Mono statis (OFL) + *-OFL.txt
tool/  gen_errors.dart · ci_check_errors.sh · contracts/errors.json (salinan verbatim)
.github/workflows/mobile.yml   # pub get → dart format check → ci_check_errors → analyze → test
```

### 3a. Design tokens dan font
- **Vendoring, bukan dependency.** `/workspace/sentra/packages/design-tokens` bukan paket Dart (tidak ada `pubspec.yaml`; output `tokens/app_tokens.dart` di-generate oleh `scripts/build.py`). File itu disalin **verbatim** ke `core/theme/app_tokens.dart` (md5 `454ec83c…`, sama dengan sumber). Update: salin ulang, lalu `flutter analyze && flutter test`. Setelah pindah ke monorepo, langkah ini jadi skrip CI (salin + cek md5) supaya salinan tidak drift.
- API yang dipakai: `context.tradeColors`, `AppText.num()`, `AppSpace.sHalf`, `AppDensity`, `AppMotion.of(context)`/`*Base`, `AppButtons.*`, `AppTheme.dark/light()`. Status temuan token ada di `TOKENS_REVIEW.md`.
- **Font: `google_fonts` ^9** (Inter + JetBrains Mono) lewat `AppText`/`AppTheme`. File statis OFL sudah dibundel di `assets/google_fonts/` (lihat TOKENS_REVIEW T-17) dan dimuat dari aset; di test `allowRuntimeFetching=false` dan `test/fonts_bundled_test.dart` membuktikan pemuatan lokal.
- **Sebelum rilis store: font dibundel sebagai aset lokal** (milestone D8–9, Kam 5 – Jum 6 Nov 2026). Langkahnya: `.ttf` OFL Inter 400/500/600 + JetBrains Mono 500/600 di `assets/google_fonts/`, deklarasi `assets:` di pubspec, `GoogleFonts.config.allowRuntimeFetching = false` di `main()`, file lisensi OFL ditampilkan di `LicenseRegistry`, lalu verifikasi offline (mode pesawat) + golden test. Alasan: tidak ada fetch font saat runtime (privasi, startup offline, review store).

## 4. Routing (go_router)
- `StatefulShellRoute.indexedStack` dengan 5 tab sesuai SPEC: **Home · Strategi · Approvals · Activity · Lainnya**. `ModeBanner` (Practice/Real) yang tidak bisa di-dismiss ada di atas setiap tab.
- Rute: `/`, `/strategies`, `/approvals`, `/approvals/:id` (deep link dari push, item di-highlight), `/approvals/:id/review` (guard change, full-screen dialog di root navigator), `/activity`, `/more`, `/more/notifications`, `/positions`, `/positions/:id`.
- **Positions ada di branch tab Lainnya** (wireframe 12 menandai Lainnya aktif). Path tetap `/positions` (bukan `/more/positions`) supaya deep link push N-04/N-08/N-09 pendek dan stabil. KPI "Open" di Home juga membuka `/positions`.
- Deep link: `sentra://approvals/<id>` dan Universal/App Links `https://app.<domain>/approvals/<id>` dipetakan ke path yang sama.

## 5. Data layer
- Interface: `PortfolioRepository.watchSummary/watchPositions/equityHistory/sellPosition(pct:int) → Lamports`, `ActivityRepository.watchFeed`, `StrategyRepository.watchStrategies/setPaused(expectedRev)`, `ApprovalRepository.watchPending/watchAll/decide(DecideApprovalRequest) → DecideApprovalResult`, `PracticeResetRepository.resetPractice`, `PushSource`, `EventsFeed`, `MarksSource`, `SentraRpc`, `AuthRepository`.
- **Uang:** semua jumlah SOL = `Lamports` (BigInt, wire string integer), harga = `Decimal` (wire string desimal), persen/rasio/bps = `num` (JSON number). `double` hanya untuk koordinat chart (`plotValue`) dan persen tampilan. PnL: tepat 0 lamport → `0,00` netral tanpa panah/tanda; non-nol apa pun → ▲/▼ + tanda (T-15, port `pnlSol`/`pnlPct` @sentra/i18n 0.4.2).
- **Error:** satu tipe `ApiException` (kode dari `api_errors.g.dart`). `ConflictException` lama dihapus; `isConflict` = HTTP 409.
- **Mock** (`MockBackend`): satu objek mengimplementasikan semua interface, jadi state konsisten (approve pick membuat posisi dan event). `tick()` menggerakkan harga dan menjalankan **exit plan sebagai data** per posisi (rung TP jual sebagian dari ukuran awal, trailing armed setelah TP1, stop loss, time stop bila belum ada TP; fee 125 bps), lalu memunculkan pick baru. Mock juga mengirim payload push (N-01/02/04/08/09) lewat `PushSource`, dengan bentuk yang sama seperti FCM `data`. Idempotensi token, expiry, dan konflik `rev` sudah disimulasikan.
- **Swap ke Supabase:** buat `data/supabase/*_repository.dart`, lalu di `main_supabase.dart` panggil `ProviderScope(overrides: [portfolioRepositoryProvider.overrideWithValue(...), ...])`. Folder `features/` tidak berubah.

### Positions (SPEC §6, wireframe 11/12, `flows/positions-sell.mmd`)
- **List:** header "Positions · n open". Kartu equity (1D/7D/30D/All, garis high-water putus-putus, label tanggal). Kartu posisi berisi `$COIN`, strategi · size, PnL SOL (%) ▲/▼, **exit progress bar** (penanda SL merah │ isi sampai harga │ titik rung TP terisi/next/pending), caption (`TP1 ✓ · next TP2 +100%` / `SL −35% · trail armed`), entry → now · hold, dan tombol **Sell**. Di bawahnya ada daftar Closed.
- **Sell sheet:** pilihan 25/50/100% dari sisa posisi, "Perkiraan terima ≈ x paper SOL" (live mengikuti mark), slippage/fee, efek ke exit plan ("Sisa posisi tetap memakai exit plan"; 100% = exit plan dibatalkan). **Selalu hold-to-confirm (aturan team lead):** Practice 1,2 dtk (`holdPracticeBase`, label "Tahan untuk jual 50% (Practice)"), Real SOL 2,5 dtk (`holdRealBase`) + biometrik (`ApprovalGuard`), plus Batal. SPEC §6/wireframe 12 hanya meminta konfirmasi biasa untuk Practice, jadi ini deviasi yang disengaja.
- **Detail:** ladder vertikal diurutkan menurut level (TP terisi/next/pending, sekarang, trailing armed/off, entry, SL), plus kartu "Berikutnya: TP2 di +100% (jual 33%)" dan time stop.
- **Approvals mobile, Real SOL: swipe approve/skip dinonaktifkan total** (tidak ada `Dismissible` di item Real; juga tidak untuk guard change). Guard hold: Practice 1,2 dtk, Real 2,5 dtk + typed name. Keduanya diuji.
- **Sell tidak pernah dari notifikasi:** enum `NotifAction` tidak punya `sell`, dan ini diuji.
- Repo: `equityHistory(range)`, `closePosition(ClosePositionRequest)` (kontrak 1.1.2 `close_position`, lihat di bawah).

### Kontrak 1.1.2 (packages/contracts 1.1.2, monorepo 01427df, ERROR_CODES_VERSION 4)
Menimpa bagian v1.1 di bawah bila bertentangan. Sumber: `FLUTTER_INTEGRATION_ANSWERS.md` dan `CHANGELOG.md` 1.1.2.
- **errors.json v4** (56 kode, `tool/contracts/errors.json` verbatim): `kind error|notice|skip`, `sqlstate` = `P0`+HTTP (tidak unik per kode → kode diambil dari MESSAGE), `messages.en/id`. Generator memvalidasi `sqlstate == P0<http>` dan menulis `kind`, `messageEn/messageId`, `sqlState`, `httpFromSqlState()`; output di-`dart format` di dalam paket (`.dart_tool/gen_errors/`) sehingga identik dengan langkah CI format. Body error REST: `{error:{code, message, ...details, server_now}}` → `ApiException.details` (detail tersebar di `error`, `details` bersarang tetap digabung). UI memakai `localizedMessage('id')`.
- **Penamaan rev seragam:** `rev` / `p_expected_rev` / `If-Match`. `Approval.version` → `Approval.rev`; `DecideApprovalResult.rev`.
- **`decide_approval(p_approval_id, p_token, p_decision, p_expected_rev, p_idempotency_key?)`**: tanpa `p_client`; `p_expected_rev` wajib (rev approval di app, `version` dari push). Klien/via diambil server dari JWT (`sentra_client`).
- **`update_strategy`**: tanpa `p_actor`/`p_via`; `p_device` opsional (dikirim hanya bila ada). **`reset_practice(p_workspace)`** via `ResetPracticeRequest(workspaceId)`; event `practice.reset {epoch, previous_epoch, starting_balance_lamports, archived, next_allowed_at, at}`.
- **`close_position(p_position_id, p_expected_rev, p_idempotency_key, p_fraction_bps=10000)`** menggantikan `sellPosition(pct)`: sheet jual mengirim `fraction_bps = pct×100` dari sisa posisi, `p_expected_rev` = `Position.rev`, key `close:<id>:r<rev>:<bps>` (tap ganda = replay; jual sukses menaikkan rev → key baru). Error: `INVALID_FRACTION`, `POSITION_ALREADY_CLOSED` (stand-in `VALIDATION_FAILED` dihapus), `VERSION_CONFLICT` (+`current`), `IDEMPOTENCY_KEY_REUSED`, `MODE_NOT_ALLOWED` (Practice only). Event: `order.submitted → fill.simulated → position.updated|position.closed(exit_reason manual) → order.filled`. Respons `queued` (tanpa `fill`) → snackbar "Order jual … dikirim".
- **Idempotency:** key sama + body sama → replay `replayed: true`; key sama + body beda → `422 IDEMPOTENCY_KEY_REUSED` (mock menyimpan `key → (body, hasil)` untuk decide dan close).
- **int64 sebagai string:** `seq`, `as_of_seq`, `safe_seq`, `job_id` dll. Disimpan sebagai `BigInt` (`EventEnvelope.seq`, `EventSequencer.watermark`, `PushMessage.seq`, notifier `_approvalSeq`) dan diurutkan numerik ("10" > "9"), tidak pernah lewat double.
- **FCM data semua string:** `v`/`seq`/`version` string integer, `actions`/`vars` string JSON. `version` = rev approval → `p_expected_rev`; tanpa `version` tombol Approve/Skip tidak ditampilkan. `vars.amount_lamports` menggantikan `vars.sol` (diisi ke `{sol}` ARB lewat formatter Lamports), `symbol` mengisi `{coin}`, `mm_ss` tidak dikirim (dihitung dari `exp` + skew).
- **`exit_stats(p_workspace, p_strategy?, p_mode?, p_from?, p_to?)`** → baris `{exit_reason, count, pnl_lamports, avg_pnl_pct, win_rate_pct, avg_hold_s}` (kunci `exit_reason`, bukan `reason`).
- **Settings:** `stop_loss_pct` (hard stop dari **entry**, 0 atau 5–49; alias v1.0 `stopLossPct`) terpisah dari `peak_trail_pct` (trailing dari **puncak**, tanpa alias v1.0). Koreksi tabel 1.1.0 yang salah memetakan `stopLossPct → peak_trail_pct`.
- **Coin facts:** posisi dan koin screener membawa `decimals` (dari akun mint, tidak pernah diasumsikan 6) dan `token_program`; `fmtTokenQty(qty_raw, decimals)` dipakai di detail posisi (`—` bila decimals tidak diketahui).
- **`practice_epoch`** ada di workspace/portfolio/snapshot/position/fill. `PracticeEpochGate` (provider `practiceEpochGateProvider`): `accept(event)` naik pada `practice.reset` dan membuang event ber-`practice_epoch` lama; `observe(epoch)` dipanggil dari hasil reset (dan nanti dari baca workspace/portfolio); `filter()` dipakai `positionsProvider` untuk membuang posisi Practice epoch lama. Real tidak punya epoch. Consumer feed `public.events` di prod (D7–8) wajib melewatkan event ke `accept()` sebelum refetch.

### Kontrak v1.1 (packages/contracts 1.1.0, ERROR_CODES_VERSION 2)
- **RPC (mutasi hanya lewat ini; UPDATE tabel langsung dicabut):**
  - `decide_approval(p_approval_id, p_token, p_decision approve|reject, p_expected_rev, p_client, p_idempotency_key)` → `{proposal_id, status, version, replayed, server_now}`. **Tanpa `device_id`** (token sudah terikat device). `p_expected_rev` = `version` approval. Idempotency key deterministik `<id>:v<version>:<decision>` (tap ganda = replay). Dari push: `p_client='push'`, key `push:<id>:<token>:<decision>`.
  - `set_strategy_status(p_strategy, p_status, p_expected_rev)` (dipakai toggle pause/resume) dan `update_strategy(p_strategy, p_expected_rev, p_patch, p_name, p_status, p_actor, p_via, p_device, p_challenge_id)`. Key `p_patch` wajib dari `SettingsKeys.*.current` (snake_case); mock menolak key v1.0 dengan `SETTINGS_SCHEMA_INVALID`. Konflik: SQLSTATE `P0409`, `details` berisi body 409 (`current_rev, base_rev, changed_fields, changed_by, changed_at, current`).
  - `reset_practice(p_workspace)` / `POST /workspaces/{ws}/practice/reset`: 30 SOL (`"30000000000"`), arsip per epoch, pending buy → expired `practice_reset`, maks 1×/24 jam → `429 RESET_COOLDOWN` + `details.next_allowed_at`. UI: Lainnya → "Reset Practice".
  - `register_device(p_device_id, p_platform, p_provider, p_token, p_app_version, p_locale)` / `revoke_device(p_device_id)` (menggantikan tulis `device_tokens.fcm_token`). `device_id` = install id 8–128 `[A-Za-z0-9_-]` di Keychain/Keystore. Dipanggil saat login, setiap app start, dan pada token refresh SDK; revoke saat logout.
- **Baca:** `portfolio_latest` (pengganti `v_portfolio_summary`), `exit_stats()` (pengganti `v_strategy_stats`, grup per `ExitReason`), equity dari `portfolio_snapshots` epoch aktif atau `GET /portfolio/equity`.
- **Satu feed realtime:** subscribe INSERT `public.events` (filter `workspace_id`), **bukan** `postgres_changes` di positions/approvals/strategies. Setiap event dipetakan ke topik (`proposal.*` → approvals, `position.*`/`fill.*`/`portfolio.*` → portfolio, `strategy.*`/`guard.*` → strategies, `practice.reset` → semua) dan repository me-refetch baris terkait (select by id / `portfolio_latest`). `EventSequencer`: dedupe by `id`, urut by `seq` (bukan `ts`), watermark resume hanya dari REST `next_after_seq`, SSE `id`, atau `clock.safe_seq`; saat reconnect/heartbeat jalankan catch-up `GET /v1/events?after_seq=watermark`.
- **Mark price:** Broadcast privat `marks:<ws>:<mode>` (`mark` dengan `price_usd` string desimal, `clock` tiap 15 dtk). PnL live dihitung lokal; angka otoritatif dari `portfolio_latest`.
- **Jam:** setiap payload membawa `server_now` → `ServerClock` (skew). `ExpiryCountdown` dan renderer notifikasi memakai `expires_at − (now + skew)`.
- **Settings dan exit preset:** semua nama di `data/api/settings_keys.dart`, diisi dari tabel rename CHANGELOG 1.1.0 (60 settings, 13 exit preset, 7 required checks, 2 venue, 9 exit reason, 18 metric, 4 ruleset). `v10` hanya dibaca untuk normalisasi. Test `settings_keys_test.dart` gagal bila ada nama itu di-hardcode di `lib/` di luar file tersebut. `TODO(v1.1)`: hapus alias v1.0 setelah dikonfirmasi Backend dan cek ulang dengan `strategy_settings.schema.json`.
- **Real SOL:** `FeatureFlags.realSolEnabled=false` sampai Fase 7. UI: approve Real dan resume strategi Real disabled, hold guard/sell Real disabled + teks "Real SOL nonaktif sampai Fase 7"; mock server juga menolak dengan `REAL_SOL_DISABLED`. Alur Fase 7 (stub `real_confirmation.dart`): challenge → passkey/WebAuthn + TOTP + typed name + hold ≥ 2 500 ms → `CONFIRMATION_RESTART_REQUIRED` mengulang semuanya. Test Real flow meng-override flag ke true.

### Rencana integrasi Supabase
- **Auth:** `supabase_flutter` + Supabase Auth untuk Google, Apple (wajib di iOS) dan Email OTP (`/auth/email/otp/request|verify`). SIWS: `/auth/siws/nonce` → tanda tangan wallet (Phantom/Solflare/MWA) → `/auth/siws/verify`; Edge Function mencetak JWT session. Wallet login ≠ wallet trading (`WALLET_ROLE_CONFLICT`). **Telegram (v1.1): OIDC resmi** `POST /auth/telegram/nonce {device_id, platform}` → login SDK → `POST /auth/telegram/verify {nonce, id_token, device_id}` (error `AUTH_TG_INVALID|REPLAY|NO_PROFILE`, minta scope `profile`). Hanya stub di balik `FeatureFlags.telegramOidcEnabled=false` (server `AUTH_TELEGRAM_OIDC_ENABLED=false`): tombol tidak tampil, method melempar `TelegramLoginDisabled`. **Tidak ada SDK Telegram yang dipasang** sampai Boss menyetujui. Jangan konfigurasi custom OIDC provider Supabase. Unlink/hapus akun butuh re-auth ≤ 5 mnt (`REAUTH_REQUIRED`); metode login terakhir tidak bisa di-unlink (`422 LAST_LOGIN_METHOD`). Token sesi di Keychain/Keystore (`flutter_secure_storage`).
- **Baca:** `strategies`, `positions`, `approvals` (select by id saat event datang), `portfolio_latest`, `exit_stats()`, `portfolio_snapshots`/`GET /portfolio/equity`, `GET /v1/events` untuk catch-up.
- **Realtime:** lihat "Kontrak v1.1": satu feed `public.events` + Broadcast marks. Tidak ada `postgres_changes` pada tabel domain.
- **Mutasi:** hanya 6 RPC di atas (+ REST twin). Guard change Real SOL lewat `update_strategy` + `p_challenge_id` dari proof-of-confirmation (Fase 7): cooldown 10 mnt, auto-revert 24 jam, notifikasi semua device + email.
- **RLS:** semua tabel `workspace_id in (select id from workspaces where owner = auth.uid())`. Role `anon` tidak punya akses. Tabel `approvals`/`jobs` read-only untuk client, dan perubahan hanya lewat RPC. Kolom `token_hash` tidak di-expose (view tanpa kolom itu).

## 6. Push notification dan katalog notifikasi
- **FCM** untuk Android dan iOS (iOS via APNs key di Firebase). Paket: `firebase_messaging` + `flutter_local_notifications`, yang menyediakan action button (Android `actions`, iOS `UNNotificationCategory`).
- **Payload data-only, tanpa copy** (PushPayload v1, EVENTS_SCHEMA §6, diadopsi Backend di v1.1): `v=1, event=N-xx, mode, approval_id?, position_id?, token?, exp? (ISO), expire_reason?` + `type, workspace_id, seq, deep_link (sentra://…), actions, vars{…}, server_now`. Parser menerima bentuk JSON kanonik **dan** bentuk FCM `data` (semua string; `actions`/`vars` JSON-encoded; `v`/`seq` string) serta bentuk flat lama. `seq` dipakai untuk **dedupe** (`workspace:seq`), **urutan shade** (by seq, bukan waktu tiba), dan **staleness** per approval (event lebih lama untuk approval yang sama dibuang; N-03/N-06/N-07 menghapus notifikasi pick-nya). `actions` dari server hanya bisa **dipersempit** client. Real: token diabaikan walau ada, `actions=["open"]`. `vars.mm_ss` diabaikan; countdown selalu dihitung client dari `exp` dan skew `server_now`. `expire_reason` memakai nilai wire (`timeout guard_failed price_moved strategy_deleted strategy_archived practice_reset account_deleted`); `practice_reset`/`account_deleted` belum punya copy UX → copy generik N-07a. Copy di-render **di client** dari katalog sesuai bahasa user. Payload yang versi/event-nya tidak dikenal, pick tanpa `approval_id`, atau event wajib-mode tanpa `mode` akan ditolak (**fail closed**). Event Real-only (N-11, N-13) ditolak bila mode-nya Practice. `coin` tetap untrusted: hanya teks.
- **Katalog typed** (`core/notifications/notification_catalog.dart`): `enum NotifEvent` N-01…N-17 (N-07 punya 5 varian alasan a–e, termasuk `strategy_archived` dari ARB/kontrak; N-05/N-12/N-14 punya varian mode/arah). Setiap event membawa kanal, prioritas, dan aksi Practice/Real persis seperti tabel spec. Prefix mode berasal dari ICU `select` di ARB. Angka mengikuti locale, unit `paper SOL`/`SOL`, PnL diberi ▲/▼ (ARB tidak memuat glyph), `{time}` = countdown `expires_at − (now + skew server)`. Variabel yang hilang tampil sebagai `–`, tidak pernah sebagai `{x}` mentah.
- **Lokalisasi: ARB UX + `flutter_localizations`/gen-l10n.** `lib/l10n/app_{en,id}.arb` disalin **verbatim** dari `@sentra/i18n` 0.4.3 (`sentra/packages/i18n/arb`, 464 key, md5 sama; jangan diedit di sini). **0.4.3: placeholder = nama var wire** (`{symbol}`, `{amount_lamports}`, …), jadi push `vars` masuk langsung tanpa mapping; gen-l10n mengurutkan parameter posisional secara alfabetis (mis. `notifPickPendingTitle(mode, symbol)`), maka setiap panggilan di `notification_catalog.dart` ditulis ulang. `mm_ss` = `computed` (dari `exp` − (now + skew)), bukan var push. `{pct}` N-08 tanpa tanda (copy sudah memuat `+`). Label WF-20/21 dari `screener*` (34 key). `l10n.yaml` menghasilkan `lib/l10n/gen/app_localizations*.dart` (di-commit, deterministik, dan juga di-regenerate otomatis oleh `flutter pub get`/build karena `generate: true`). Copy 17 event diambil dari key `notif*` (+ `expireReason*Detail` untuk N-07 per nilai wire `expire_reason`, `orderFailReason*` untuk N-05 `{reason_code}`, `commonAction*`/`notifAction*` untuk tombol). Background isolate memakai `lookupAppLocalizations(Locale)` tanpa `BuildContext`. *Pendekatan const-map awal sudah dibuang.* Bahasa app = bahasa notifikasi = locale angka (aturan `format.mjs`); formatter Dart mirror-nya ada di `core/l10n_format.dart` (SOL 2 dp bila ≥1, NBSP + `paper SOL`, minus U+2212, USD 4 digit signifikan, waktu id `16.05` / en `4:05 PM`).
  - Bug ARB (dilaporkan ke UX): 13 key plural memakai `#`, padahal gen-l10n tidak mensubstitusi `#` (tampil literal "# pick"). Saat ini di-workaround hanya untuk `notifGroupedTitle`. Perbaikan yang benar: ganti `#` dengan `{count}` di ARB.
- **Aturan keamanan aksi** (renderer + dicek ulang saat tombol ditekan):
  - Approve **hanya** untuk pick Practice dengan token sekali pakai yang valid (`now < exp`). Kalau token tidak valid/kedaluwarsa, semua tombol pick disembunyikan dan tap membuka kartu.
  - **Real SOL: tanpa Approve dan tanpa Skip** (aturan team lead). Tap → kartu pick → biometrik → server re-validate. Spec mengizinkan Skip di Real; ini tersedia di balik flag `NotificationPolicy.realSkipFromNotification` (default **off**).
  - Grouping: >3 pick dalam 60 dtk per mode digabung menjadi `[MODE] {n} pick menunggu approval`, tanpa tombol.
  - Tombol yang sudah basi (token habis setelah tampil, atau aksi palsu di Real) tidak mengirim keputusan dan memunculkan N-17 "Aksi dari notifikasi kedaluwarsa".
- **Mock display:** `MockLocalNotifier` = "notification shade" in-app (Lainnya → Notifikasi). Isinya push live dari mock backend (dengan tombol aktif), toggle bahasa ID/EN, dan preview katalog 17 event per mode. Prod menggantinya dengan `flutter_local_notifications.show()` memakai `RenderedNotification` yang sama.
- **Token approval:** acak 128-bit, sekali pakai, disimpan sebagai hash di server. TTL pick 10 mnt, guard change 24 jam.
- **Registrasi device:** `register_device(...)` saat login, setiap app start, dan `onTokenRefresh`; `revoke_device(device_id)` saat logout.

## 7. Keamanan
- **Tidak ada private key di device.** Signing dilakukan di custody server (MPC/KMS) dengan policy (maks SOL/tx, allow-list program). App hanya mengirim keputusan.
- **Biometrik** (`local_auth`: BiometricPrompt / Face ID) wajib sebelum setiap aksi Real SOL: approve pick, resume strategi Real, dan melemahkan guard. Untuk guard Real ada tambahan typed-confirm (nama strategi) dan hold 2,5 dtk. Practice: hold 1,2 dtk untuk guard. Approve pick Practice tanpa biometrik (bisa diaktifkan di setting). Step-up idealnya di-attest server: device key di Secure Enclave/StrongBox menandatangani challenge dari server.
- Token sesi disimpan di Keychain/Keystore. Opsi lock screen app dengan biometrik saat resume. Screenshot dibatasi di layar konfirmasi Real (`FLAG_SECURE`).
- **RLS** di semua tabel. Mutasi hanya lewat RPC yang memvalidasi `rev`/token. Rate limit di Edge Function.
- Metadata token (symbol/name) dianggap untrusted: hanya ditampilkan sebagai teks, tidak pernah di-render sebagai HTML/link.
- Practice dan Real adalah workspace terpisah. Angka Real tidak pernah tampil di layar Practice (SPEC §4).

## 8. Testing
- **Unit:** `MockBackend` (idempotensi token, token palsu ditolak, expiry, konflik rev, stream tick, exit plan TP/SL, manual sell), parser payload push, **katalog notifikasi** (17 event, copy ID+EN lengkap untuk setiap varian, tidak ada placeholder tersisa, prefix mode, tombol yang benar per mode, Approve hanya Practice + token valid, tidak ada sell, format locale, grouping), pipeline notifikasi (push → shade, aksi basi → N-17), dan formatter/token theme.
- **Widget:** dashboard (banner + KPI), approve pick, skip + undo 5 dtk, guard Real (typed + hold), toggle strategi, Positions (equity, exit bar, sell 50% Practice dengan hold 1,2 dtk; lepas lebih awal = tidak terjual), sell Real (hold 1,3 dtk tidak cukup, 2,5 dtk menjual), swipe dinonaktifkan untuk pick Real, durasi hold guard Practice 1,2 dtk / Real 2,5 dtk, dan ladder detail.
- **Berikutnya:** golden test per screen (dark/light, textScale 1.3), integration test (`integration_test`) dengan Supabase lokal (`supabase start`) + seed, kontrak RPC diuji bersama Backend, dan uji push di device fisik (Firebase Test Lab + 1 iPhone).
- **Kontrak v1.1** (`contract_v11_test.dart`): mapping wire, tabel rename, `ApiException` dari P04xx/REST, marks, wire params 6 RPC (tanpa `device_id`), patch snake_case, reset + cooldown, register/revoke device, `portfolio_latest`, `exit_stats()`, `EventSequencer` (dedupe/urutan/watermark), envelope mock urut seq. Push v1.1 + seq dedupe/urutan/staleness + skew di `push_payload_test`/`notification_pipeline_test`. Flag Real OFF: hold guard/sell disabled + server `REAL_SOL_DISABLED`.
- CI (`.github/workflows/mobile.yml`, working dir `app`): `flutter pub get` → `tool/ci_check_errors.sh` → `flutter analyze` → `flutter test`. Berikutnya: `--coverage`, build `apk --debug` + `ios --no-codesign`.

### 8a. Generator kode error (`errors.json` → Dart)
- `app/tool/gen_errors.dart` (Dart murni, deterministik, tanpa timestamp): `errors.json` → `lib/data/api/api_errors.g.dart` berisi `apiErrorCodesVersion`, `apiErrorCodesCount`, `enum ApiErrorCode(wire, http, retryable, messageEn, messageId, sqlState)` + `unknown`, `fromWire`, `fromPostgres(sqlState, message)` (MESSAGE = kode; SQLSTATE harus `P04xx`), `message(lang)`. Memvalidasi format kode dan duplikat. Mendukung `messages.{id,en}`/`message_id`/`sqlstate` per kode bila Backend menambahkannya.
- Jalankan (dari `app/`): `dart run tool/gen_errors.dart` (sumber default `tool/contracts/errors.json`; atau `--source <path>` / env `ERRORS_JSON`), `--check` untuk verifikasi tanpa menulis. Update kontrak: `cp /workspace/sentra/packages/contracts/errors.json tool/contracts/ && dart run tool/gen_errors.dart`.
- CI: `tool/ci_check_errors.sh` memilih `$ERRORS_JSON` → `../../packages/contracts/errors.json` (setelah pindah monorepo) → salinan vendored; gagal bila salinan vendored beda dengan upstream; regenerate lalu `git diff --exit-code -- lib/data/api/api_errors.g.dart`.
- Test `api_errors_gen_test.dart`: jumlah/versi/setiap kode **dibaca dari JSON** (tidak ada angka 36/47 yang di-hardcode), sync/golden via `--check`, dan fixture kode baru (mis. `RESET_COOLDOWN` dulu) ter-generate otomatis tanpa edit manual.

## 9. Milestone 2 minggu
Fase 5 mulai Kamis 29 Okt 2026 (D1). Hari kalender berurutan, D14 = Rabu 11 Nov 2026.

| Hari | Tanggal | Deliverable |
|---|---|---|
| D1–2 ✔ | Kam 29 – Jum 30 Okt | Arsitektur, prototype mock (semua screen), migrasi token `@sentra/design-tokens` 0.2.1 + google_fonts, Positions sesuai SPEC §6, katalog notifikasi 17 event ID/EN, test |
| D3–4 | Sab 31 Okt – Min 1 Nov | Golden test, polish sesuai wireframe, flavor `mock`/`staging`/`prod`, **rename ke Sentra (`sentra_mobile`, `com.sentra.app`) + pindah ke monorepo `/workspace/sentra/apps/mobile`** |
| D5–6 | Sen 2 – Sel 3 Nov | Supabase Auth + repositori Supabase (read + Realtime) di staging, reconnect/snapshot |
| D7–8 | Rab 4 – Kam 5 Nov | Implementasi Supabase untuk `SentraRpc` (6 RPC v1.1) + feed `public.events` + optimistic UI + state error/409 (interface + mock sudah ada di commit 2) |
| **D8–9** | **Kam 5 – Jum 6 Nov** | **Bundling font lokal** (Inter + JetBrains Mono `.ttf` OFL di `assets/google_fonts/`, `allowRuntimeFetching=false`, lisensi, uji offline + golden ulang). Wajib selesai sebelum build store D14 |
| D9–10 | Jum 6 – Sab 7 Nov | FCM + `flutter_local_notifications` (render katalog) + action button + deep link + registrasi device, uji Android/iOS fisik |
| D11 | Min 8 Nov | Biometrik/step-up, FLAG_SECURE, guard Real flow end-to-end |
| D12–13 | Sen 9 – Sel 10 Nov | Integration test, aksesibilitas (TalkBack/VoiceOver, 48dp), performa list |
| D14 | Rab 11 Nov | Build store: Play internal track + TestFlight (font sudah dibundel), demo ke Apex Dev Lead |

## 10. Open questions dan dependency
**Ke Backend API Specialist:** pertanyaan 1–6 sudah dijawab di `FLUTTER_INTEGRATION_ANSWERS.md` (v1 + update v1.1) dan diterapkan di commit 2. Mismatch kontrak yang masih terbuka ada di laporan commit 2 (mis. per-kode SQLSTATE/pesan ID di `errors.json`, `version` approval tidak ada di PushPayload, bentuk `exit_stats()`/`portfolio_latest` belum terdokumentasi).

**Ke UX UI Designer:**
1. ~~Regen token~~ selesai di 0.2.1. Sisa yang open: T-15 (ambang netral PnL), T-16, T-17 (lihat `TOKENS_REVIEW.md`).
2. ~~Desain Positions~~ sudah ada di wireframe 11/12 dan sudah diimplementasikan.
3. Equity curve di dashboard ditambahkan oleh mobile karena tidak ada di wireframe 02. Dipertahankan?
4. ~~Copy notifikasi~~ sudah ada di `NOTIFICATIONS.md` dan sudah diimplementasikan. Ada beberapa konflik dan celah di spec:
   - Skip dari notifikasi untuk Real SOL: spec mengizinkan, team lead melarang. Saat ini mengikuti team lead, dengan flag.
   - Body N-12 Practice, body N-14 ke Practice, dan body grouping tidak ada di spec, jadi diisi sementara.
   - Aturan "judul selalu [MODE]" bertentangan dengan tabel (N-03, N-06, N-14, N-16, N-17 tanpa prefix). Saat ini mengikuti tabel.
5. Light mode untuk mobile: aktif di MVP atau dark saja?

## 11. Asumsi
- Satu workspace aktif per user. Mode diambil dari workspace (mock = Practice).
- **[Disetujui team lead]** "Setting change" yang butuh approval = **guard weakening** (SPEC §3). Perubahan yang menguatkan langsung berlaku, jadi tidak masuk queue.
- **[Disetujui team lead]** Undo skip 5 dtk diimplementasikan di client: keputusan baru dikirim setelah jendela undo, sehingga tidak butuh endpoint undo.
- Angka KPI, WR/DD, dan risk impact di mock adalah data contoh, bukan data akun Boss.
