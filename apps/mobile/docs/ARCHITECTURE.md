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
    format.dart             # id-ID, ▲/▼, ±0, mm:ss
  data/
    models/models.dart      # Strategy, Position (+ExitPlanState/TpRung, soldPct), ActivityEvent, Approval, PortfolioSummary
    repositories/repositories.dart  # interface Portfolio(+equityHistory, sellPosition)/Activity/Strategy/Approval/PushSource
    mock/mock_backend.dart  # simulator in-memory + stream + exit plan engine + push payload emitter
    providers.dart          # composition root + StreamProvider
  features/
    positions/ positions_screen.dart (list + detail ladder) · widgets/ equity_card · exit_progress_bar · sell_sheet
    settings/ settings_screen.dart (Lainnya) · notifications_screen.dart (bahasa ID/EN, shade mock, katalog)
    dashboard · activity · approvals (+guard_review) · strategies · shell
  l10n/ app_en.arb app_id.arb (verbatim dari UX) · gen/ (gen-l10n output)
  core/l10n_format.dart     # mirror format.mjs
test/  flutter_test_config · mock_backend · push_payload · notification_catalog · notification_pipeline · l10n_format · positions · theme_tokens · widget_flows
```

### 3a. Design tokens dan font
- **Vendoring, bukan dependency.** `/workspace/sentra/packages/design-tokens` bukan paket Dart (tidak ada `pubspec.yaml`; output `tokens/app_tokens.dart` di-generate oleh `scripts/build.py`). File itu disalin **verbatim** ke `core/theme/app_tokens.dart` (md5 `454ec83c…`, sama dengan sumber). Update: salin ulang, lalu `flutter analyze && flutter test`. Setelah pindah ke monorepo, langkah ini jadi skrip CI (salin + cek md5) supaya salinan tidak drift.
- API yang dipakai: `context.tradeColors`, `AppText.num()`, `AppSpace.sHalf`, `AppDensity`, `AppMotion.of(context)`/`*Base`, `AppButtons.*`, `AppTheme.dark/light()`. Status temuan token ada di `TOKENS_REVIEW.md`.
- **Font MVP: `google_fonts` ^9** (Inter + JetBrains Mono) lewat `AppText`/`AppTheme`. Di test, `allowRuntimeFetching=false` (tanpa jaringan).
- **Sebelum rilis store: font dibundel sebagai aset lokal** (milestone D8–9, Kam 5 – Jum 6 Nov 2026). Langkahnya: `.ttf` OFL Inter 400/500/600 + JetBrains Mono 500/600 di `assets/google_fonts/`, deklarasi `assets:` di pubspec, `GoogleFonts.config.allowRuntimeFetching = false` di `main()`, file lisensi OFL ditampilkan di `LicenseRegistry`, lalu verifikasi offline (mode pesawat) + golden test. Alasan: tidak ada fetch font saat runtime (privasi, startup offline, review store).

## 4. Routing (go_router)
- `StatefulShellRoute.indexedStack` dengan 5 tab sesuai SPEC: **Home · Strategi · Approvals · Activity · Lainnya**. `ModeBanner` (Practice/Real) yang tidak bisa di-dismiss ada di atas setiap tab.
- Rute: `/`, `/strategies`, `/approvals`, `/approvals/:id` (deep link dari push, item di-highlight), `/approvals/:id/review` (guard change, full-screen dialog di root navigator), `/activity`, `/more`, `/more/notifications`, `/positions`, `/positions/:id`.
- **Positions ada di branch tab Lainnya** (wireframe 12 menandai Lainnya aktif). Path tetap `/positions` (bukan `/more/positions`) supaya deep link push N-04/N-08/N-09 pendek dan stabil. KPI "Open" di Home juga membuka `/positions`.
- Deep link: `sentra://approvals/<id>` dan Universal/App Links `https://app.<domain>/approvals/<id>` dipetakan ke path yang sama.

