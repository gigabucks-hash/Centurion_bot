# Review Login Telegram: SDK resmi/OIDC vs deep link custom (Sentra mobile)

- Tanggal review: 29 Okt 2026, ±16:30 WIB (UTC+7)
- Peninjau: Mobile (Fase 5)
- Sifat: **read-only**. Tidak ada yang di-install ke project mana pun. Source SDK di-clone untuk dibaca saja ke `/workspace/dev_team/telegram_sdk_review/`.
- Commit yang direview: Android `f9d5ec3` (15 Jul 2026), iOS `215851d` / tag `1.0.0` (18 Apr 2026).

---

## 0. Ringkasan (TL;DR)

**Rekomendasi: LULUS BERSYARAT. Pakai alur resmi Telegram (OIDC + SDK native resmi) sebagai target, tetapi bukan lewat paket pub.dev pihak ketiga.** Kita bungkus SDK resmi di plugin tipis milik kita sendiri (MethodChannel, source di-vendor dan di-pin ke commit di atas), lalu `id_token` diverifikasi di Edge Function yang mencetak JWT Supabase. Deep link custom dipensiunkan. Kalau masih dipakai sementara, wajib ada layar konfirmasi di bot dan feature flag.

Alasan utama:
1. **Resmi.** Kedua SDK ada di org GitHub `TelegramMessenger` (org yang sama dengan `Telegram-iOS`) dan ditautkan langsung dari dokumentasi resmi [core.telegram.org/widgets/login](https://core.telegram.org/widgets/login). Lisensinya MIT, ([LICENSE Android](https://github.com/TelegramMessenger/telegram-login-android/blob/main/LICENSE), [LICENSE iOS](https://github.com/TelegramMessenger/telegram-login-ios/blob/main/LICENSE)).
2. **Kodenya kecil dan bersih.** Android ±270 baris Kotlin, iOS ±330 baris Swift. Tidak ada telemetri dan tidak ada obfuscation. Satu-satunya host jaringan adalah `oauth.telegram.org`. Izin Android hanya `INTERNET` + `<queries>` untuk skema `tg`.
3. **Lebih tahan phishing daripada deep link kita.** Kode otorisasi dikirim ke App Link/Universal Link terverifikasi di perangkat yang menyetujui, bukan diikat di server ke nonce milik siapa pun yang memulai login (detail di §3).

Syarat penting (detail di §4):
- SDK resmi **tidak mendukung `nonce` maupun `state`**. Klaim UX soal "OIDC dengan nonce resmi" hanya benar untuk library JS web, tidak untuk SDK native (lihat §1.3). Anti-replay harus kita bangun di Edge Function.
- SDK masih **v1.0.0 dan belum matang**: ada bug terbuka, label "Unverified App" muncul sampai app terbit di store, dan tidak ada SECURITY.md.
- Paket Android hanya ada di GitHub Packages, yang butuh PAT. Karena itu kita vendor source-nya, bukan menarik binary.

---

## 1. Apa yang resmi ditawarkan Telegram (per 29 Okt 2026)

### 1.1 Produk
Dokumen [Log In With Telegram](https://core.telegram.org/widgets/login) (juga di [core.telegram.org/bots/telegram-login](https://core.telegram.org/bots/telegram-login)) sekarang menjelaskan tiga jalur:
- **Telegram Login library (JS)** untuk web: `Telegram.Login.init/open/auth`. Widget iframe lama sudah diarsipkan.
- **Native SDK iOS & Android**: "Telegram Login for iOS" → https://github.com/TelegramMessenger/telegram-login-ios, "Telegram Login for Android" → https://github.com/TelegramMessenger/telegram-login-android. Tautan ini diambil dari HTML halaman resmi tersebut.
- **OpenID Connect standar**: Authorization Code Flow + PKCE.

**Tidak ada paket Flutter resmi.** Halaman resmi hanya menyebut iOS dan Android. Daftar repo org `TelegramMessenger` ([API](https://api.github.com/orgs/TelegramMessenger/repos)) tidak berisi repo Flutter/Dart. Di pub.dev, semua paket Telegram-login diterbitkan pihak ketiga (lihat §2.4).

### 1.2 Endpoint OIDC (dari discovery live: https://oauth.telegram.org/.well-known/openid-configuration)
| Item | Nilai |
|---|---|
| issuer | `https://oauth.telegram.org` |
| authorization | `https://oauth.telegram.org/auth` |
| token | `https://oauth.telegram.org/token` (auth `client_secret_basic`/`client_secret_post`) |
| JWKS | `https://oauth.telegram.org/.well-known/jwks.json` |
| response_types | `code` saja |
| PKCE | `plain`, `S256` |
| alg id_token | `RS256` (default), `ES256`, `EdDSA`, `ES256K` |
| scopes | `openid`, `profile`, `phone`, `telegram:bot_access`, `ton:wallet` |

- JWKS live berisi kunci `kid` `oidc-1` (RS256), `oidc-es256-1`, `oidc-eddsa-1`, dan `oidc-es256k-1` ([jwks.json](https://oauth.telegram.org/.well-known/jwks.json)).
- **Tidak ada endpoint UserInfo.** Semua data user ada di `id_token` ([docs](https://core.telegram.org/widgets/login)).
- `EdDSA`/`ES256K` hanya boleh dengan scope `openid` dan menolak `profile`/`phone` ([docs](https://core.telegram.org/widgets/login)). **Kita pakai RS256 atau ES256**, karena butuh `profile` untuk claim `id`.

### 1.3 State, nonce, PKCE
- Parameter `/auth` yang didokumentasikan: `client_id, redirect_uri, response_type=code, scope, state, code_challenge, code_challenge_method=S256`. `state` disebut sebagai string acak dari backend untuk anti-CSRF ([docs](https://core.telegram.org/widgets/login)).
- **`nonce` hanya didokumentasikan sebagai opsi library JS** (`InitOptions.nonce`: "Server-generated random string to be included in the resulting id_token to prevent replay attacks"). Lihat [docs](https://core.telegram.org/bots/telegram-login).
- `nonce` **tidak** tercantum sebagai parameter `/auth` dan **tidak** ada di `claims_supported` discovery ([discovery](https://oauth.telegram.org/.well-known/openid-configuration)).
- **Belum terverifikasi:** apakah `/auth` atau endpoint `/crossapp` milik SDK menerima `nonce` lalu menaruhnya di `id_token`. Ini hanya bisa diuji dengan bot dan client_id sungguhan.
- Token exchange menurut docs memakai Basic auth `client_id:client_secret` ([docs](https://core.telegram.org/widgets/login)). **Namun SDK native melakukan exchange langsung dari perangkat tanpa secret, hanya dengan PKCE** ([TelegramLogin.kt L176–227](https://github.com/TelegramMessenger/telegram-login-android/blob/main/TelegramLogin/src/main/java/org/telegram/login/TelegramLogin.kt), [TelegramLogin.swift L251–298](https://github.com/TelegramMessenger/telegram-login-ios/blob/main/Sources/TelegramLogin/TelegramLogin.swift)). Artinya app native diperlakukan sebagai *public client*. Perilaku ini tidak dijelaskan di docs dan disimpulkan dari source.

### 1.4 Claims id_token (contoh resmi, [docs](https://core.telegram.org/widgets/login))
`iss, aud (=Client ID bot), sub, iat, exp, id, name, given_name, family_name, preferred_username, picture, phone_number, phone_number_verified`.
- `sub` ≠ ID numerik Telegram. **ID Telegram ada di claim `id` dan hanya ada dengan scope `profile`.** Hal ini juga dicatat oleh verifier pihak ketiga `tgoidc` ([pkg.go.dev](https://pkg.go.dev/github.com/bots-go-framework/bots-fw-telegram-webapp/tgoidc)). Catatan: `id` tidak muncul di `claims_supported` discovery.
- Contoh `exp − iat` di docs = 3600 detik. TTL `id_token` sebenarnya **belum terverifikasi**.

### 1.5 Verifikasi tanda tangan
Ambil JWKS, verifikasi signature, cek `iss == https://oauth.telegram.org`, `aud == Client ID`, dan `exp` ([docs](https://core.telegram.org/widgets/login)).

### 1.6 Bisakah Supabase Auth langsung mengonsumsinya?
- **Bisa secara teknis.** Supabase punya *Custom OAuth/OIDC Providers* dengan prefix `custom:`. Untuk OIDC cukup isi issuer, lalu discovery dan JWKS di-resolve otomatis ([Supabase docs](https://supabase.com/docs/guides/auth/custom-oauth-providers)). Ada juga `acceptable_client_ids` dan `email_optional` ([Supabase features](https://supabase.com/features/custom-oidc-providers)). `signInWithIdToken` menerima provider `custom:` ([supabase-js PR #2134](https://github.com/supabase/supabase-js/pull/2134), [token_oidc.go](https://github.com/supabase/auth/blob/master/internal/api/token_oidc.go)).
- **Tapi tidak saya sarankan untuk Sentra:**
  - (a) `id_token` dari SDK tidak membawa nonce, jadi provider harus memakai `SkipNonceCheck` (field ada di [token_oidc.go](https://github.com/supabase/auth/blob/master/internal/api/token_oidc.go)). Apakah opsi ini terekspos di dashboard **belum terverifikasi**.
  - (b) Telegram tidak memberi email, jadi `email_optional` wajib.
  - (c) Identitas Supabase kemungkinan dikunci ke `sub`, padahal bot kita butuh `id` numerik untuk mengikat `telegram_id`. Pemetaan claim ini **belum terverifikasi**.
  - (d) Backend sudah memutuskan Telegram lewat Edge Function yang mencetak JWT (`/workspace/sentra/packages/contracts/FLUTTER_INTEGRATION_ANSWERS.md`).
- **→ Pakai Edge Function `auth-telegram-oidc`.**

---

## 2. Review source SDK resmi

### 2.1 Identitas & pemeliharaan
| | Android | iOS |
|---|---|---|
| Repo | https://github.com/TelegramMessenger/telegram-login-android | https://github.com/TelegramMessenger/telegram-login-ios |
| Owner | Org `TelegramMessenger` (dibuat 2016, juga meng-host `Telegram-iOS`, `TGPassportAndroidSDK`, `TGMiniAppsJsSDK`) – [API org repos](https://api.github.com/orgs/TelegramMessenger/repos) | sama |
| Ditautkan dari docs resmi | Ya ([widgets/login](https://core.telegram.org/widgets/login)) | Ya |
| Lisensi | MIT, "Copyright (c) 2026 Telegram Messenger" ([LICENSE](https://github.com/TelegramMessenger/telegram-login-android/blob/main/LICENSE)) | MIT ([LICENSE](https://github.com/TelegramMessenger/telegram-login-ios/blob/main/LICENSE)) |
| Dibuat | 18 Apr 2026 ([API](https://api.github.com/repos/TelegramMessenger/telegram-login-android)) | 18 Apr 2026 ([API](https://api.github.com/repos/TelegramMessenger/telegram-login-ios)) |
| Commit | 4, terakhir 15 Jul 2026 ("Create LICENSE") | 2, terakhir 18 Apr 2026 |
| Rilis | Tidak ada tag/GitHub Release. Versi `1.0.0` hard-coded di `build.gradle.kts`. | Tag `1.0.0` (tanpa objek GitHub Release) |
| Distribusi | GitHub Packages `org.telegram:login-sdk:1.0.0`, **butuh PAT `read:packages`** ([README](https://github.com/TelegramMessenger/telegram-login-android#1-installation)). Tidak ada di Maven Central ([search.maven.org](https://search.maven.org/solrsearch/select?q=g:org.telegram+AND+a:login-sdk&wt=json): 0 hasil). | SPM dari URL repo |
| Ukuran | Repo 180 KB (termasuk gradle wrapper). Source 3 file Kotlin ±270 LOC. | Repo 44 KB. 1 file Swift ±330 LOC. |
| Committer | `supposd` ("Yuri Sh"), akun pribadi tanpa company ([API](https://api.github.com/users/supposd)). Akun ini juga yang menjawab issue atas nama tim. | sama |
| Issue | 20 (banyak spam). Issue teknis ditanggapi Mei–Jul 2026. | 16. #13 dan #16 (Agu–Okt 2026) belum ada balasan maintainer. |

**Tidak dapat diverifikasi:** identitas `supposd` sebagai karyawan Telegram. Profilnya tidak mencantumkan afiliasi. Kepercayaan kita bertumpu pada fakta bahwa repo berada di org resmi dan ditautkan dari core.telegram.org. API publik GitHub mengembalikan `is_verified: False` untuk org ini (tanpa autentikasi; nilai bisa berbeda dengan token).

### 2.2 Android (`org.telegram.login`)
- **Dependensi langsung** ([libs.versions.toml](https://github.com/TelegramMessenger/telegram-login-android/blob/main/gradle/libs.versions.toml)): `androidx.core:core-ktx:1.13.1`, `androidx.browser:browser:1.8.0` (Custom Tabs), `kotlinx-coroutines-android:1.7.3`. Semua dari Google/JetBrains. Toolchain: AGP 8.5.2, Kotlin 1.9.0, compileSdk 34, minSdk 23, Java 8 target. Pohon transitif penuh **belum dicetak** karena build tidak dijalankan (read-only). Pohon itu harus dicek dengan `./gradlew :app:dependencies` saat integrasi.
- **Manifest library** ([AndroidManifest.xml](https://github.com/TelegramMessenger/telegram-login-android/blob/main/TelegramLogin/src/main/AndroidManifest.xml)): `android.permission.INTERNET` dan `<queries><intent VIEW scheme="tg"/></queries>` untuk package visibility. Tidak ada izin lain, activity, service, receiver, atau provider.
- **Manifest app (wajib kita tambah):** activity callback `singleTask` dengan intent-filter `autoVerify` untuk `https://app{appid}-login.tg.dev/tglogin`. Domain ini dibuat otomatis oleh Telegram ([README §3](https://github.com/TelegramMessenger/telegram-login-android#3-project-configuration-androidmanifestxml)). Package name + SHA-256 signing cert didaftarkan di BotFather.
- **Endpoint jaringan** ([TelegramLogin.kt](https://github.com/TelegramMessenger/telegram-login-android/blob/main/TelegramLogin/src/main/java/org/telegram/login/TelegramLogin.kt)):
  - `GET https://oauth.telegram.org/crossapp?...&android_sdk=1`: **endpoint tidak terdokumentasi**, mengembalikan URL `tg://` untuk membuka app Telegram.
  - Fallback `https://oauth.telegram.org/auth` via Custom Tabs.
  - `POST https://oauth.telegram.org/token`.
  - Tidak ada host lain.
- **Red flags / temuan:**
  1. Tidak ada `state` dan tidak ada `nonce` (L115–174).
  2. `codeVerifier` hanya disimpan di memori singleton (L30). Kalau proses Android di-kill saat user di app Telegram, `handleLoginResponse` memanggil `requireNotNull(...)` dan **melempar `IllegalArgumentException` (crash)**, bukan memanggil `onError` (L90–92).
  3. `CoroutineScope(Dispatchers.Main)` global memegang referensi `Context`/Activity, jadi ada potensi leak kecil (L32, L53).
  4. Contoh README me-*log* `idToken` (`Log.d(... "Token: $idToken")`). Jangan ditiru.
  5. Positif: PKCE S256 dengan `SecureRandom` 32 byte (L229–238), tidak ada WebView (memakai Custom Tabs), tidak ada telemetri/analytics, `isMinifyEnabled=false`, dan consumer ProGuard hanya `-keep` 3 kelas publik.

### 2.3 iOS (`TelegramLogin`, SPM)
- **Dependensi:** nol. Hanya `Foundation`, `AuthenticationServices`, `CryptoKit`, dan `UIKit` ([Package.swift](https://github.com/TelegramMessenger/telegram-login-ios/blob/main/Package.swift)). iOS ≥ 15.
- **Entitlements/Info.plist yang kita perlukan:**
  - Associated Domains `applinks:app{appid}-login.tg.dev` (disarankan) atau URL scheme custom sebagai fallback ([README §3](https://github.com/TelegramMessenger/telegram-login-ios#3-project-configuration-xcode)). Bundle ID + Team ID didaftarkan di BotFather.
  - **Temuan:** SDK memanggil `UIApplication.shared.canOpenURL("tg://resolve")` ([source L97–99](https://github.com/TelegramMessenger/telegram-login-ios/blob/main/Sources/TelegramLogin/TelegramLogin.swift)). Apple mewajibkan skema yang dicek lewat `canOpenURL` dideklarasikan di `LSApplicationQueriesSchemes` ([Apple docs canOpenURL](https://developer.apple.com/documentation/uikit/uiapplication/canopenurl(_:))). README tidak menyebut ini. **Tanpa `tg` di `LSApplicationQueriesSchemes`, SDK selalu jatuh ke web fallback.**
- **Endpoint jaringan:** sama seperti Android (`/crossapp?ios_sdk=1`, `/auth`, `/token`) memakai `URLSession.shared`. Web fallback memakai `ASWebAuthenticationSession` dengan `prefersEphemeralWebBrowserSession = false`, jadi cookie Safari ikut dipakai (L176–200).
- **Red flags / temuan:**
  1. Tidak ada `state` atau `nonce`.
  2. **`openid` tidak ditambahkan otomatis.** iOS mengirim `scopes` apa adanya (L211, L240), sedangkan Android menambahkannya (L240–246). Contoh README iOS (`["profile","phone"]`) tidak memuat `openid`, padahal docs bilang `openid` wajib. → Kita harus selalu mengirim `["openid","profile"]`.
  3. State global statis (`_codeVerifier`, `_pendingCompletion`) bisa membuat login paralel saling menimpa.
  4. Issue terbuka [#13](https://github.com/TelegramMessenger/telegram-login-ios/issues/13): `POST /token` gagal `-1005` karena koneksi `/crossapp` yang basi dipakai ulang.
  5. Issue terbuka [#16](https://github.com/TelegramMessenger/telegram-login-ios/issues/16): host `*-login.tg.dev` menyajikan AASA kedua di root, sehingga web fallback iOS 17.4+ bisa langsung `.cancelled`.
  6. Positif: PKCE S256 via `SecRandomCopyBytes`, tidak ada WebView, dan tidak ada telemetri.

### 2.4 Paket Flutter di pub.dev (semuanya **pihak ketiga**, tidak ada yang resmi)
Data dari `pub.dev/api/packages/<nama>`:
| Paket | Versi / tgl | Publisher | Catatan |
|---|---|---|---|
| [telegram_login](https://pub.dev/packages/telegram_login) | 1.2.1 / 27 Apr 2026 | khode.io | Wrapper SDK native |
| [telegram_native_auth](https://pub.dev/packages/telegram_native_auth) | 1.0.2 / 11 Okt 2026 | uzairqaiser.com | Wrapper SDK native |
| [flutter_telegram_auth](https://pub.dev/packages/flutter_telegram_auth) | 0.1.6 / 14 Mei 2026 | mr-nodir.uz | Android/iOS/Web |
| [telegram_login_oidc_flutter](https://pub.dev/packages/telegram_login_oidc_flutter) | 0.0.4 / 10 Jun 2026 | wesleymoy.com | OIDC |
| [telegram_login_flutter](https://pub.dev/packages/telegram_login_flutter) | 1.0.1 / 15 Mei 2025 | sonextech.com | OAuth lama + `html` |
| [telegram_auth_flutter](https://pub.dev/packages/telegram_auth_flutter) | 0.1.1 / 6 Nov 2025 | (tanpa publisher) | polling |
| [flutter_telegram_login](https://pub.dev/packages/flutter_telegram_login) | 0.0.2 / 14 Okt 2022 | dart.cawa.dev | usang |

Paket-paket ini belum direview kodenya dan tidak dibutuhkan. Lapisan Flutter yang kita perlukan hanya ±100 LOC MethodChannel, jadi menulis sendiri lebih aman daripada menambah satu pemelihara pihak ketiga ke jalur autentikasi.

### 2.5 Isu operasional yang diketahui (dari issue resmi)
- Layar persetujuan menampilkan **"Unverified App"** sampai app terbit di store. Menurut maintainer, verifikasi otomatis berlangsung "within a week of being published to the Google Play Store" ([android#5](https://github.com/TelegramMessenger/telegram-login-android/issues/5)) dan "within 24 hours of appearing in the respective app stores" ([ios#8](https://github.com/TelegramMessenger/telegram-login-ios/issues/8)). Spesifikasi protokol juga mewajibkan teks "Unverified App" kalau `verified_app_name` kosong ([url-authorization](https://core.telegram.org/api/url-authorization)). → Selama internal/TestFlight, user akan melihat "Unverified App".
- AAB dengan Play App Signing masih "Unverified" setelah 10+ hari ([android#18](https://github.com/TelegramMessenger/telegram-login-android/issues/18), terbuka). → Daftarkan SHA-256 **app signing key** dari Play Console, bukan upload key.
- Kembali otomatis ke app di iOS diperbaiki di Telegram iOS 12.9. Versi lama memakai halaman "tap and hold" ([ios#8](https://github.com/TelegramMessenger/telegram-login-ios/issues/8)).
- Telegram Android < 12.4 dulu gagal diam-diam, dan maintainer menyatakan sudah diperbaiki ([android#4](https://github.com/TelegramMessenger/telegram-login-android/issues/4)). Telegram X tidak menangani intent ini ([android#7](https://github.com/TelegramMessenger/telegram-login-android/issues/7), terbuka). Loading tanpa akhir kalau user logout di Telegram ([android#6](https://github.com/TelegramMessenger/telegram-login-android/issues/6), terbuka).
- PR `SECURITY.md` belum di-merge ([android PR#16](https://github.com/TelegramMessenger/telegram-login-android/pull/16), [ios PR#11](https://github.com/TelegramMessenger/telegram-login-ios/pull/11)), jadi tidak ada kebijakan pelaporan kerentanan resmi di repo.

---

## 3. Perbandingan

| Aspek | SDK resmi + OIDC | Deep link custom (`t.me/<bot>?start=<nonce>`) |
|---|---|---|
| **Pengikatan sesi** | Kode dikirim ke App Link/Universal Link `app{id}-login.tg.dev` yang terverifikasi ke app kita di perangkat yang menyetujui. PKCE mengikat kode ke instance app yang memulai ([README Android](https://github.com/TelegramMessenger/telegram-login-android#redirect-uri-configuration), [README iOS](https://github.com/TelegramMessenger/telegram-login-ios#redirect-uri-configuration)). | Server mengikat `telegram_id` ke nonce. Siapa pun yang memegang nonce (pihak yang memulai) mendapat sesi. |
| **Phishing / login-CSRF** | Prompt Telegram menampilkan bot, platform, browser, IP, dan region, plus `match_codes` dan `verified_app_name`/"Unverified App" ([url-authorization](https://core.telegram.org/api/url-authorization)). Penyerang yang mengirim link login ke korban tidak menerima kode, karena kode mendarat di perangkat korban. | **Rentan secara desain** (analisis kami): penyerang memulai login, lalu mengirim `t.me/<bot>?start=<nonceMilikPenyerang>` ke korban. Kalau korban menekan Start, bot mengikat akun korban ke sesi penyerang. Parameter start dikirim "without any user input" begitu link dibuka ([Bot features: deep linking](https://core.telegram.org/bots/features#deep-linking)). Mitigasinya harus kita buat sendiri: konfirmasi di bot dengan perangkat/lokasi + match code. |
| **Replay** | `id_token` adalah bearer, valid sampai `exp` (contoh docs 1 jam; nilai sebenarnya belum terverifikasi). Tanpa nonce dari SDK, kita butuh single-use (hash token), jendela `iat` pendek, dan rate-limit. | Nonce single-use, TTL 5 menit, sudah sesuai rencana. |
| **Verifikasi token** | Kriptografis (JWKS RS256/ES256) di Edge Function. | Kepercayaan pada update webhook bot (secret token webhook) + DB. Tidak ada artefak yang bisa diverifikasi kriptografis. |
| **Tap & UX** | Tap tombol → app Telegram terbuka dengan dialog konfirmasi → Confirm → otomatis kembali. ±2 tap. | Tap → Telegram terbuka di chat bot → Start (+ tombol konfirmasi kalau ditambahkan) → kembali via link. ±2–3 tap. Untuk user lama, Start bisa tidak muncul dan perlu tombol inline. |
| **Telegram tidak terpasang** | Ada fallback web (Custom Tabs / `ASWebAuthenticationSession`) ([README iOS §5](https://github.com/TelegramMessenger/telegram-login-ios#5-login--callbacks)), tetapi ada bug fallback ([ios#16](https://github.com/TelegramMessenger/telegram-login-ios/issues/16), [#15](https://github.com/TelegramMessenger/telegram-login-ios/issues/15)). | Membuka t.me di browser lalu harus pasang Telegram/Telegram Web. Lebih buruk. |
| **App Store / Play** | Bukan WebView. Pedoman 4.8 mewajibkan opsi login setara kalau memakai login pihak ketiga ([App Review Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services)), dan kita sudah punya Apple/email OTP. Risiko rendah. | Sama soal 4.8. Alur keluar ke app lain lewat chat bot lebih sulit dipahami reviewer. Risiko rendah–sedang. |
| **Pemeliharaan** | Tergantung SDK v1.0.0 yang baru, dengan bug terbuka dan endpoint `/crossapp` tak terdokumentasi. Kalau Telegram mengubah API, mereka yang memperbaiki SDK. | Sepenuhnya milik kita: bot handler, tabel nonce, polling/return, plus layar konfirmasi anti-phishing yang harus dibuat sendiri. |
| **Kerja backend** | Edge Function verifikasi JWKS + tabel `used_id_tokens` + mint JWT (±1 hari). Ditambah pendaftaran app di BotFather (package+SHA-256, bundle+Team ID). | Edge Function nonce + webhook bot + tabel nonce + endpoint exchange + konfirmasi bot (±2–3 hari). |

---

## 4. Rekomendasi & syarat

**Pakai SDK resmi Telegram + OIDC, dibungkus plugin Flutter milik kita sendiri.** Syaratnya:

1. **Jangan pakai paket pub.dev mana pun.** Vendor source resmi ke `apps/mobile/android/.../telegram/` dan untuk iOS pakai SPM pinned ke tag `1.0.0`/commit `215851d` (atau vendor 1 file Swift). Android di-pin ke `f9d5ec3`, dan file `LICENSE` MIT disertakan. Ini menghindari PAT GitHub Packages dan memastikan kode yang di-review sama dengan yang di-ship.
2. **Patch kecil saat vendoring (MIT mengizinkan):**
   - iOS: paksa scope `["openid","profile"]`.
   - Android: ganti `requireNotNull` di `handleLoginResponse` dengan `onError`, supaya tidak crash setelah process death.
   - Jangan pernah log `idToken`.
   - Info.plist: tambah `LSApplicationQueriesSchemes = [tg]`.
3. **Scope minimal:** `openid profile`. **Jangan** minta `phone` atau `telegram:bot_access` di MVP. Notifikasi bot berjalan lewat jalur bind bot yang terpisah.
4. **Edge Function `auth-telegram-oidc` wajib:**
   - Verifikasi signature lewat JWKS (cache, hormati `kid`) dan whitelist alg `RS256`/`ES256`.
   - Cek `iss`, `aud == CLIENT_ID`, `exp`, `iat` ≥ now − 120 s.
   - Wajib ada claim `id`.
   - **Single-use:** simpan `sha256(id_token)` dengan unique constraint sampai `exp`.
   - Rate-limit per IP/perangkat. Mint JWT Supabase TTL pendek seperti alur Telegram yang sudah disepakati Backend.
   - Login wallet tetap tidak pernah trading (keputusan Backend).
5. **Uji sebelum adopsi penuh (belum terverifikasi):**
   - (a) apakah `/auth`/`/crossapp` menerima `nonce` dan memasukkannya ke `id_token`. Kalau ya, fork kita meneruskan nonce dari server dan Edge Function mewajibkannya.
   - (b) TTL `id_token` sebenarnya.
   - (c) perilaku "Unverified App" di build internal.
6. **Rilis:**
   - Daftarkan SHA-256 Play App Signing key + debug/upload key.
   - Siapkan teks UX untuk "Unverified App" selama beta.
   - Uji di Telegram Android ≥ 12.4, Telegram iOS ≥ 12.9, tanpa Telegram, dan dengan Telegram X.
7. **Deep link custom:** hapus dari rencana. Kalau dibutuhkan sebagai fallback selama SDK bermasalah, aktifkan di belakang feature flag dan **wajib** ada layar konfirmasi di bot (nama perangkat, kota/IP, match code 2 digit yang juga tampil di app) sebelum binding.
8. Sesuai aturan Boss, **install baru dilakukan setelah review ini disetujui**.

Kalau syarat 1–4 tidak bisa dipenuhi, pertahankan deep link custom dengan mitigasi di poin 7.

---

## 5. Sketsa integrasi (Flutter + Supabase)

```
App (Flutter)                 Plugin native (vendored)         Telegram           Edge Function            Supabase
TelegramAuth.login() ──MethodChannel──► TelegramLogin.start ──/crossapp──► app Telegram (Confirm)
                                         ◄── app link app{id}-login.tg.dev?code=…
                                         POST /token (PKCE) → id_token
 ◄────────────── id_token ───────────────
 POST /functions/v1/auth-telegram-oidc {id_token, device_id}
                                                              verify JWKS/iss/aud/exp/iat
                                                              single-use hash, upsert user(telegram_id=id)
                                                              mint JWT (TTL pendek) ─────► setSession
```

**Dart (antarmuka, tanpa dependensi baru):**
```dart
abstract interface class TelegramAuth {
  /// Mengembalikan id_token mentah; JANGAN di-log / disimpan.
  Future<String> signIn();
}

final class MethodChannelTelegramAuth implements TelegramAuth {
  static const _ch = MethodChannel('sentra/telegram_login');
  @override
  Future<String> signIn() async {
    final token = await _ch.invokeMethod<String>('signIn');
    if (token == null) throw const AuthFailure('tg_no_token');
    return token;
  }
}

// AuthRepository
Future<void> signInWithTelegram() async {
  final idToken = await _tg.signIn();
  final res = await _supabase.functions.invoke('auth-telegram-oidc',
      body: {'id_token': idToken});
  final data = res.data as Map<String, dynamic>;
  await _supabase.auth.setSession(data['refresh_token'] as String);
}
```
- Android: `MainActivity` (`launchMode="singleTask"`) meneruskan `onNewIntent` yang host-nya `app{id}-login.tg.dev` ke `TelegramLogin.handleLoginResponse`. Matikan deep-link handling bawaan Flutter untuk host ini, supaya router tidak ikut menangkap URL tersebut.
- iOS: `AppDelegate`/`SceneDelegate` meneruskan URL host yang sama ke `TelegramLogin.handle(url)`. Tambahkan entitlement `applinks:app{id}-login.tg.dev` dan `LSApplicationQueriesSchemes: [tg]`.

**Edge Function (Deno, sketsa):**
```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
const JWKS = createRemoteJWKSet(new URL("https://oauth.telegram.org/.well-known/jwks.json"));

const { payload } = await jwtVerify(idToken, JWKS, {
  issuer: "https://oauth.telegram.org",
  audience: Deno.env.get("TG_CLIENT_ID")!,
  algorithms: ["RS256", "ES256"],
  maxTokenAge: "120s",            // cek iat
});
if (typeof payload.id !== "number") throw err("AUTH_TG_NO_PROFILE");
const h = await sha256hex(idToken);
// INSERT INTO auth_tg_used_tokens(hash, exp) — unique(hash) → conflict = replay
// upsert profiles(telegram_id = payload.id, tg_sub = payload.sub)
// mint sesi Supabase sama seperti alur Telegram/SIWS yang sudah disepakati Backend
```
Kode error baru (mis. `AUTH_TG_REPLAY`, `AUTH_TG_INVALID`, `AUTH_TG_NO_PROFILE`) perlu ditambahkan Backend ke `errors.json`, lalu generator Dart kita akan mengambilnya.

---

## 6. Hal yang belum/tidak dapat diverifikasi
- Apakah `nonce` didukung di `/auth` atau `/crossapp` (selain library JS).
- TTL `id_token` yang sebenarnya.
- Identitas/afiliasi akun `supposd`.
- Pohon dependensi transitif Android lengkap (build tidak dijalankan).
- Apakah dashboard Supabase mengekspos opsi skip nonce untuk provider `custom:`, dan claim mana yang dipakai sebagai provider ID.
- Spesifikasi resmi endpoint `/crossapp`.
