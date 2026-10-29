# SolBot Mobile: arsitektur Fase 5 (Flutter Android + iOS)

**Owner:** Flutter Mobile Specialist · **Untuk:** Apex Dev Lead · 29 Okt 2026
**Basis:** blueprint "HOTBOT — Architecture & How It Works" (data model Postgres, roadmap Fase 5), SPEC UX Fase 0 (`/workspace/ux-solbot/docs/SPEC.md`), token `app_tokens.dart`.
**Prinsip:** perilaku setara, tapi code, UI, dan aset orisinal. Tidak ada code, aset, atau nama HOTBOT di repo ini.
**Nama:** working name produk **Sentra**, placeholder app ID `com.sentra.app`, package `sentra_mobile`. Rename di app dilakukan saat pindah ke monorepo `/workspace/sentra/apps/mobile`. Prototype ini masih `solbot_mobile`.

## 1. Scope Fase 5
- Push notification untuk approval: pick buy (approve/skip) dan perubahan setting/guard.
- PnL (team overview + equity curve), daftar posisi, dan detail posisi.
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
    theme/ app_tokens.dart (vendored dari UX) · solbot_theme.dart (adapter + patch)
    widgets/ common.dart (PnlText, ModeBanner, TagChip, RiskBadge, ExpiryCountdown, HoldToConfirmButton) · sparkline.dart
    push/ push_payload.dart (kontrak payload FCM, pure Dart)
    approval_guard.dart     # gate biometrik (interface; mock = dialog)
    format.dart             # id-ID, ▲/▼, ±0, mm:ss
  data/
    models/models.dart      # Strategy, Position, ActivityEvent, Approval, PortfolioSummary
    repositories/repositories.dart  # interface Portfolio/Activity/Strategy/Approval
    mock/mock_backend.dart  # simulator in-memory + stream (pengganti Realtime)
    providers.dart          # composition root + StreamProvider
  features/ dashboard · positions · activity · approvals (+guard_review) · strategies · settings(Lainnya) · shell
test/  mock_backend · push_payload · theme_tokens · widget_flows
```

## 4. Routing (go_router)
- `StatefulShellRoute.indexedStack` dengan 5 tab sesuai SPEC: **Home · Strategi · Approvals · Activity · Lainnya**. `ModeBanner` (Practice/Real) yang tidak bisa di-dismiss ada di atas setiap tab.
- Rute: `/`, `/positions`, `/positions/:id`, `/strategies`, `/approvals`, `/approvals/:id` (deep link dari push, item di-highlight), `/approvals/:id/review` (guard change, full-screen dialog di root navigator), `/activity`, `/more`.
- Deep link: `sentra://approvals/<id>` dan Universal/App Links `https://app.<domain>/approvals/<id>` dipetakan ke path yang sama.

## 5. Data layer
- Interface: `PortfolioRepository.watchSummary/watchPositions`, `ActivityRepository.watchFeed`, `StrategyRepository.watchStrategies/setPaused(expectedRev)`, `ApprovalRepository.watchPending/watchAll/decide(token)`.
- **Mock** (`MockBackend`): satu objek mengimplementasikan semua interface, jadi state konsisten (approve pick membuat posisi dan event). `tick()` menggerakkan harga, menutup posisi (trailing 15% / TP +60%, fee 125 bps), dan memunculkan pick baru. Idempotensi token, expiry, dan konflik `rev` sudah disimulasikan.
- **Swap ke Supabase:** buat `data/supabase/*_repository.dart`, lalu di `main_supabase.dart` panggil `ProviderScope(overrides: [portfolioRepositoryProvider.overrideWithValue(...), ...])`. Folder `features/` tidak berubah.

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

## 6. Push notification
- **FCM** untuk Android dan iOS (iOS via APNs key di Firebase). Paket: `firebase_messaging` + `flutter_local_notifications`, yang menyediakan action button (Android `actions`, iOS `UNNotificationCategory`).
- **Payload data-only** (lihat `core/push/push_payload.dart`): `v, type=approval, approval_id, kind, mode, token, exp`. Judul diberi prefix `[PRACTICE]`/`[REAL SOL]`. Nama token tidak boleh dipakai sebagai instruksi (field `untrusted`).
- **Aksi inline:** hanya untuk **pick Practice** (Skip/Approve). Background handler memanggil `decide_approval` dengan token dari payload. Guard change dan semua item Real SOL hanya mendapat aksi "Buka", yang membawa ke deep link, lalu biometrik di app. Ini sesuai SPEC §3. Payload tanpa `mode` ditolak (fail closed).
- **Token approval:** acak 128-bit, sekali pakai, disimpan sebagai hash di server. TTL pick 10 mnt (configurable), guard change 24 jam. Token juga terikat ke `user_id` dan `approval_id`, sehingga notifikasi yang tertunda dan replay aman (server menjawab `expired`/status final).
- **Registrasi device:** saat login dan saat `onTokenRefresh`, upsert `device_tokens`. Saat logout, hapus. Server mengirim lewat Edge Function `notify` (FCM HTTP v1), dipicu trigger insert `approvals`.