## 5. Data layer
- Interface: `PortfolioRepository.watchSummary/watchPositions`, `ActivityRepository.watchFeed`, `StrategyRepository.watchStrategies/setPaused(expectedRev)`, `ApprovalRepository.watchPending/watchAll/decide(token)`.
- **Mock** (`MockBackend`): satu objek mengimplementasikan semua interface, jadi state konsisten (approve pick membuat posisi dan event). `tick()` menggerakkan harga dan menjalankan **exit plan sebagai data** per posisi (rung TP jual sebagian dari ukuran awal, trailing armed setelah TP1, stop loss, time stop bila belum ada TP; fee 125 bps), lalu memunculkan pick baru. Mock juga mengirim payload push (N-01/02/04/08/09) lewat `PushSource`, dengan bentuk yang sama seperti FCM `data`. Idempotensi token, expiry, dan konflik `rev` sudah disimulasikan.
- **Swap ke Supabase:** buat `data/supabase/*_repository.dart`, lalu di `main_supabase.dart` panggil `ProviderScope(overrides: [portfolioRepositoryProvider.overrideWithValue(...), ...])`. Folder `features/` tidak berubah.

### Positions (SPEC §6, wireframe 11/12, `flows/positions-sell.mmd`)
- **List:** header "Positions · n open". Kartu equity (1D/7D/30D/All, garis high-water putus-putus, label tanggal). Kartu posisi berisi `$COIN`, strategi · size, PnL SOL (%) ▲/▼, **exit progress bar** (penanda SL merah │ isi sampai harga │ titik rung TP terisi/next/pending), caption (`TP1 ✓ · next TP2 +100%` / `SL −35% · trail armed`), entry → now · hold, dan tombol **Sell**. Di bawahnya ada daftar Closed.
- **Sell sheet:** pilihan 25/50/100% dari sisa posisi, "Perkiraan terima ≈ x paper SOL" (live mengikuti mark), slippage/fee, efek ke exit plan ("Sisa posisi tetap memakai exit plan"; 100% = exit plan dibatalkan). **Selalu hold-to-confirm (aturan team lead):** Practice 1,2 dtk (`holdPracticeBase`, label "Tahan untuk jual 50% (Practice)"), Real SOL 2,5 dtk (`holdRealBase`) + biometrik (`ApprovalGuard`), plus Batal. SPEC §6/wireframe 12 hanya meminta konfirmasi biasa untuk Practice, jadi ini deviasi yang disengaja.
- **Detail:** ladder vertikal diurutkan menurut level (TP terisi/next/pending, sekarang, trailing armed/off, entry, SL), plus kartu "Berikutnya: TP2 di +100% (jual 33%)" dan time stop.
- **Approvals mobile, Real SOL: swipe approve/skip dinonaktifkan total** (tidak ada `Dismissible` di item Real; juga tidak untuk guard change). Guard hold: Practice 1,2 dtk, Real 2,5 dtk + typed name. Keduanya diuji.
- **Sell tidak pernah dari notifikasi:** enum `NotifAction` tidak punya `sell`, dan ini diuji.
- Repo: `equityHistory(range)`, `sellPosition(id, pct)` (prod: RPC/Edge Function `sell_position` dengan idempotency key).

### Rencana integrasi Supabase
- **Auth:** `supabase_flutter` dengan Supabase Auth (Google, Apple, Email OTP sesuai SPEC). Telegram dan SIWS lewat Edge Function yang menerbitkan session. Token disimpan di Keychain/Keystore (`flutter_secure_storage` sebagai storage adapter). Refresh otomatis.
- **Tabel yang dibaca app** (sesuai blueprint): `workspaces`, `strategies` (id, workspace_id, mode, status, rev, settings jsonb), `positions` (ck.N, entry/exit, sol_in/out, peak, fee_bps), `events` (append-only, id `<ck>:<ts>:<kind>`, actor, `untrusted` jsonb), `approvals` (kind, payload, status, token_hash, expires_at, expire_reason), plus tabel baru `device_tokens` (user_id, platform, fcm_token, app_version, last_seen) dan `notification_prefs`.
- **View/RPC baca:** `v_portfolio_summary` (cash, realized, unrealized dari mark terakhir), `v_strategy_stats` (WR, DD, avg hold), dan `equity_history(workspace_id, since)`.
- **Realtime:** `postgres_changes` untuk `positions` (UPDATE mark/close), `events` (INSERT), `approvals` (INSERT/UPDATE), dan `strategies` (UPDATE), dengan filter `workspace_id=eq.<id>`. Saat reconnect, lakukan snapshot ulang via select (Realtime tidak menjamin delivery). Event di-dedupe via id. Mark price frekuensi tinggi sebaiknya lewat **Broadcast channel** per workspace (throttle 1–2 dtk), bukan update baris.
- **Mutasi lewat RPC/Edge Function, bukan update tabel langsung:**
  - `decide_approval(approval_id, decision, token, device_id)` dijalankan sebagai Postgres function `SECURITY DEFINER`. Function ini memverifikasi hash token, mengecek `expires_at` dan status `pending`, lalu melakukan update atomik `status` + insert `jobs` + audit. Pemanggilan ulang dengan token yang sama mengembalikan hasil yang sama (idempoten).
  - `set_strategy_status(strategy_id, status, expected_rev)` menolak `rev` yang basi (409, `ConflictException` di app).
  - Guard change Real SOL ditangani Edge Function `approve_guard_change`: memverifikasi step-up (biometrik/2FA, lihat §7), memasang cooldown 10 mnt, mengirim notifikasi ke semua device, dan email.
