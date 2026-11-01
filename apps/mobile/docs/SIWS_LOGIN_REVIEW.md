# Review Login SIWS (Sign-In With Solana) via Phantom — Sentra mobile (Flutter)

- Tanggal review: 29 Okt 2026, ±18:40 WIB (UTC+7)
- Sifat: **read-only**. Tidak ada paket yang di-install ke project mana pun. Source di-clone untuk dibaca saja ke `/workspace/dev_team/siws_review/`.
- Konteks: app privat (hanya Boss), backend Supabase + API Sentra, wewenang app terbatas trading, private key **tidak pernah** ada di app.
- Backend yang direview: `services/backend` commit `a639d43` (auth SIWS, kontrak 1.1.4 + "Unreleased: wallet login").
- Source yang dibaca (commit):
  - `solana-mobile/mobile-wallet-adapter` `e7d34f8` (23 Okt 2026, 05:35 WIB)
  - `phantom/sign-in-with-solana` `6f085ac` (13 Feb 2025)
  - `phantom-labs/deep-link-demo-app` `9d044f6` (24 Feb 2026)
  - `espresso-cash-public` (paket `solana_mobile_client`, `solana`) snapshot 10 Apr 2026
  - arsip pub.dev: `pinenacl-0.6.0`, `cryptography-2.9.0`, `solana_mobile_client-0.1.2`, `app_links-7.2.2`, `gotrue-2.27.3`
  - `supabase/auth` `fcc491d` (pembanding saja)

Label: **[Terverifikasi]** = dibaca langsung di source/dokumen resmi yang dikutip. **[Belum terverifikasi]** = belum dites di perangkat, atau sumbernya bukan resmi.

---

## 0. Ringkasan (TL;DR)

**Rekomendasi.** Android memakai **MWA 2.0** lewat plugin Kotlin tipis milik kita di atas library resmi `com.solanamobile:mobile-wallet-adapter-clientlib-ktx` (2.0.8). Alurnya `authorize` lalu `sign_messages` atas pesan SIWS **yang dibangun server** dalam satu sesi MWA. iOS (dan fallback Android) memakai **deeplink Phantom** `https://phantom.com/ul/v1/connect` + `/ul/v1/signMessage` dengan enkripsi x25519/NaCl box via `pinenacl`. Verifikasinya memakai endpoint backend yang **sudah ada** (`/v1/auth/siws/nonce` → `/verify` → `/session/refresh` / `/logout`).

Kita **tidak** memakai method `signIn` versi wallet (MWA `sign_in_payload` atau deeplink `signIn`). Verifier backend sengaja strict: hanya menerima pesan persis seperti yang dibangun server, sedangkan `signIn` membuat wallet menyusun pesannya sendiri (§5.2).

Paket minimum (semuanya **belum di-install**, butuh review + approval Boss):
- `pinenacl` (enkripsi deeplink),
- `flutter_secure_storage` (refresh token),
- plugin MWA milik kita sendiri (di-vendor, Android saja).

Base58 kita tulis sendiri (±40 baris, seperti `services/backend/api/src/base58.ts`). Penerimaan link memakai deep linking bawaan Flutter + `go_router` yang sudah ada, jadi tanpa `app_links` kalau tes perangkat lulus.

Paket Flutter pihak ketiga khusus Phantom/wallet (`phantom_connect`, `solana_wallet_adapter`) **ditolak** (§4).

Risiko terbesar: **phishing relay**. Alamat owner itu publik, jadi app/situs penyerang bisa meminta nonce untuk alamat owner lalu membujuk owner menandatangani pesan berdomain Sentra. Verifikasi domain oleh Phantom untuk deeplink native **belum terverifikasi**. Mitigasinya di §6 dan item Backend B-1, B-2 dan B-6 di §7.

---

## 1. Opsi resmi Phantom

### 1.1 Deeplink Phantom [Terverifikasi]
- Format method: `https://phantom.com/ul/<version>/<method>`. Skema custom `phantom://` bisa dipakai tetapi "not recommended". `phantom.app` diganti `phantom.com`. Sumber: https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android
- Method yang **didokumentasikan**: Connect, Disconnect, SignAndSendTransaction, SignAllTransactions, SignTransaction, SignMessage. Sumber: https://docs.phantom.com/phantom-deeplinks/provider-methods/README
- **`/ul/v1/connect`**: parameter `app_url` (wajib, disimpan di session untuk validasi/blocklist), `dapp_encryption_public_key` (wajib), `redirect_link` (wajib, juga dipakai untuk mengambil metadata app), `cluster` (opsional). Respons: `phantom_encryption_public_key`, `nonce`, `data` (terenkripsi, isinya `public_key` + `session`). Error dikembalikan sebagai `errorCode`/`errorMessage`. Sumber: https://docs.phantom.com/phantom-deeplinks/provider-methods/connect
- **`/ul/v1/signMessage`**: `dapp_encryption_public_key`, `nonce`, `redirect_link`, dan `payload` terenkripsi `{message (base58), session, display: utf8|hex}`. Respons `data` terenkripsi `{signature}` (base58). Sumber: https://docs.phantom.com/phantom-deeplinks/provider-methods/signmessage
- **Enkripsi**: Diffie-Hellman x25519. Dapp disarankan membuat keypair x25519 **baru per sesi connect**, Phantom membuat keypair sendiri, dan shared secret dipakai untuk mengenkripsi `data`/`payload`. Library acuan: TweetNaCl (JS), tweetnacl-swiftwrap (iOS), Tink / TweetNaCl Java (Android). Sumber: https://docs.phantom.com/phantom-deeplinks/encryption. Demo resmi memakai `nacl.box.before` (shared key) lalu `nacl.box.after` / `nacl.box.open.after` dengan nonce acak 24 byte, yaitu XSalsa20-Poly1305. Sumber: https://github.com/phantom-labs/deep-link-demo-app/blob/9d044f6ea8e44b23356791f570a86c94daab4070/App.tsx (baris 57–69, 123–141).
- **Session**: base58 dari (signature 64 byte ‖ JSON `{app_url, timestamp, chain, cluster}`) dan **tidak pernah kedaluwarsa** sampai disconnect atau dinyatakan invalid. Penyimpanannya tanggung jawab app. Sumber: https://docs.phantom.com/phantom-deeplinks/handling-sessions
- **redirect_link**: kalau HTTPS, metadata app tampil di dialog tetapi redirect **terbuka di browser**, bukan kembali ke app. Kalau skema custom, kembali ke app tetapi tanpa metadata. Sumber: https://docs.phantom.com/phantom-deeplinks/specifying-redirects
- Batas ukuran: Android ±500 KB per intent, iOS ±1 MB. Sumber: https://docs.phantom.com/phantom-deeplinks/limitations
- **Native `signIn` via deeplink**: tidak ada di dokumentasi. Namun demo resmi Phantom memanggil `buildUrl("signIn", ...)` dengan `payload` = base58(JSON `signInInput`), **tidak terenkripsi**, dan respons terenkripsi berisi `address`/`public_key` + `session`. Sumber: App.tsx baris 238–265 dan 136–153 pada commit di atas. Status: **[Belum terverifikasi / tidak terdokumentasi]**. Field respons pastinya (`signed_message`, `signature`) tidak tampak di demo, jadi jangan dijadikan jalur utama.

### 1.2 Standar SIW di Phantom [Terverifikasi]
- Phantom mengenali pesan SIWS/SIWE/CAIP-122 pada `signMessage` dan memvalidasi field-nya. **Peringatan**: `domain` harus sama dengan host halaman peminta, dan origin `uri` harus sama dengan origin peminta. Kalau tidak sama, hasilnya error `-32000 Invalid Input` tanpa prompt. Sumber: https://docs.phantom.com/developer-powertools/signing-a-message
- Untuk deeplink/MWA native, apa yang dianggap Phantom sebagai "origin peminta" (`app_url`? host `redirect_link`? `identity.uri` MWA?) **[Belum terverifikasi]**. Ini wajib dites di perangkat (§8, T-1).

### 1.3 Phantom Connect / SDK mobile [Terverifikasi]
- Phantom Connect SDK hanya tersedia untuk **React, React Native, dan Browser**. Tidak ada SDK Flutter maupun Swift/Kotlin native, dan pencarian "flutter" di seluruh docs Phantom tidak menemukan hasil. Sumber: https://docs.phantom.com/phantom-connect dan https://docs.phantom.com/resources/faq
- React Native SDK **selalu memakai embedded wallet** (login Google/Apple, butuh App ID Phantom Portal). Ini bukan wallet Phantom milik Boss yang sudah ada. Sumber: https://docs.phantom.com/resources/faq ("The React Native SDK always uses embedded wallets") dan https://docs.phantom.com/sdks/react-native-sdk/connect. Jadi **tidak cocok** untuk kebutuhan kita, apalagi stack kita Flutter.