## 7. Keamanan
- **Tidak ada private key di device.** Signing dilakukan di custody server (MPC/KMS) dengan policy (maks SOL/tx, allow-list program). App hanya mengirim keputusan.
- **Biometrik** (`local_auth`: BiometricPrompt / Face ID) wajib sebelum setiap aksi Real SOL: approve pick, resume strategi Real, dan melemahkan guard. Untuk guard Real ada tambahan typed-confirm (nama strategi) dan hold 2,5 dtk. Practice: hold 1,2 dtk untuk guard. Approve pick Practice tanpa biometrik (bisa diaktifkan di setting). Step-up idealnya di-attest server: device key di Secure Enclave/StrongBox menandatangani challenge dari server.
- Token sesi disimpan di Keychain/Keystore. Opsi lock screen app dengan biometrik saat resume. Screenshot dibatasi di layar konfirmasi Real (`FLAG_SECURE`).
- **RLS** di semua tabel. Mutasi hanya lewat RPC yang memvalidasi `rev`/token. Rate limit di Edge Function.
- Metadata token (symbol/name) dianggap untrusted: hanya ditampilkan sebagai teks, tidak pernah di-render sebagai HTML/link.
- Practice dan Real adalah workspace terpisah. Angka Real tidak pernah tampil di layar Practice (SPEC §4).

## 8. Testing
- **Unit:** `MockBackend` (idempotensi token, token palsu ditolak, expiry, konflik rev, stream tick), parser payload push, dan formatter/token theme.
- **Widget:** dashboard (banner + KPI), approve pick, skip + undo 5 dtk, guard Real (typed + hold), dan toggle strategi.
- **Berikutnya:** golden test per screen (dark/light, textScale 1.3), integration test (`integration_test`) dengan Supabase lokal (`supabase start`) + seed, kontrak RPC diuji bersama Backend, dan uji push di device fisik (Firebase Test Lab + 1 iPhone).
- CI: `flutter analyze`, `flutter test --coverage`, build `apk --debug` + `ios --no-codesign`.

## 9. Milestone 2 minggu
| Hari | Deliverable |
|---|---|
| D1–2 ✔ | Arsitektur, prototype mock (semua screen), integrasi token UX, test dasar *(selesai hari ini)* |
| D3–4 | Font + regen token (TOKENS_REVIEW), golden test, polish sesuai wireframe, flavor `mock`/`staging`/`prod`, rename ke Sentra (`com.sentra.app`) + pindah ke monorepo |
| D5–6 | Supabase Auth + repositori Supabase (read + Realtime) di staging, reconnect/snapshot |
| D7–8 | RPC `decide_approval` / `set_strategy_status` + optimistic UI + error/conflict state |
| D9–10 | FCM + action button + deep link + registrasi device, uji Android/iOS fisik |
| D11 | Biometrik/step-up, FLAG_SECURE, guard Real flow end-to-end |
| D12–13 | Integration test, aksesibilitas (TalkBack/VoiceOver, 48dp), performa list |
| D14 | Build internal (Play internal track + TestFlight), demo ke Apex Dev Lead |

## 10. Open questions dan dependency
**Ke Backend API Specialist:**
1. Supabase dipakai juga untuk Auth, atau auth terpisah (OAuth server MCP)? Telegram/SIWS lewat Edge Function?
2. Nama final tabel/view, plus kolom `expire_reason`, `pick_type`, `risk_impact`, `mode` di `approvals`.
3. Kontrak RPC `decide_approval` (response, kode error 409/410) dan `set_strategy_status`.
4. Kanal mark price: Broadcast throttle atau tabel `marks`? Seberapa sering?
5. Siapa yang mengirim push (Edge Function + FCM HTTP v1)? Proyek Firebase milik siapa?
6. Mekanisme step-up untuk Real SOL: device key attestation, atau cukup 2FA TOTP di server?

**Ke UX UI Designer:**
1. Regen token (lihat `TOKENS_REVIEW.md`: T-01 font, T-02 copyWith, T-03 kontras, T-06, T-07).
2. Desain layar Positions dan detail posisi (tidak ada di wireframe). Saat ini Positions diakses dari KPI "Open" dan tab Lainnya.
3. Equity curve di dashboard ditambahkan oleh mobile karena tidak ada di wireframe 02. Dipertahankan?
4. Desain layout notifikasi (teks, aksi) Android/iOS dan copy final bahasa ID/EN.
5. Light mode untuk mobile: aktif di MVP atau dark saja?

## 11. Asumsi
- Satu workspace aktif per user. Mode diambil dari workspace (mock = Practice).
- **[Disetujui team lead]** "Setting change" yang butuh approval = **guard weakening** (SPEC §3). Perubahan yang menguatkan langsung berlaku, jadi tidak masuk queue.
- **[Disetujui team lead]** Undo skip 5 dtk diimplementasikan di client: keputusan baru dikirim setelah jendela undo, sehingga tidak butuh endpoint undo.
- Angka KPI, WR/DD, dan risk impact di mock adalah data contoh, bukan data akun Boss.