- **RLS:** semua tabel `workspace_id in (select id from workspaces where owner = auth.uid())`. Role `anon` tidak punya akses. Tabel `approvals`/`jobs` read-only untuk client, dan perubahan hanya lewat RPC. Kolom `token_hash` tidak di-expose (view tanpa kolom itu).

## 6. Push notification dan katalog notifikasi
- **FCM** untuk Android dan iOS (iOS via APNs key di Firebase). Paket: `firebase_messaging` + `flutter_local_notifications`, yang menyediakan action button (Android `actions`, iOS `UNNotificationCategory`).
- **Payload data-only, tanpa copy** (`core/push/push_payload.dart`): `v=1, event=N-xx, mode=practice|real, approval_id?, position_id?, token?, exp?, expire_reason?` + variabel (`coin, strategy, sol, pnl, pct, …`). Copy di-render **di client** dari katalog sesuai bahasa user. Payload yang versi/event-nya tidak dikenal, pick tanpa `approval_id`, atau event wajib-mode tanpa `mode` akan ditolak (**fail closed**). Event Real-only (N-11, N-13) ditolak bila mode-nya Practice. `coin` tetap untrusted: hanya teks.
- **Katalog typed** (`core/notifications/notification_catalog.dart`): `enum NotifEvent` N-01…N-17 (N-07 punya 5 varian alasan a–e, termasuk `strategy_archived` dari ARB/kontrak; N-05/N-12/N-14 punya varian mode/arah). Setiap event membawa kanal, prioritas, dan aksi Practice/Real persis seperti tabel spec. Prefix mode berasal dari ICU `select` di ARB. Angka mengikuti locale, unit `paper SOL`/`SOL`, PnL diberi ▲/▼ (ARB tidak memuat glyph), `{time}` = countdown `expires_at − (now + skew server)`. Variabel yang hilang tampil sebagai `–`, tidak pernah sebagai `{x}` mentah.
- **Lokalisasi: ARB UX + `flutter_localizations`/gen-l10n.** `lib/l10n/app_{en,id}.arb` disalin **verbatim** dari `/workspace/ux-solbot/locales/arb` (313 key, md5 sama; jangan diedit di sini). `l10n.yaml` menghasilkan `lib/l10n/gen/app_localizations*.dart` (di-commit, deterministik, dan juga di-regenerate otomatis oleh `flutter pub get`/build karena `generate: true`). Copy 17 event diambil dari key `notif*` (+ `queueExpiredReason*` untuk N-07, `commonAction*`/`notifAction*` untuk tombol). Background isolate memakai `lookupAppLocalizations(Locale)` tanpa `BuildContext`. *Pendekatan const-map awal sudah dibuang.* Bahasa app = bahasa notifikasi = locale angka (aturan `format.mjs`); formatter Dart mirror-nya ada di `core/l10n_format.dart` (SOL 2 dp bila ≥1, NBSP + `paper SOL`, minus U+2212, USD 4 digit signifikan, waktu id `16.05` / en `4:05 PM`).
  - Bug ARB (dilaporkan ke UX): 13 key plural memakai `#`, padahal gen-l10n tidak mensubstitusi `#` (tampil literal "# pick"). Saat ini di-workaround hanya untuk `notifGroupedTitle`. Perbaikan yang benar: ganti `#` dengan `{count}` di ARB.