## 2. Solana Mobile Wallet Adapter (MWA)

- Spec versi **2.0.0**. Sumber: https://github.com/solana-mobile/mobile-wallet-adapter/blob/e7d34f8caa654f1bbac2272f732e614890cd60e9/spec/spec.md dan https://solana-mobile.github.io/mobile-wallet-adapter/spec/spec.html [Terverifikasi]
- `authorize` menerima `sign_in_payload` opsional (field input SIWS) dan mengembalikan `sign_in_result {address, signed_message, signature, signature_type}` (base64). Fitur ini **opsional** bagi wallet (`solana:signInWithSolana`, dicek lewat `get_capabilities`). Kalau tidak didukung, dapp menyusun pesan sendiri lalu memakai `sign_messages`. `sign_messages` wajib (mandatory). Sumber: spec di atas, bagian *authorize* dan *Feature Identifiers*. [Terverifikasi]
- **Hanya Android**, iOS tidak didukung. Sumber: https://docs.solanamobile.com/solana-mobile-stack/mobile-wallet-adapter dan spec §iOS ("planned for a future version"). [Terverifikasi]
- Client Android resmi: `com.solanamobile:mobile-wallet-adapter-clientlib-ktx`, versi terbaru di Maven Central **2.0.8** (rilis 18 Jun 2025, 02:01 WIB), lisensi Apache-2.0. API: `MobileWalletAdapter.transact`, `signIn(sender, SignInWithSolana.Payload(...))`, `signMessagesDetached`. Sumber: https://search.maven.org/artifact/com.solanamobile/mobile-wallet-adapter-clientlib-ktx, https://docs.solanamobile.com/android-native/using_mobile_wallet_adapter, dan LICENSE di repo. [Terverifikasi]
- Dependensi clientlib-ktx: `com.solanamobile:web3-solana` 0.3.1, androidx core/activity, dan `nv-websocket-client` (lewat clientlib). minSdk 24. Sumber: `android/clientlib-ktx/build.gradle`, `android/clientlib/build.gradle`, `android/gradle/libs.versions.toml` di commit `e7d34f8`. [Terverifikasi]
- Izin yang ditambahkan manifest clientlib: `INTERNET`, `ACCESS_NETWORK_STATE`, plus `<queries>` untuk skema `solana-wallet:`. Transport-nya WebSocket **lokal** (localhost) ke app wallet. Sumber: `android/clientlib/src/main/AndroidManifest.xml` dan https://docs.solanamobile.com/solana-mobile-stack/mobile-wallet-adapter. [Terverifikasi]
- **Phantom mendukung MWA** di Android [Terverifikasi]. Docs Phantom menjelaskan verifikasi identitas app native lewat MWA: Phantom mengecek `/.well-known/assetlinks.json` di domain `identity.uri`. Kalau gagal, muncul peringatan "This app's identity could not be verified. It may be impersonating another app." Sumber: https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings
- **Phantom mendukung `sign_in_payload` via MWA**: hanya diklaim oleh situs pihak ketiga (https://juiiceee-synto-mobile-90.mintlify.app/features/mobile-wallet-adapter). README SIWS resmi masih menulis "Currently SIWS is only supported on Phantom extension (version >=23.11.0)" (https://github.com/phantom/sign-in-with-solana, baris 500). Status: **[Belum terverifikasi]**. Untungnya tidak kita butuhkan, karena kita memakai `sign_messages` (§5.2).
- Issue terbuka yang relevan: bug chain/cluster saat signing dengan Phantom/Solflare (https://github.com/solana-mobile/mobile-wallet-adapter/issues/958) dan bug Phantom `signAndSendTransactions` tanpa `minContextSlot` (https://github.com/solana-mobile/mobile-wallet-adapter/issues/1146). Keduanya tidak menyentuh `sign_messages` untuk login, tetapi tetap perlu dicatat.

## 3. Spec SIWS / CAIP-122 [Terverifikasi]

- Format pesan (ABNF), dengan semua field opsional di sisi input dan dirakit wallet kalau memakai `signIn`:
  ```
  ${domain} wants you to sign in with your Solana account:
  ${address}

  ${statement}

  URI: ${uri}
  Version: 1
  Chain ID: ${chain-id}
  Nonce: ${nonce}
  Issued At: ${issued-at}
  Expiration Time: ${expiration-time}
  Not Before: ...
  Request ID: ...
  Resources:
  - ...
  ```
  Nonce minimal 8 karakter alfanumerik. Untuk Phantom, `issuedAt` harus berada dalam ±10 menit. Sumber: https://github.com/phantom/sign-in-with-solana (bagian *Sign-In Input Fields* dan *ABNF Message Format*) dan https://docs.phantom.com/developer-powertools/signing-a-message
- Verifikasi server menurut spec: parse pesan, cocokkan field dengan input (domain, address, nonce, dst.), rakit ulang, lalu verifikasi Ed25519 (`verifySignIn` di `@solana/wallet-standard-util`). Sumber: README SIWS bagian *Sign-In Output Verification*.
- CAIP-122 (Sign-In with X) memakai CAIP-10 untuk address dan CAIP-2 untuk chain-id. Sumber: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-122.md (dirujuk dari docs Phantom di atas).
- Pembanding: Supabase Auth punya grant `web3` (Solana) native, `signInWithWeb3` di `gotrue` Dart 2.27.x. Di grant ini **nonce tidak dicek single-use**: hanya jendela `issuedAt` ±10 menit plus URI/domain yang harus ada di Redirect URLs. Sumber: https://supabase.com/docs/guides/auth/auth-web3 dan https://github.com/supabase/auth/blob/fcc491d6d7665718b62f50598d723fde1e9b6c4a/internal/api/web3.go (baris 54–115). Karena backend kita **sudah** punya nonce single-use sendiri, jalur Supabase native **tidak dipakai**.

## 4. Paket Flutter / native: hasil review

Data pub.dev diambil dari `https://pub.dev/api/packages/<nama>` (versi, tanggal rilis, dependensi) dan `/publisher` / `/score` (publisher, lisensi, platform). Data repo diambil dari GitHub API, dicek 29 Okt 2026. CVE dicek lewat https://api.osv.dev: hasilnya **0 advisory** untuk `pinenacl`, `cryptography`, `solana`, `app_links` (ekosistem Pub) dan `mobile-wallet-adapter-clientlib-ktx` (Maven). Itu bukan bukti aman, hanya tidak ada laporan.

| Paket | Publisher | Repo / lisensi | Rilis terakhir | Dependensi langsung | Izin / endpoint | Temuan | Status |
|---|---|---|---|---|---|---|---|
| **Plugin MWA milik kita** (Kotlin, MethodChannel) di atas `mobile-wallet-adapter-clientlib-ktx` 2.0.8 | Solana Mobile Inc. (Maven `com.solanamobile`) | github.com/solana-mobile/mobile-wallet-adapter, Apache-2.0 | 18 Jun 2025 (repo aktif, push 23 Okt 2026) | web3-solana 0.3.1, androidx, nv-websocket-client | `INTERNET`, `ACCESS_NETWORK_STATE`, `<queries solana-wallet>`; WebSocket localhost | Resmi, mendukung MWA 2.0 (`signIn`, `signMessagesDetached`). Perlu review transitive `web3-solana` dan nv-websocket | **DIREKOMENDASIKAN** (Android). Review kode belum, butuh approval Boss |
| `solana_mobile_client` 0.1.2 | cryptoplease.com (verified) | espresso-cash-public (repo **dipindah** ke `brij-digital/espresso-cash-public`), MIT | 25 Mei 2025 | freezed_annotation, json_annotation, plugin_platform_interface | Native `mobile-wallet-adapter-clientlib:1.1.0` (**MWA 1.x**), manifest plugin kosong | Tidak mendukung `sign_in_payload` (tidak ada kata `signIn` di `lib/`). Android saja. Organisasi pemilik repo berganti | Cadangan saja, **tidak direkomendasikan** |
| `pinenacl` 0.6.0 | poolunder.com (verified) | github.com/ilap/pinenacl-dart, MIT | 22 Mei 2024 (push repo 8 Agu 2024, 0 issue terbuka) | **tidak ada** | Tanpa izin, tanpa jaringan (hanya URL dokumentasi di komentar) | Port TweetNaCl (`Box`, `PrivateKey`, Ed25519). Tidak ditemukan audit formal. Repo kurang aktif | **DIREKOMENDASIKAN** (deeplink x25519 box). Review kode + pin versi, butuh approval Boss |
| `cryptography` 2.9.0 | dint.dev (verified) | github.com/dint-dev/cryptography, Apache-2.0 | 21 Nov 2025 | collection, crypto, ffi, meta, typed_data | - | **Tidak punya XSalsa20** (grep `xsalsa\|salsa20` kosong), jadi tidak bisa NaCl box | Tidak dipakai |
| `solana` 0.32.0+1 | cryptoplease.com (verified) | espresso-cash-public, MIT | 10 Apr 2026 | bip39, ed25519_hd_key, http, web_socket_channel, cryptography, ... | RPC/WebSocket ke node Solana | Terlalu besar untuk login. Verifikasi Ed25519 dilakukan di server | Tidak dipakai |
| `phantom_connect` 0.0.8 | strawhat.xyz (verified) | **repo github.com/StrawHatXYZ/phantom_connect → HTTP 404**, BSD-3 | 30 Sep 2022 | flutter, pinenacl, solana | - | Source tidak bisa diaudit, tidak dipelihara 4 tahun, memakai domain lama `phantom.app` | **DITOLAK** |
| `solana_wallet_adapter` 0.1.5 | merigolabs.com (verified) | github.com/merigo-labs/solana-wallet-adapter, MIT | 4 Des 2023 | shared_preferences, solana_common, ... (8 paket) | - | Mati sejak 2023, 11 issue terbuka, memakai `shared_preferences` (rawan menyimpan token tanpa enkripsi, **[belum dicek di source]**) | **DITOLAK** |
| `flutter_secure_storage` 11.2.0 | steenbakker.dev (verified) | github.com/mogol/flutter_secure_storage, BSD-3 | 16 Sep 2026 | paket platform-nya sendiri | Keystore / Keychain | Populer dan aktif. Sudah masuk antrean review dari PERF_SECURITY | Review kode belum, butuh approval Boss |
| `app_links` 7.2.2 | cow-level.ovh (verified) | github.com/llfbandit/app_links, Apache-2.0 | 6 Okt 2026 | sub-paket platform | Manifest plugin kosong | Sehat. Tidak perlu kalau deep linking bawaan Flutter + `go_router` (sudah ada di pubspec) cukup (https://docs.flutter.dev/ui/navigation/deep-linking) | Opsional, hanya kalau tes T-3 gagal |
| `bs58` 1.0.2 | **tanpa publisher** | github.com/litaoh/base58, MIT | 17 Nov 2021 | base_x | - | Tidak dipelihara | **DITOLAK**: tulis base58 sendiri (±40 baris) |
| `ed25519_edwards` 0.3.2 | tanpa publisher | github.com/Tougee/ed25519, Apache-2.0 | 25 Agu 2026 | 4 paket | - | Tidak diperlukan (verifikasi di server) | Tidak dipakai |

## 5. Arsitektur yang direkomendasikan

### 5.1 Alur
**Android (utama), MWA 2.0 lewat plugin kita, satu sesi `transact`:**
1. `authorize(identity: {name: "Sentra", uri: "https://<DOMAIN_SENTRA>", icon})`. Wallet mengembalikan `accounts[0].address` (base64) dan app mengubahnya ke base58.
2. App memanggil `POST /v1/auth/siws/nonce {address, domain: "<DOMAIN_SENTRA>", uri: "https://<DOMAIN_SENTRA>", chain_id: "solana:mainnet"}` dan menerima `message`.
3. `sign_messages([utf8(message)], [address])`. Hasilnya signature base64, yang app ubah ke base58.
4. App memanggil `POST /v1/auth/siws/verify {address, message, signature, client: "mobile"}` dan menerima `Session`.
5. `auth_token` MWA **dibuang**, tidak disimpan, karena app tidak butuh tanda tangan transaksi.

**iOS (utama) dan fallback Android, deeplink Phantom:**
1. Buat keypair x25519 baru (`pinenacl`) yang hanya hidup di memori.
2. Buka `https://phantom.com/ul/v1/connect?app_url=https://<DOMAIN_SENTRA>&dapp_encryption_public_key=…&redirect_link=<redirect>&cluster=mainnet-beta`.
3. Saat redirect kembali, hitung shared secret dan dekripsi `data` untuk mendapat `public_key` + `session`.
4. Panggil `/v1/auth/siws/nonce` dan terima `message`.
5. Buka `https://phantom.com/ul/v1/signMessage` dengan `payload` terenkripsi `{message: base58(utf8(message)), session, display: "utf8"}`.
6. Dekripsi `signature`, lalu panggil `/v1/auth/siws/verify`.
7. Setelah sukses, buang keypair x25519, shared secret dan `session` Phantom. Opsional: kirim `/ul/v1/disconnect`.

Konsekuensinya ada **dua kali** perpindahan app, connect lalu signMessage. Ini diterima demi verifier strict.

### 5.2 Kenapa bukan `signIn` / `sign_in_payload`
`parseMessage()` di backend hanya menerima pesan yang **byte-per-byte** sama dengan `buildMessage()`: statement tetap, urutan field tetap, tanpa `Resources`/`Request ID`. Bukti: `services/backend/api/src/siws.ts` baris `RE` dan `return buildMessage(f) === m ? f : null`. Pada `signIn`, **wallet** yang merakit pesan dari input (README SIWS: "SIWS shifts the responsibility of message construction from dapps to the wallet"), jadi hasilnya hampir pasti tidak lolos parse strict. `sign_messages` / `signMessage` atas pesan server kompatibel dengan kedua jalur dan tetap dikenali Phantom sebagai SIWS (§1.2).

### 5.3 Deep link hijacking
- **Keluar ke Phantom**: selalu `https://phantom.com/ul/...` (Universal Link/App Link milik Phantom), **bukan** `phantom://`. Skema custom bisa diklaim app lain. Sumber: https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android
- **Kembali ke Sentra**: docs Phantom menyatakan redirect HTTPS membuka browser (§1.1). Jadi kemungkinan besar kita perlu skema custom yang unik (mis. `com.sentra.app.auth://phantom`). Apakah Universal Link/App Link terverifikasi kita (AASA + `assetlinks.json` dengan `autoVerify`) tetap membuka app **[Belum terverifikasi]**: tes T-3.
  - Kalau tetap memakai skema custom, app lain bisa menangkap redirect. Dampaknya terbatas. Payload `data` terenkripsi ke kunci x25519 sesaat milik kita, jadi penyadap tidak bisa membacanya. Pemalsuan juga tidak berguna, karena server memverifikasi signature Ed25519, nonce single-use dan allowlist. Yang tersisa adalah DoS (redirect "dicuri") dan phishing UI.
  - Mitigasinya: validasi `state` lokal, yaitu menyimpan `dapp_encryption_public_key` yang sedang aktif dan menolak respons yang tidak cocok. Respons diterima hanya dalam jendela login aktif (≤5 menit).
- **MWA**: wallet memverifikasi app kita lewat `assetlinks.json` di domain `identity.uri`. Nama paket `com.sentra.app` dan SHA-256 sertifikat signing harus cocok. Kalau memakai Play App Signing, pakai fingerprint kunci app signing, bukan upload key. Sumber: https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings dan https://developer.android.com/training/app-links/verify-android-applinks
- **iOS Universal Links**: butuh entitlement Associated Domains + `apple-app-site-association` di domain kita. Sumber: https://developer.apple.com/documentation/xcode/supporting-associated-domains

### 5.4 Penyimpanan di perangkat
| Data | Tempat | Umur |
|---|---|---|
| Keypair x25519 dapp, shared secret | Memori saja | Satu percobaan login, lalu di-zero-kan |
| `session` Phantom (tidak kedaluwarsa!) | **Tidak disimpan** | Dibuang setelah login |
| `auth_token` MWA | **Tidak disimpan** | Dibuang |
| Access token (15 menit) | Memori | Sampai `exp` |
| Refresh token `srt_…` (30 hari, rotasi) | Keystore/Keychain (`flutter_secure_storage`, setelah review). iOS `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, Android tanpa backup (`allowBackup=false`, sesuai PERF_SECURITY) | Sampai rotasi/logout |

Refresh harus **single-flight**, yaitu satu request refresh sekaligus. Backend mencabut seluruh family kalau token lama dipakai lagi (§7 B-4), jadi dua refresh paralel akan memaksa Boss login ulang.

## 6. Risiko utama

1. **Phishing relay (tinggi untuk Real SOL, sedang untuk Practice).** Alamat owner itu publik. Penyerang bisa memanggil `/v1/auth/siws/nonce` untuk alamat owner, mendapat pesan sah berdomain Sentra, lalu membujuk Boss menandatanganinya lewat app/deeplink milik penyerang. Phantom memvalidasi domain terhadap origin di web (§1.2) dan identitas app di MWA (§2), tetapi **untuk deeplink native validasinya belum terverifikasi**. Kalau tanda tangan didapat, penyerang mendapat sesi owner (scope `read`, `trade`).
   - Mitigasi: tes T-1/T-2. Ikat nonce ke **kunci perangkat** (B-6). Tambahkan Play Integrity / App Attest di `/verify` sebelum Fase 7. Statement di pesan tetap jelas.
2. **Replay**: tertutup di backend. Nonce 5 menit, single-use, terikat address + domain, dikonsumsi atomik (`consume_siws_nonce`). Signature salah ikut membakar nonce. Ada tes reuse, salah domain, kedaluwarsa dan tamper di `services/backend/api/test/auth.test.ts`.
3. **Allowlist fail-open**: `OWNER_WALLETS` kosong berarti **wallet apa pun boleh login** (`ownerOk` di `routes_auth.ts`, `config.ts`). Untuk app privat ini harus fail-closed (B-1).
4. **DoS penguncian login**: rate limit 5/menit **per address**, dan alamat owner publik. Siapa pun bisa menghabiskan kuota nonce/verify owner tanpa kunci apa pun (B-2).
5. **Redirect deeplink lewat skema custom** (§5.3): DoS/phishing UI, bukan bypass auth.
6. **Session Phantom tidak kedaluwarsa**. Kalau sampai bocor, app lain bisa meminta tanda tangan atas nama "Sentra" tanpa reconnect. Karena itu session tidak disimpan.
7. **Ketergantungan pada fitur tak terdokumentasi**: tidak ada, karena `signIn` deeplink tidak dipakai.

## 7. Review backend (`a639d43`) terhadap spec SIWS, beserta item untuk Backend

Yang sudah benar [Terverifikasi, dari source]:
- Pesan dibangun server, di-parse strict, lalu dibandingkan ulang byte-per-byte.
- `chain_id` dipaksa `solana:mainnet`. `uri` wajib https dan host-nya harus sama dengan `domain`. `domain` harus ada di allowlist `AUTH_SIWS_DOMAINS` dan sama dengan host `Origin` kalau header itu ada (`siws.ts`, `routes_auth.ts`).
- Nonce 32 karakter alfanumerik, 5 menit, single-use, terikat address + domain (`0001_init.sql` `siws_nonces`, `consume_siws_nonce`).
- `Issued At` dari server memenuhi ambang ±10 menit Phantom.
- Ed25519 diverifikasi atas byte UTF-8 persis dengan kunci publik = address (`verifySignature`).
- Access token HS256 15 menit, klaim `amr:["siws"]`, `wallet`, `app_scopes:["read","trade"]`, tanpa `trade:real`.
- Refresh token opaque, disimpan hanya sebagai sha256, berotasi, dan reuse mencabut family (`0011_siws_sessions.sql`). Allowlist dicek ulang saat refresh.
- Kode error: `SIWS_NONCE_INVALID` (401/P0401), `SIWS_SIGNATURE_INVALID` (401), `FORBIDDEN_ROLE` (403, `wallet_not_allowed`), `RATE_LIMITED` (429 + `Retry-After`, retryable), `UNAVAILABLE` (503), `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401, `refresh_invalid|refresh_reused|refresh_revoked|refresh_expired`) (`packages/contracts/errors.json`).

Celah dan permintaan ke Backend (prioritas per keputusan Apex 29 Okt 2026: **B-1 = P0, B-2 rate limit = P0, B-6 = P1**, sisanya belum diprioritaskan):
- **B-1 (tinggi) Allowlist fail-closed.** Kalau `AUTH_SIWS_DOMAINS` terisi tetapi `OWNER_WALLETS` kosong, server seharusnya menolak start, kecuali ada flag eksplisit seperti `AUTH_ALLOW_ANY_WALLET=true` untuk dev. Sekarang perilakunya "Empty = any wallet may sign in" (`config.ts`).
- **B-2 (sedang) DoS lewat rate limit per address.** Ada tiga opsi: (a) hitung batas per address hanya untuk permintaan **dari IP/perangkat yang belum pernah sukses**; (b) naikkan batas per address dan andalkan batas per IP; atau (c) beri jalur cadangan dengan bukti perangkat (B-6). Limiter juga in-memory per instance (`ratelimit.ts`), jadi batasnya bisa dilewati kalau API berjalan lebih dari satu instance.
- **B-3 (rendah) Ikat semua field pesan ke baris nonce.** `uri`, `issued_at` dan `expiration_time` di pesan tidak dicocokkan dengan DB. Kedaluwarsa tetap dijaga oleh `expires_at` DB, tetapi lebih rapi kalau `siws_nonces` juga menyimpan `uri` dan `issued_at`, lalu `/verify` mencocokkan semuanya, seperti `verifySignIn` di spec.
- **B-4 (sedang) Refresh paralel.** Dua refresh bersamaan dengan token yang sama akan memicu `refresh_reused` dan mencabut family. Usulan: grace window singkat (mis. 10–30 detik) yang mengembalikan pengganti yang sama untuk token yang baru saja dirotasi. Mobile tetap menerapkan single-flight di sisinya.
- **B-5 (rendah) Logout tidak mencabut access token.** Access token tetap berlaku sampai 15 menit. Bisa diterima. Opsional: cek `session_id` terhadap family yang dicabut di middleware API untuk endpoint trading.
- **B-6 (tinggi sebelum Fase 7) Anti-phishing relay.** Usulan:
  - `/nonce` menerima `device_pubkey` (P-256 di Keystore/Secure Enclave, dibuat app), dan `/verify` mewajibkan `device_sig` atas `nonce`. Setelah perangkat pertama terdaftar, nonce hanya bisa dipakai perangkat itu.
  - Tambahkan juga Play Integrity / App Attest.
- **B-7 (rendah) Pesan versi baru.** Statement saat ini berbunyi "(practice)". Kalau berubah di Fase 7, regex strict akan menolak pesan lama. Pastikan perubahan statement dikoordinasikan sebagai perubahan kontrak.
- **B-8 (dokumen) `FLUTTER_INTEGRATION_ANSWERS.md` basi.** Dokumen itu masih menulis jalur `/auth/siws/*` tanpa `/v1`, menyebut "Google, Apple, email OTP", dan alur Telegram. Tolong perbarui ke 4 route `/v1/auth/...`.
- **B-9 (konfirmasi)** Minta Backend mengonfirmasi bahwa `client` wajib dikirim `"mobile"` dari app. Default-nya `"web"`, jadi kalau tidak dikirim, klaim `sentra_client` salah.
- **B-10 (konfirmasi)** Minta Backend mengonfirmasi bahwa access token HS256 memakai `SUPABASE_JWT_SECRET` legacy. Kalau proyek Supabase pindah ke JWT signing key asimetris, PostgREST bisa menolak token ini **[belum diverifikasi untuk proyek kita]**. Rencana migrasinya perlu dicatat.

Kontrak yang dipakai mobile (tidak ada endpoint baru):
- `POST /v1/auth/siws/nonce {address, domain, uri, chain_id}` → `{data:{nonce, message, issued_at, expires_at}}`
- `POST /v1/auth/siws/verify {address, message, signature(base58), client:"mobile"}` → `{data: Session}`
- `POST /v1/auth/session/refresh {refresh_token}` → `{data: Session}` (token baru, single-flight)
- `POST /v1/auth/session/logout {refresh_token}` → `{data:{revoked:true}}`

## 8. Tes perangkat wajib sebelum implementasi
- **T-1**: Phantom iOS dan Android lewat deeplink `signMessage` dengan pesan SIWS ber-`domain` = `<DOMAIN_SENTRA>` dan `app_url` = `https://<DOMAIN_SENTRA>`. Apakah muncul dialog SIWS, dialog biasa, atau error `-32000`?
- **T-2**: Phantom Android lewat MWA `sign_messages`. Periksa juga apakah peringatan identitas hilang setelah `assetlinks.json` dipasang.
- **T-3**: Apakah `redirect_link` HTTPS (Universal Link/App Link terverifikasi) kembali ke app atau terbuka di browser?
- **T-4**: Perilaku saat Phantom belum terpasang, dan saat user menolak (`errorCode`).

## 9. Distribusi iOS (TestFlight internal / ad-hoc, akun pribadi Boss)
- TestFlight **internal** (≤100 user App Store Connect) **tidak** melewati TestFlight App Review. Review hanya untuk tester eksternal. Build berlaku 90 hari. Sumber: https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/ dan https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/ [Terverifikasi]
- Universal Links butuh capability **Associated Domains**, yang menurut sumber pihak ketiga hanya ada di Apple Developer Program berbayar ($99/tahun), bukan Personal Team gratis: https://bitrig.com/blog/apple-developer-program-free-vs-paid. Status **[Belum terverifikasi di tabel resmi Apple]**, cek di https://developer.apple.com/help/account/reference/supported-capabilities-ios. TestFlight dan ad-hoc memang sudah mewajibkan program berbayar.
- Kita butuh **domain yang kita kuasai** (HTTPS) untuk AASA, `assetlinks.json`, `domain`/`uri` SIWS dan `identity.uri` MWA. Domain ini juga harus masuk `AUTH_SIWS_DOMAINS`. Saat ini repo hanya punya placeholder (`api.sentra.example`, `sentra.local`).
- **Deeplink Phantom tidak membutuhkan App Store review maupun registrasi ke Phantom.** Docs deeplink tidak menyebut syarat registrasi, dan Phantom Portal/App ID hanya untuk Phantom Connect SDK (https://docs.phantom.com/resources/faq). Domain baru bisa memicu peringatan "domain is new or has not been reviewed" selama beberapa hari (https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings).
- Ad-hoc: perangkat harus didaftarkan lewat UDID. Info dari sumber pihak ketiga https://docs.medo.dev/18-app-packaging/01-ios/02-packaging-routes.html **[belum diverifikasi resmi]**.

## 10. Butuh keputusan/approval Boss
1. Install dan review kode: `pinenacl` 0.6.0, `flutter_secure_storage` 11.2.0, dan dependensi Android `com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.8` (+ `web3-solana`, `nv-websocket-client`) untuk plugin MWA buatan kita.
2. Domain HTTPS milik Boss untuk AASA, `assetlinks.json` dan domain SIWS.
3. Membership Apple Developer Program berbayar atas nama pribadi, untuk TestFlight internal dan Associated Domains.
4. ~~Menerima login dua langkah di iOS~~: **sudah diterima Apex (29 Okt 2026)**, lihat §11.
5. ~~Prioritas B-1 dan B-6~~: **sudah diputuskan**. B-1 dan B-2 (rate limit) jadi P0 di Backend, B-6 jadi P1 (§11).

## 11. Code review & pinning (29 Okt 2026, ±18:55 WIB)

**Update keputusan (dari Apex, 29 Okt 2026):**
- Login dua langkah di iOS (connect lalu signMessage) **diterima**.
- Di Backend, **B-1** (allowlist fail-closed) dan **B-2** (DoS rate limit per address) jadi **P0**.
- **B-6** (ikatan perangkat / App Attest) jadi **P1**.

**Cara kerja review.** Semua bahan diunduh hanya ke `/workspace/dev_team/siws_review/cr/` (`src/` = arsip pub.dev, `git-*` = clone tag, `maven/` = artefak Maven). Tidak ada yang ditambahkan ke pubspec/gradle mana pun, dan `pub get`/gradle tidak dijalankan pada app.
- Arsip pub.dev diverifikasi dengan `sha256` yang dihitung sendiri terhadap `archive_sha256` dari `https://pub.dev/api/packages/<p>/versions/<v>`.
- Artefak Maven diverifikasi dengan sha256 yang dihitung sendiri terhadap file `.sha256` di Maven Central, atau `sha256` di Gradle `.module`, atau `.sha1` kalau hanya itu yang tersedia.
- Source di arsip dibandingkan (`diff -r`) dengan tag git rilis.
- CVE dicek lewat **OSV API** (`https://api.osv.dev/v1/querybatch`, 96 paket). `osv-scanner` belum terpasang di box. Kontrol positif: `junit:junit:4.12` → `GHSA-269g-pwp5-87pp` terdeteksi, jadi query bekerja. Hasilnya **0 advisory** untuk semua versi di bawah.
- **Belum dijalankan**: test vector/unit test paket (tidak ada Dart/Android SDK di box), build nyata, dan verifikasi tanda tangan GPG `.asc`.

### 11.1 Ringkasan vonis

| Paket | Vonis | Syarat utama |
|---|---|---|
| `pinenacl` 0.6.0 | **PASS-with-conditions** | Hanya dipakai `Box` (x25519 + XSalsa20-Poly1305). Wrapper menolak public key Phantom berorde rendah. Interop test dengan tweetnacl-js/Phantom di CI. Kunci hanya di memori |
| `flutter_secure_storage` 11.2.0 (+ darwin 0.4.3, platform_interface 2.1.1) | **PASS-with-conditions** | iOS `first_unlock_this_device` atau `unlocked_this_device`, `synchronizable:false`. Android tetap `allowBackup=false`. Kehilangan data diterima (efeknya login ulang) |
| `mobile-wallet-adapter-clientlib-ktx` 2.0.8 (+ clientlib/common 2.0.8) | **PASS-with-conditions** | `exclude androidx.test.ext:junit-ktx` (dependency test bocor ke runtime). Set `blockchain = Solana.Mainnet`. Jangan simpan `authToken`. R8 harus membuang `Log.v/d`. Pin + dependency verification Gradle |

### 11.2 Pin dan hash integritas

**Paket pub.dev** (sha256 = `archive_sha256` API, sudah dicocokkan dengan hash hasil hitung sendiri, semuanya **cocok**):

| Paket | Versi | archive_sha256 | Tag / commit git | Arsip = tag? |
|---|---|---|---|---|
| pinenacl | 0.6.0 | `57e907beaacbc3c024a098910b6240758e899674de07d6949a67b52fd984cbdf` | `v0.6.0` → `30c38f30a34137aa748217cf2d6fc978740d8da8` (github.com/ilap/pinenacl-dart) | `lib/` identik |
| flutter_secure_storage | 11.2.0 | `d4e1fb6b2cb524868929e78dc0282fa000554b22060fb53789dc481c9fc95bb8` | `flutter_secure_storage-v11.2.0` → `805638be8ab37d1a08c3bc54c9e61b48555c6c3f` (github.com/juliansteenbakker/flutter_secure_storage) | `lib/` dan `android/` identik (selisih hanya `.gitignore`) |
| flutter_secure_storage_darwin | 0.4.3 | `a031ceac9b070e62ef183cd7f7d1a8798ebde402d5049f0fe6eb3a51bd797a21` | `flutter_secure_storage_darwin-v0.4.3` → `8ccc05f1ae1825bd1cc1b6e3e22f0805c4389a6b` | `darwin/` identik dengan isi tag 11.2.0 |
| flutter_secure_storage_platform_interface | 2.1.1 | `64951127f001f546891c86f414972bf49ef2c4c8a4c92c65f5790cc0c9100045` | `…platform_interface-v2.1.1` → `67516e27bc3550c1244fbc72f0565b83316a1a67` | tidak di-diff |
| plugin_platform_interface | 2.1.8 | `4820fbfdb9478b1ebae27888254d445073732dae3d6ea81f0b7e06d5dedc3f02` | flutter/packages | - |
| meta | 1.19.0 | `307249ce4ff29d58a18e97f6345f539382eb9c9c29ecda628900f31de0443dd9` | dart-lang/sdk | - |

Transitive Dart untuk desktop/web juga ikut **resolve**: `flutter_secure_storage_linux` 3.0.3, `_windows` 4.2.2, `_web` 2.1.1, `web` 1.1.2. Lewat `_windows` ikut juga `path_provider` 2.1.6, yang meng-endorse `path_provider_android` 2.3.1 (`jni` 1.1.1, `jni_flutter` 1.0.4) dan `path_provider_foundation` 2.6.0 (`objective_c` 9.6.2, build hook `hooks`/`code_assets`).
- **Temuan**: plugin `path_provider_android`/`_foundation` kemungkinan besar ikut ter-bundle di build Android/iOS walaupun kita tidak memakainya, karena federated plugin yang di-endorse ikut didaftarkan. Status **[belum diverifikasi dengan build]**.
- Semuanya paket resmi dart.dev/flutter.dev, tetapi menambah native code dan build hook. Hash semua paket transitive (dihitung dan cocok) ada di `/workspace/dev_team/siws_review/cr/PUB_SHA256.txt`, dan hash JAR/AAR Maven di `cr/maven/SHA256SUMS.jars.txt`.
- Versi-versi ini adalah "terbaru yang kompatibel per 29 Okt 2026". **Sumber kebenaran tetap `pubspec.lock`** setelah approval. Pin `flutter_secure_storage: 11.2.0` dan `pinenacl: 0.6.0` secara exact (tanpa `^`), commit lockfile, dan bandingkan `sha256` di lockfile dengan tabel ini.

**Maven** (sha256 dihitung sendiri; sumber pembanding dalam kurung):

| Artefak | sha256 | Sumber verifikasi | Lisensi |
|---|---|---|---|
| `com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.8` (.aar) | `93f0e9fc8527da0641bb973bb4dfbbb58432844f17a359a14acd5b9616344595` | `.aar.sha256` Maven Central + `.module` | Apache-2.0 |
| ↳ `.pom` | `930ac4fdfb63df4ba635dff3619bacb072d5a51ffd95f8daf60b006223cc0be9` | `.pom.sha256` | |
| ↳ `-sources.jar` | `4e5cb1a4b54f9e10145d03ffc443dc8a2cb5346ea17360b5bc3988bbf69fae6c` | `.sha256` | |
| `com.solanamobile:mobile-wallet-adapter-clientlib:2.0.8` (.aar) | `5dc67d1ef6aa851dba48234b424bf82134137a7078793affd65e2e37b7a17bf1` | `.module` | Apache-2.0 |
| `com.solanamobile:mobile-wallet-adapter-common:2.0.8` (.aar) | `1ebbeeb1707a5fc8fc2bf4c3b941536cd16eedc33f26ac64d1ae2269b6c68e8e` | `.module` | Apache-2.0 |
| `com.neovisionaries:nv-websocket-client:2.14` | `eed0fb6f5ef5db17…` (lengkap di `cr/maven/SHA256SUMS.jars.txt`) | `.sha1` | Apache-2.0 |
| `com.solanamobile:web3-solana-jvm:0.3.0-beta4` | `8b5616e73e1c860d…` | `.module` | Apache-2.0 |
| `com.solanamobile:web3-core-jvm:0.3.0-beta4` | `9dcd83885a9fecd9…` | `.module` | Apache-2.0 |
| `io.github.funkatronics:kborsh-jvm:0.1.0`, `multimult-jvm:0.2.0` (versi final bisa naik oleh resolusi Gradle), `salkt-jvm:0.1.0` | `7ba6ff93…`, `85276b22…`, `0038ccdc…` | `.module` | Apache-2.0 / Apache-2.0 / **MIT** |
| `com.ditchoom:buffer-jvm:1.3.0` | `fec26338…` | `.module` | Apache-2.0 |
| `org.jetbrains.kotlinx:kotlinx-serialization-json-jvm`/`core-jvm:1.6.2` | `8d2718bb…` / `8e6fc04e…` | `.module` | Apache-2.0 |
| `org.jetbrains.kotlin:kotlin-stdlib:2.1.21` | `263bdc67…` | `.module` | Apache-2.0 |
| androidx `core-ktx` 1.16.0, `activity-ktx` 1.10.1 (+ lifecycle 2.6.x, savedstate 1.2.1, startup, tracing, profileinstaller, dst.) | lihat `cr/maven/SHA256SUMS.jars.txt` | `.module`/`.sha256` Google Maven | Apache-2.0 |
| **`androidx.test.ext:junit-ktx:1.2.1` → `androidx.test:core`, `monitor`, `services:storage`, `junit:junit:4.13.2`** | `552cb286…` dst. | `.sha256` | Apache-2.0 / **EPL-1.0 (junit)** |

- Tag git rilis: `v2.0.8` → `ad5215ac51cf32db0a1914cf1127bab06a3b88d9` (16 Jun 2025, 23:07 WIB). Isi `-sources.jar` ktx, clientlib dan common **identik** dengan `android/*/src/main/java` di tag itu.
- **Tidak ada ktor** di pohon dependensi. Transport memakai `nv-websocket-client`.
- Pohon di atas adalah versi yang **diminta** POM/module. Gradle akan menaikkan sebagian (mis. androidx). Kunci versi finalnya dengan `gradle --write-locks` dan `gradle/verification-metadata.xml` (`--write-verification-metadata sha256`) saat integrasi.
- Tanda tangan GPG (`.asc` tersedia untuk ktx) **belum diverifikasi**.

### 11.3 pinenacl 0.6.0

**Kriptografi [Terverifikasi dari source]:**
- **XSalsa20-Poly1305.** `Box` memanggil `crypto_box_beforenm`, yaitu `crypto_scalarmult` (X25519) lalu `crypto_core_hsalsa20` (`lib/src/tweetnacl/tweetnacl.dart:1424-1430`). Setelah itu `crypto_secretbox` / `crypto_secretbox_open` (`:640-668`). MAC diverifikasi **sebelum** dekripsi (`:660`), lewat `_vn` (perbandingan constant-time, OR-akumulasi, `:105-112`).
- **X25519**: ladder Montgomery dengan conditional swap `_sel25519` berbasis mask (`:694-707`, `:1347-1412`). Clamping skalar ada di `:1362-1363`. Akumulator perkalian `_M_off` memakai `int` 64-bit Dart, bukan `Int32List`, jadi tidak ada overflow di VM (`:813ff`).
- **RNG**: `Random.secure()` (`:2116`), yaitu CSPRNG OS (https://api.dart.dev/stable/dart-math/Random/Random.secure.html). Nonce `Box.encrypt()` dibuat acak 24 byte bila tidak diberikan (`lib/api/authenticated_encryption.dart:35`).
- **Test**: repo menyertakan vektor Wycheproof X25519 dan Ed25519 (`test/wycheproof/X25519.json`, `test/data/eddsa_ed25519_vectors.json`). Test ini **belum dijalankan** oleh kita.

**Temuan / perhatian:**
1. `crypto_scalarmult` **tidak menolak public key berorde rendah**, yang menghasilkan shared secret nol (`tweetnacl.dart:1347`, sama seperti TweetNaCl asli). Dampaknya: kalau penyerang menangkap redirect lewat skema custom dan memalsukan `phantom_encryption_public_key`, ia bisa membuat `data` yang terdekripsi. Login tetap aman karena server memverifikasi signature + nonce + allowlist, tetapi wrapper kita **wajib** menolak hasil `crypto_scalarmult` yang semuanya nol.
2. `_car25519` memakai pembagian integer `~/` (`:681-692`). Pembagian di CPU bisa variable-time, jadi ada potensi side-channel timing kecil. Risikonya rendah karena kunci x25519 kita sesaat (sekali login).
3. Error dilempar sebagai `String`, bukan `Exception` (mis. `throw 'The message is forged…'` `:661`). Wrapper harus `catch (_)`, bukan `on Exception`.
4. Ada `main()` sisa dengan `print()` di `lib/src/message_authentication/hmac.dart:4-30`. Kode mati, tidak dipanggil dan tidak berisi rahasia, tetapi menunjukkan kebersihan rilis yang kurang.
5. Kunci tidak bisa di-zero-kan dengan pasti (GC Dart, `Uint8List.fromList` membuat salinan di `public.dart:94-100`). Ini diterima untuk kunci sesaat.
6. Tidak ada `import dart:io`/jaringan, reflection, native code, izin, atau telemetri. Import hanya `dart:math`, `dart:typed_data`, `dart:convert` dan `dart:collection`.
7. OSV: 0 advisory. Repo kurang aktif (push terakhir 8 Agu 2024).

**Vonis: PASS-with-conditions.** Syaratnya:
- (a) Pin exact `0.6.0` + sha256 di atas.
- (b) Hanya pakai API `PrivateKey.generate()`, `Box`, `EncryptedMessage`.
- (c) Tolak shared point nol dan public key bukan 32 byte.
- (d) Tambahkan test interop di CI: dekripsi fixture dari tweetnacl-js (`nacl.box.after`) dan vektor RFC 7748 §5.2/§6.1.
- (e) Keypair x25519 baru per login, tidak pernah disimpan.

### 11.4 flutter_secure_storage 11.2.0 (Android in-package, darwin 0.4.3)

**Android [Terverifikasi]:**
- Data dienkripsi **AES-GCM** dan disimpan di SharedPreferences `MODE_PRIVATE`. Kunci AES dibungkus kunci **RSA-OAEP-SHA256 Android Keystore** (`ciphers/KeyCipherImplementationRSAOAEP.java:136-153`). Opsi `AndroidOptions.biometric()` memakai kunci AES Keystore, dengan StrongBox kalau tersedia (`KeyCipherImplementationAES23.java:140-195`). minSdk 24.
- **`encryptedSharedPreferences` sudah dihapus di v11** (Jetpack Security deprecated). Data lama dimigrasi di v10 (`CHANGELOG.md:54`, `:144`). Opsi itu tidak relevan untuk kita karena kita belum pernah memakainya.
- Manifest plugin **kosong**: tanpa izin dan tanpa merge (`android/src/main/AndroidManifest.xml`). Tidak ada jaringan atau reflection (grep `HttpURLConnection|URL(|Socket|forName` kosong).
- Dependensi native `com.google.crypto.tink:tink-android:1.23.0` (`android/build.gradle:69`, sha1 `bb0539111f2fa652289783066b5a31c5680663e7` cocok dengan Maven, sha256 hitung `c656918451b01c45ce5b20c7b6d4c388f956f61b3a3528e769048c8944c42f9e`). Tink membawa `gson`, `jsr305`, `error_prone_annotations` dan `annotation-jvm`, padahal **tidak ada `import com.google.crypto.tink` di source** v11. Artinya ini dependency mati yang tetap ikut ke APK, kecuali R8 membuangnya.
- Logging: tidak ditemukan log **nilai** rahasia. Ada log **nama key** saat migrasi (`MigrationBackup.java:325`) dan log status lainnya.
- Backup: README menyarankan menonaktifkan Auto Backup karena kunci Keystore tidak ikut backup (`README.md:124-136`). App kita **sudah** `allowBackup="false"`, `fullBackupContent="false"` dan punya `dataExtractionRules` (`apps/mobile/android/app/src/main/AndroidManifest.xml:12-14`). Pertahankan, dan pastikan `data_extraction_rules.xml` mengecualikan `FlutterSecureStorage*` dan `FlutterSecureKeyStorage`.
- Default `resetOnError = true` (`lib/options/android_options.dart:51`) berarti data **dihapus permanen** saat ada error kunci.
- **Issue kehilangan data yang masih terbuka**:
  - #1298: error Keystore sesaat membuat `createRSAKeysIfNeeded` mengganti pasangan RSA, sehingga semua data hilang bahkan dengan `resetOnError:false` (`KeyCipherImplementationRSAOAEP.java:114-117`).
  - #1282: `resetOnError` rekursif sampai proses mati di Samsung setelah enrolment biometrik.
  - #1285: kunci biometrik permanen invalid setelah enrolment berubah.
  - Sumber: https://github.com/juliansteenbakker/flutter_secure_storage/issues/1298, /1282, /1285.
  - Untuk kita dampaknya hanya **logout paksa**, karena yang disimpan hanya refresh token.

**iOS/darwin [Terverifikasi]:**
- Keychain `kSecClassGenericPassword`. Default accessibility **`unlocked` = `kSecAttrAccessibleWhenUnlocked`** (`lib/options/apple_options.dart:72`, mapping `FlutterSecureStorage.swift:92-97`), yang **ikut migrasi ke perangkat baru** lewat backup terenkripsi. Default `synchronizable = false` (`apple_options.dart:73`).
- `PrivacyInfo.xcprivacy`: tracking `false`, tidak ada data yang dikumpulkan.
- Tidak ada jaringan. Satu `print` pesan error access control (`FlutterSecureStorage.swift:143`) tanpa nilai rahasia.
- Perhatian:
  1. `fatalError("Validation failed")` di `baseQuery` (`FlutterSecureStorage.swift:212`): parameter tidak valid **mematikan app**, bukan melempar error.
  2. `write` melakukan `SecItemUpdate`, dan kalau gagal: `delete` lalu `SecItemAdd` (`:683-698`). Ini tidak atomik. Kalau `SecItemAdd` gagal (mis. perangkat terkunci dengan accessibility `unlocked_this_device`), nilai lama sudah terhapus.
  3. Item keychain **tetap ada setelah app di-uninstall** (perilaku iOS). Akibatnya refresh token lama bisa muncul lagi setelah reinstall.
  4. Ada lookup lintas tingkat accessibility (`:175-205`). Mengganti tingkat accessibility tidak memigrasi item lama, karena `SecItemUpdate` hanya mengubah `kSecValueData`.

**Vonis: PASS-with-conditions.** Syaratnya:
- (a) Pin exact `11.2.0` (+ darwin 0.4.3, platform_interface 2.1.1) dengan sha256 di atas.
- (b) **iOS**: `IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device, synchronizable: false)`. Ini disarankan karena refresh di background, mis. aksi notifikasi saat layar terkunci, butuh akses. Kalau tidak ada akses di background, pakai `unlocked_this_device`. Jangan pakai default `unlocked`.
- (c) **Android**: `AndroidOptions()` default (RSA-OAEP + AES-GCM). Tetap `allowBackup=false` + `dataExtractionRules`. `storageNamespace: 'sentra_auth'`. `resetOnError: true` diterima.
- (d) Simpan **hanya** refresh token. Access token, kunci x25519, session Phantom dan `authToken` MWA tetap di memori.
- (e) Rotasi refresh: simpan token baru di memori dulu. Kalau `write` gagal, ulangi; kalau tetap gagal, minta login ulang.
- (f) Saat first-run setelah install (flag di `SharedPreferences`/`NSUserDefaults`), panggil `deleteAll()` untuk membuang item keychain sisa install lama.
- (g) Saat integrasi, cek apakah `tink-android` dan `path_provider_*` benar ikut ke APK/IPA (APK Analyzer / `--analyze-size`), lalu catat.

### 11.5 mobile-wallet-adapter-clientlib-ktx 2.0.8 (+ clientlib, common 2.0.8)

**Alur asosiasi [Terverifikasi dari source tag v2.0.8]:**
- Dapp membuat keypair asosiasi **P-256**, memilih port lokal acak, lalu meluncurkan intent `solana-wallet:/v1/associate/local?association=<pubkey>&port=<p>&v=…` (`clientlib/.../scenario/LocalAssociationIntentCreator.java:28-56`). URI wallet khusus (`wallet_uri_base`) hanya diterima kalau `https` dan hierarkis (`:55-56`, `clientlib-ktx/.../MobileWalletAdapter.kt:120`).
- Koneksi WebSocket ke `ws://localhost:<port>` dengan backoff sampai ±30 detik (`LocalAssociationScenario.java:31-67`).
- Sesi: ECDH P-256 sesaat yang ditandatangani ECDSA kunci asosiasi (`MobileWalletAdapterSession.java:81-109`), HKDF, lalu pesan dienkripsi **AES-GCM dengan IV dari `SecureRandom`** (`common/.../MobileWalletAdapterSessionCommon.java:185-187`).
- **Wallet tidak diautentikasi terhadap dapp.** App lain yang mendaftarkan skema `solana-wallet:` atau menyerobot port bisa berpura-pura menjadi wallet. Untuk kita, wallet palsu tidak bisa menghasilkan signature alamat owner, karena server memverifikasi Ed25519 + allowlist.
- Port dipilih dengan `java.util.Random`, bukan `SecureRandom` (`LocalAssociationScenario.java:61`), sehingga lebih mudah ditebak untuk port-squatting. Risikonya rendah dengan alasan yang sama.

**Identitas dan origin:**
- Library hanya mengirim `identity {uri, icon, name}`. Verifikasi identitas dilakukan **wallet** lewat Digital Asset Links (`assetlinks.json`) (spec §Dapp identity verification; https://docs.phantom.com/developer-powertools/domain-and-transaction-warnings).
- `identity.uri` harus `https://<DOMAIN_SENTRA>`, sama dengan domain SIWS di `AUTH_SIWS_DOMAINS`.

**Auth token:**
- Disimpan di properti in-memory `MobileWalletAdapter.authToken` (`MobileWalletAdapter.kt:32`) dan dipakai ulang untuk `reauthorize`. Tidak ada persistensi oleh library.
- Kita set `authToken = null` setelah login dan **tidak** menyimpannya.

**Default berbahaya:** `blockchain = Solana.Devnet` (`MobileWalletAdapter.kt:38`). Wajib diset `Solana.Mainnet`, supaya chain cocok dengan pesan SIWS `solana:mainnet` dan tidak memicu bug chain Phantom (#958).

**Logging:**
- `Log.d` mencetak **params notifikasi JSON-RPC** (`JsonRpc20Client.java:119`).
- `Log.v` mencetak public key ECDH (`MobileWalletAdapterSession.java:151`).
- Isi request/response terenkripsi (termasuk `auth_token`/signature) **tidak** di-log; yang di-log hanya ukuran (`MobileWalletAdapterSessionCommon.java:120`).
- AAR tidak di-minify (`clientlib*/build.gradle: minifyEnabled false`). Tambahkan aturan R8 `-assumenosideeffects class android.util.Log { v(...); d(...); }` di release.

**Izin / manifest merge:**
- Dari clientlib: `INTERNET`, `ACCESS_NETWORK_STATE`, dan `<queries>` untuk skema `solana-wallet` (`aar-mobile-wallet-adapter-clientlib/AndroidManifest.xml`).
- ktx dan common: manifest kosong, minSdk 24 / 19.
- Tidak ada reflection, `loadLibrary`, atau HTTP. Selain WebSocket localhost hanya ada konstanta reflector `/reflect` untuk *remote association*, yang tidak kita pakai.

**Temuan rantai pasok:**
- **`androidx.test.ext:junit-ktx:1.2.1` dideklarasikan sebagai dependency runtime** (`clientlib-ktx/build.gradle:125` `implementation libs.androidx.junit.ktx`; POM scope `runtime`). Akibatnya `androidx.test:core`/`monitor`/`services:storage` dan `junit:junit:4.13.2` (EPL-1.0) ikut ke APK.
- `web3-solana` 0.3.0-**beta4** masih versi beta.
- Ada fallback otomatis: kalau wallet tidak mengembalikan `signInResult`, ktx merakit pesan SIWS sendiri (`MobileWalletAdapter.kt:124`). Kita tidak memakai `signIn`, jadi tidak relevan, tetapi pastikan wrapper tidak memanggil `signIn()`.

**Vonis: PASS-with-conditions.** Syaratnya:
- (a) Pin exact `2.0.8` + `gradle/verification-metadata.xml` (sha256 di atas) + dependency locking.
- (b) `exclude group: 'androidx.test.ext', module: 'junit-ktx'` (lalu uji bahwa library tetap berjalan).
- (c) `blockchain = Solana.Mainnet`, `identity.uri = https://<DOMAIN_SENTRA>`.
- (d) Hanya `transact { authorize; signMessagesDetached }`, tanpa `signIn`/`signAndSendTransactions`.
- (e) `authToken` dibuang setelah login.
- (f) R8 membuang `Log.v/d`.
- (g) `assetlinks.json` di domain Sentra dengan fingerprint sertifikat release.
- (h) Plugin MethodChannel kita hanya mengembalikan `address` (base58) dan `signature` (base58) ke Dart. Pesan yang ditandatangani harus persis string dari `/v1/auth/siws/nonce`.

### 11.6 Yang masih terbuka
- Jalankan test pinenacl + test interop. Jalankan `osv-scanner` pada `pubspec.lock` dan Gradle lockfile di CI (sesuai PERF_SECURITY). Verifikasi GPG `.asc`.
- Ukur dampak ukuran APK/IPA dari `tink-android`, `path_provider_*` dan `junit` (sebelum dan sesudah exclude).
- Install tetap **menunggu approval Boss**. Review ini hanya memenuhi syarat "code + security review sebelum install".

### 11.7 Instalasi (1 Nov 2026, ±12:30 WIB)

Approval: Boss ("Boleh", lewat Apex), hanya `pinenacl` 0.6.0 dan `flutter_secure_storage` 11.2.0. MWA/`clientlib-ktx` **tidak** dipasang (red flag `junit-ktx`, ditunda).
- `pubspec.yaml`: pin exact `pinenacl: 0.6.0`, `flutter_secure_storage: 11.2.0`, `dependency_overrides` darwin 0.4.3 + platform_interface 2.1.1.
- **Verifikasi lockfile**: setiap paket yang **baru** masuk `pubspec.lock` (pinenacl, flutter_secure_storage + `_darwin`/`_linux`/`_platform_interface`/`_web`/`_windows`, `ffi_leak_tracker`, `win32`) punya versi dan `sha256` yang **sama persis** dengan `cr/PUB_SHA256.txt`. Dua baris di `PUB_SHA256.txt` berbeda dari lockfile (`meta` 1.18.3 vs 1.19.0, `jni_flutter` 1.0.4+1 vs 1.0.4), tetapi keduanya **sudah ada di lockfile sebelum instalasi** (tidak berubah terhadap HEAD; `meta` dipin oleh Flutter SDK), jadi bukan bagian dari instalasi ini.
- Wrapper: `lib/core/auth/phantom_box.dart` (hanya `Box`/`PrivateKey`/`EncryptedMessage` + `crypto_scalarmult` untuk cek titik nol; keypair baru per login, hanya di memori; tolak public key ≠ 32 byte dan shared secret nol; semua throw ditangkap dengan `catch (_)`), `lib/core/auth/secure_token_store.dart` (hanya refresh token `srt_…`; iOS `first_unlock_this_device` + `synchronizable:false`; Android `storageNamespace:'sentra_auth'`; rotasi memori-dulu + write-retry; `deleteAll()` saat first run setelah install), `lib/core/auth/base58.dart`.
- Test: `test/auth_wrappers_test.dart` (vektor RFC 7748 §5.2 termasuk iterasi 1/1000, §6.1 DH, round-trip base58, tamper, titik orde rendah, store berbasis fake).
- `data_extraction_rules.xml` sudah mengecualikan seluruh domain `sharedpref` (termasuk `FlutterSecureStorage*`).
- Belum: interop fixture dari tweetnacl-js/Phantom asli (butuh perangkat), cek ukuran APK untuk `tink-android`/`path_provider_*` (§11.4 g).

## 12. Implementasi Android: Phantom deeplink SIWS (1 Nov 2026)

Keputusan Apex/Boss: MWA ditunda (red flag), Android dulu lewat deeplink Phantom, redirect skema custom `centurion://auth` (domain nanti). Tidak ada paket baru selain dua paket di §11.7.

**Alur** (`lib/core/auth/phantom_deeplink.dart`, `lib/data/api/auth.dart`, `lib/data/api/auth_http.dart`):
1. `https://phantom.app/ul/v1/connect?app_url=<placeholder https://centurion.trade.invalid>&dapp_encryption_public_key=<x25519 baru>&cluster=mainnet-beta&redirect_link=centurion://auth?state=<S>&step=connect`.
2. Redirect → `PhantomBox.openBase58(phantom_encryption_public_key)` (tolak titik orde rendah) → dekripsi `{public_key, session}`; `public_key` wajib base58 32 byte.
3. `POST /v1/auth/siws/nonce {address, domain, chain_id:"solana:mainnet", statement_version:1}`. Header pesan wajib `"<domain> wants you to sign in with your Solana account:"` + baris alamat yang sama, dan memuat `Nonce: <nonce>`; kalau tidak, app **tidak** menandatangani (`SiwsPayloadRejected`).
4. `https://phantom.app/ul/v1/signMessage?dapp_encryption_public_key&nonce&payload&redirect_link=centurion://auth?state=<S>&step=sign`; payload = Box(`{message: base58(byte UTF-8 persis dari server), session, display:"utf8"}`).
5. Redirect → dekripsi `{signature}` (base58 64 byte; `public_key` bila ada harus sama).
6. `POST /v1/auth/siws/verify {address, message, signature, client:"mobile"}` → `Session` + `workspace_id`. Refresh token ke `SecureTokenStore`; access token di memori.
7. `/v1/auth/session/refresh` single-flight (juga dipakai saat cold start dari refresh token tersimpan); `UNAUTHENTICATED` (refresh_reused/revoked/expired/invalid, session_revoked) atau `FORBIDDEN_ROLE` → `ForcedLogout` + hapus storage. `/v1/auth/session/logout` best effort, token lokal dihapus dulu.

**Pertahanan hijack:** state acak 128-bit, TTL 5 menit, sekali pakai per langkah, terikat ke keypair x25519 + session Phantom di memori; redirect tanpa state/step yang cocok, kedaluwarsa, replay, atau skema/host lain diabaikan (`rejectedRedirects`). Kode error Phantom `4001` → "Tanda tangan ditolak". Keypair/session dibuang setelah percobaan selesai atau gagal.

**Native:** `MainActivity.kt` punya channel sendiri `centurion/deeplink` (`openUrl` hanya `https://phantom.app`) dan `centurion/deeplink/events` (intent `VIEW` `centurion://auth`, cold start + `onNewIntent`, tanpa log). Manifest: intent-filter `centurion`/`auth` (tanpa `autoVerify`), `<queries><package android:name="app.phantom"/>`.

**UI:** `LoginScreen` (`/login`), satu tombol "Masuk dengan Phantom". Gate login aktif lewat `FeatureFlags.authGateEnabled` (ON di komposisi prod `prodAuthOverrides`, OFF di build mock/test). Tidak ada rute email OTP/Telegram; stub Telegram tetap di balik flag OFF.

**Error → copy:** `SIWS_NONCE_INVALID`, `SIWS_SIGNATURE_INVALID`, `FORBIDDEN_ROLE`, `RATE_LIMITED` (+`Retry-After` → `retry_after_s`), `UNAVAILABLE` (juga timeout/jaringan/TLS/404 tanpa envelope), `VALIDATION_FAILED`, `UNAUTHENTICATED` lewat `api_errors.g.dart` + `errorText` (i18n). Copy khusus Phantom sementara di `lib/features/auth/login_strings.dart` (ARB vendored tidak boleh diubah): `loginButtonPhantom`, `loginPhantomWaiting`, `loginPhantomNotInstalled`, `loginPhantomExpired`, `loginPhantomBadResponse` → **minta UX menambahkan ke @sentra/i18n**.

**Test:** `test/phantom_login_test.dart` (FakePhantom yang benar-benar mengenkripsi dengan Box; redirect palsu/replay/TTL; titik orde rendah; alamat 31 byte; signature 63 byte; decline 4001; Phantom tidak terpasang; pesan domain lain tidak ditandatangani; storage hanya refresh token; restore cold start; reuse → forced logout; bentuk body REST; pemetaan error), `test/login_screen_test.dart` (gate ON → login → tab Home; decline; wallet bukan owner).

**Belum diverifikasi (butuh perangkat + Phantom asli):** apakah Phantom mempertahankan query `state/step` yang sudah ada di `redirect_link` (kalau tidak, pindahkan state ke path `centurion://auth/<state>/<step>`); nama field respons signMessage (`signature`, opsional `publicKey`); perilaku `app_url` placeholder (`.invalid`) di layar connect Phantom; build APK nyata.

## Lampiran: lokasi bahan baca
`/workspace/dev_team/siws_review/`: `mobile-wallet-adapter/`, `sign-in-with-solana/`, `deep-link-demo-app/`, `espresso/`, `pub/` (arsip pub.dev), `gotrue_2/`, `sb/`, `sbauth/`. Semuanya untuk dibaca saja dan tidak terhubung ke project.