- **Aturan keamanan aksi** (renderer + dicek ulang saat tombol ditekan):
  - Approve **hanya** untuk pick Practice dengan token sekali pakai yang valid (`now < exp`). Kalau token tidak valid/kedaluwarsa, semua tombol pick disembunyikan dan tap membuka kartu.
  - **Real SOL: tanpa Approve dan tanpa Skip** (aturan team lead). Tap → kartu pick → biometrik → server re-validate. Spec mengizinkan Skip di Real; ini tersedia di balik flag `NotificationPolicy.realSkipFromNotification` (default **off**).
  - Grouping: >3 pick dalam 60 dtk per mode digabung menjadi `[MODE] {n} pick menunggu approval`, tanpa tombol.
  - Tombol yang sudah basi (token habis setelah tampil, atau aksi palsu di Real) tidak mengirim keputusan dan memunculkan N-17 "Aksi dari notifikasi kedaluwarsa".
- **Mock display:** `MockLocalNotifier` = "notification shade" in-app (Lainnya → Notifikasi). Isinya push live dari mock backend (dengan tombol aktif), toggle bahasa ID/EN, dan preview katalog 17 event per mode. Prod menggantinya dengan `flutter_local_notifications.show()` memakai `RenderedNotification` yang sama.
- **Token approval:** acak 128-bit, sekali pakai, disimpan sebagai hash di server. TTL pick 10 mnt, guard change 24 jam.
- **Registrasi device:** saat login dan saat `onTokenRefresh`, upsert `device_tokens`. Saat logout, hapus.

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
- CI: `flutter analyze`, `flutter test --coverage`, build `apk --debug` + `ios --no-codesign`.

## 9. Milestone 2 minggu
Fase 5 mulai Kamis 29 Okt 2026 (D1). Hari kalender berurutan, D14 = Rabu 11 Nov 2026.

| Hari | Tanggal | Deliverable |
|---|---|---|
| D1–2 ✔ | Kam 29 – Jum 30 Okt | Arsitektur, prototype mock (semua screen), migrasi token `@sentra/design-tokens` 0.2.1 + google_fonts, Positions sesuai SPEC §6, katalog notifikasi 17 event ID/EN, test |
| D3–4 | Sab 31 Okt – Min 1 Nov | Golden test, polish sesuai wireframe, flavor `mock`/`staging`/`prod`, **rename ke Sentra (`sentra_mobile`, `com.sentra.app`) + pindah ke monorepo `/workspace/sentra/apps/mobile`** |
| D5–6 | Sen 2 – Sel 3 Nov | Supabase Auth + repositori Supabase (read + Realtime) di staging, reconnect/snapshot |
| D7–8 | Rab 4 – Kam 5 Nov | RPC `decide_approval` / `set_strategy_status` + optimistic UI + error/conflict state |
| **D8–9** | **Kam 5 – Jum 6 Nov** | **Bundling font lokal** (Inter + JetBrains Mono `.ttf` OFL di `assets/google_fonts/`, `allowRuntimeFetching=false`, lisensi, uji offline + golden ulang). Wajib selesai sebelum build store D14 |
| D9–10 | Jum 6 – Sab 7 Nov | FCM + `flutter_local_notifications` (render katalog) + action button + deep link + registrasi device, uji Android/iOS fisik |
| D11 | Min 8 Nov | Biometrik/step-up, FLAG_SECURE, guard Real flow end-to-end |
| D12–13 | Sen 9 – Sel 10 Nov | Integration test, aksesibilitas (TalkBack/VoiceOver, 48dp), performa list |
| D14 | Rab 11 Nov | Build store: Play internal track + TestFlight (font sudah dibundel), demo ke Apex Dev Lead |

## 10. Open questions dan dependency
**Ke Backend API Specialist:**
1. Supabase dipakai juga untuk Auth, atau auth terpisah (OAuth server MCP)? Telegram/SIWS lewat Edge Function?
2. Nama final tabel/view, plus kolom `expire_reason`, `pick_type`, `risk_impact`, `mode` di `approvals`.
3. Kontrak RPC `decide_approval` (response, kode error 409/410) dan `set_strategy_status`.
4. Kanal mark price: Broadcast throttle atau tabel `marks`? Seberapa sering?
5. Siapa yang mengirim push (Edge Function + FCM HTTP v1)? Proyek Firebase milik siapa?
6. Mekanisme step-up untuk Real SOL: device key attestation, atau cukup 2FA TOTP di server?

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
