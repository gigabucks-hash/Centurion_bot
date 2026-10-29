# Review `app_tokens.dart`: design tokens Flutter dari UX UI Designer

> **Update 29 Okt 2026, migrasi ke `@sentra/design-tokens` 0.2.1.** Kolom **Status v0.2.1** di tabel bawah adalah status terbaru; kolom "Status di app (v0)" dipertahankan sebagai riwayat.

## Migrasi ke `/workspace/sentra/packages/design-tokens` (v0.2.1)
- **Pendekatan: vendoring (salinan verbatim), bukan dependency.** Paket itu bukan paket Dart (tidak ada `pubspec.yaml`; isinya `tokens.json` + `scripts/build.py` yang menghasilkan `tokens/app_tokens.dart`), jadi tidak bisa dipakai lewat `path:` dependency. File disalin **tanpa perubahan apa pun** (header ignore v0 juga dihapus) ke `app/lib/core/theme/app_tokens.dart`.
  - md5 sumber = salinan = `454ec83ccbf71257a7a18c3d3fdb5443` (sama dengan `/workspace/ux-solbot/tokens/app_tokens.dart`). Tidak ada file di `/workspace/sentra` atau `/workspace/ux-solbot` yang diubah.
  - Update berikutnya: `cp /workspace/sentra/packages/design-tokens/tokens/app_tokens.dart app/lib/core/theme/` lalu `flutter analyze && flutter test`. Setelah pindah ke monorepo (D3–4) ini bisa jadi langkah build/CI (salin + cek md5).
- **Breaking rename yang diterapkan:** `context.trade` → `context.tradeColors`, `numStyle()` → `AppText.num()` (`w:` → `weight:`), `AppSpace.s0_5` → `AppSpace.sHalf`, `AppSize.tapMin` → `AppDensity.tapMin`, `AppSize.controlLg` → `AppDensity.comfortable.controlLg`, `AppMotion.holdPractice/holdReal` → `holdPracticeBase/holdRealBase`. Tombol Approve sekarang memakai `AppButtons.success/real`.
- **Adapter menyusut:** `solbot_theme.dart` dari 50 baris (berisi patch) menjadi 33 baris. Isinya hanya *app chrome* yang memang bukan token (NavigationBar, SnackBar floating, AppBar) + helper `pnlColor` (T-15). Patch lama untuk `titleSmall/labelMedium`, `outlinedButtonTheme`, fallback `tradeColors`, dan `pnl(neutral:)` sudah dihapus karena tersedia di upstream.
- **Font:** `google_fonts ^9.0.0` untuk MVP (Inter + JetBrains Mono, sesuai header file token). Bundling `.ttf` lokal dijadwalkan D8–9 (Kam 5 – Jum 6 Nov 2026), sebelum build store (lihat ARCHITECTURE.md §9). Di test, `allowRuntimeFetching = false` (`test/flutter_test_config.dart`), sehingga muncul 4 log "unable to load font" yang tidak berbahaya. Log itu hilang setelah font dibundel.

### Status 14 temuan terhadap v0.2.1
| ID | Status v0.2.1 | Bukti |
|---|---|---|
| T-01 | **Sebagian.** Nama family konsisten (`AppFonts.sans='Inter'`, `mono='JetBrains Mono'`), fallback ada, dimuat via google_fonts. **Open:** `.ttf` belum dibundel (milestone D8–9) | `AppFonts`, `AppText.num` → `GoogleFonts.jetBrainsMono`; test `fontFamily startsWith 'Inter'/'JetBrainsMono'` |
| T-02 | **Resolved.** `copyWith` untuk 17 field | test copyWith |
| T-03 | **Resolved.** Dark `borderStrong` #6B7995: 3,68:1 di `bgRaised`, 3,24:1 di `bgOverlay`. `textTertiary` #919CB2: 5,13:1 di `bgOverlay`. Light outline #7D879B: 3,61:1. `outlineVariant` diberi komentar "decorative only" dan contrast-report mendokumentasikan pengecualiannya | dihitung ulang (WCAG), `contrast-report.md` |
| T-04 | **Resolved.** 15 slot M3 + letterSpacing (labelSmall 0,4) + varian compact; mapping ada di README upstream | `AppText.theme` |
| T-05 | **Resolved.** `const` diemit; analyze bersih **tanpa** `ignore_for_file`. Masih ada 4 baris >120 kolom (lihat T-16) | `flutter analyze` |
| T-06 | **Resolved.** `context.tradeColors` null-safe (fallback sesuai brightness) | `extension TradeColorsX` |
| T-07 | **Resolved.** `neutral` + `infoContainer` ada di `TradeColors`, `pnl(num)` → neutral untuk 0 | test pnl neutral |
| T-08 | **Resolved.** `AppElevation.e0–e4`, `surfaceTint` transparan, `shadow` diset | test surfaceTint |
| T-09 | **Resolved.** `tertiaryContainer`=info, `inverse*`, `scrim`, `shadow` | `_darkScheme/_lightScheme` |
| T-10 | **Resolved.** `AppButtons.success/danger/real/secondary/ghost` + outlined/text/input theme dengan `tapMin` | dipakai di Approvals & Sell sheet |
| T-11 | **Sebagian.** `sHalf` + `AppText.num` resolved. **Open (tugas Flutter, bukan UX):** rename app ke `sentra_mobile`/`com.sentra.app`, milestone D3–4 | – |
| T-12 | **Resolved.** `useMaterial3` dihapus | grep |
| T-13 | **Resolved.** `AppMotion.of(context)` membaca `disableAnimations`; durasi hold tetap | `AppMotion` |
| T-14 | **Resolved.** `lerp(ThemeExtension<TradeColors>? other, …)` + `is!` check | test lerp |

### Temuan baru
| ID | P | Temuan | Saran | Status |
|---|---|---|---|---|
| T-15 | P2 | `TradeColors.pnl(num)` menganggap netral hanya jika **tepat 0**, padahal format menampilkan `±0` untuk \|v\| < 0,0005 SOL (dan `±0%` untuk \|v\| < 0,05%). Akibatnya nilai seperti 0,0002 tampil "±0" tetapi berwarna hijau, sehingga warna dan teks bertentangan (SPEC §1). | Tambahkan `pnl(num v, {double epsilon})` atau ekspor konstanta `AppFormat.zeroEpsilon` agar warna dan format memakai ambang yang sama. | **Open (UX).** Workaround app: `context.pnlColor(v, epsilon:)` di `solbot_theme.dart` |
| T-16 | P3 | Masih ada 4 baris >120 kolom setelah `dart format` (header comment + `AppText.num`), sehingga diff review agak sulit. | Pecah comment header. Format manual tidak perlu. | Open (kosmetik) |
| T-17 | P3 | Header file menyebut `assets/google_fonts/` untuk bundling, tetapi README tidak menyebut nama file yang dicari google_fonts (`Inter-Regular.ttf`, `Inter-Medium.ttf`, `Inter-SemiBold.ttf`, `JetBrainsMono-Medium.ttf`, `JetBrainsMono-SemiBold.ttf`). | Tambahkan daftar file ke README token. | Open. Akan dicek saat D8–9 |

**Token issue yang masih open:** T-01 (bundling font, milestone Flutter D8–9), T-11 (rename app D3–4, tugas Flutter), T-15 (ambang netral PnL, UX), T-16, T-17 (kosmetik/doc).

---

## Riwayat: review v0 (sebelum migrasi)

- **Sumber:** `/workspace/ux-solbot/tokens/app_tokens.dart` (md5 `80d9f74ffa658329e3e1100fe7748f95`, **tidak diubah**)
- **Salinan di app:** `app/lib/core/theme/app_tokens.dart`, isinya verbatim. Yang ditambahkan hanya header dan `// ignore_for_file: prefer_const_constructors`.
- **Adapter:** `app/lib/core/theme/solbot_theme.dart`. Semua patch ada di sini, jadi file generate bisa langsung diganti waktu ada drop token baru.
- **Toolchain:** Flutter 3.47.8 stable (Dart 3.13.7), `flutter_lints`. Reviewer: Flutter Mobile Specialist, 29 Okt 2026.

## Ringkasan
| Cek | Hasil |
|---|---|
| Compile error | **0**. File compile dan dipakai sebagai `theme`/`darkTheme` |
| `flutter analyze` (file mentah) | 4 info `prefer_const_constructors` (baris 152, 161, 176, 186) |
| API deprecated (`withOpacity`, `MaterialStateProperty`, `background`/`onBackground`, `surfaceVariant`, `CardTheme`, `textScaleFactor`) | **Tidak ada.** File sudah pakai `CardThemeData` dan `surfaceContainer*` |
| `ThemeExtension.lerp` | Ada dan benar (diuji di `test/theme_tokens_test.dart`) |
| `ThemeExtension.copyWith` | **Tidak berfungsi**: tanpa parameter, selalu `return this` |
| Kontras (pasangan di contrast-report) | Semua PASS |
| Kontras (pasangan yang dipakai widget M3 tapi tidak dicek report) | **4 FAIL** di dark, 2 FAIL di light (lihat T-03) |
| Font | `Inter`/`JetBrainsMono` dirujuk tapi tidak dibundel dan tidak ada fallback, jadi diam-diam jatuh ke Roboto |

## Temuan & saran perbaikan
Prioritas: **P1** = perbaiki sebelum dipakai prod, **P2** = sebaiknya, **P3** = kosmetik.

| ID | P | Temuan | Saran (di `build_tokens.py`) | Status di app (v0) |
|---|---|---|---|---|
| T-01 | P1 | **Font tidak dibundel, nama family tidak konsisten.** Dart memakai `'Inter'` dan `'JetBrainsMono'`, sedangkan `tokens.json` menulis `"JetBrains Mono"`. `fontFamilyFallback` tidak ada, jadi fallback stack di tokens.json (SF Pro, Roboto, …) hilang. Akibatnya angka **tidak tabular-mono** di device (terlihat di screenshot). | Tetapkan satu nama family (mis. `JetBrainsMono`), tambahkan `fontFamilyFallback: ['SF Pro Text','Roboto']` / `['SF Mono','Roboto Mono','monospace']`, dan dokumentasikan blok `fonts:` pubspec (Inter 400/500/600, JetBrains Mono 500/600) di README. | Belum dibundel (tidak ada aset font di repo). Masih open dependency ke UX |
| T-02 | P1 | `TradeColors.copyWith() => this` tanpa parameter, sehingga override per-widget/per-mode tidak mungkin dilakukan dan kontrak `ThemeExtension` jadi tidak berguna. | Generate `copyWith({Color? profit, … })` untuk semua 15 field. | Tidak dipatch (tidak dipakai). Menunggu regen |
| T-03 | P1 | **Kontras di luar report.** Dark: `outline` = `borderStrong` #56647F di atas `bgRaised` **2,70:1** (<3:1, dipakai OutlinedButton/Switch/TextField di kartu raised). `textTertiary` di atas `bgOverlay` **4,41:1** (<4,5, dipakai dialog/menu = `surfaceContainerHighest`). `outlineVariant` = `borderDefault` 1,73:1 dan `borderSubtle` 1,28:1 di atas surface. Light: `borderDefault` 1,50:1, `borderSubtle` 1,24:1. | Naikkan dark `borderStrong` ke ±#5E6D8A (≥3:1 di raised) dan `textTertiary` ke ±#8C97AD. Dokumentasikan bahwa `outlineVariant`/`borderSubtle` **hanya dekoratif**, jangan dipakai sebagai satu-satunya batas komponen interaktif. Tambahkan pasangan ini ke `contrast-report`: (fg × semua `bg.*`), (`outline` × `bg.raised`), (`onX` × `X` untuk semua role ColorScheme). | Adapter memaksa OutlinedButton memakai `borderStrong`. Kartu tetap `borderSubtle` (dekoratif) |
| T-04 | P2 | `TextTheme` tidak lengkap: `titleSmall`, `labelMedium`, `displayLarge/Medium`, `headlineLarge/Medium` tidak ada, jadi widget M3 (ListTile subtitle, Chip, NavigationBar label) jatuh ke Roboto default dengan metrik berbeda. SPEC menyebut "label 13/16" dan "caption 12/16", tapi mapping ke slot M3 tidak didokumentasikan. | Generate ke-15 slot M3. Tambahkan tabel mapping SPEC→M3 di README. Tambahkan `letterSpacing` dari tokens.json (saat ini diabaikan). | Adapter menambah `titleSmall` dan `labelMedium` |
| T-05 | P3 | `prefer_const_constructors` ×4: `ColorScheme(...)` dan `BorderSide(...)` bisa `const`. File tidak di-`dart format` (baris panjang hingga ±900 kolom), sehingga diff review sulit. | Emit `const` dan jalankan `dart format` di akhir script. | Disuppress di salinan lewat `ignore_for_file` |
| T-06 | P2 | `extension TradeColorsX … get trade => …extension<TradeColors>()!`. Kalau ada theme tanpa extension (test, dialog dengan `Theme(data: …)` baru), app **crash**. Nama `trade` juga terlalu generik dan rawan bentrok. | Kembalikan fallback `?? TradeColors.dark` atau assert dengan pesan jelas. Ganti nama jadi `tradeColors`. | App memakai `context.tradeColors` (null-safe) dari adapter |
| T-07 | P2 | `semanticNeutralPnl` dan `semanticInfoContainer` didefinisikan di `AppColors*` tapi **tidak ada** di `TradeColors`, padahal SPEC §1 mewajibkan "Nol = netral ±0". | Tambahkan `neutral` dan `infoContainer` ke `TradeColors` (+ lerp/copyWith). | Adapter: `pnl(v, neutral: onSurfaceVariant)` |
| T-08 | P2 | Token **elevation** (0–4, shadow) dan **density** compact ada di tokens.json tapi tidak diterjemahkan ke Dart. `surfaceTint` tidak diset (M3 default = primary), sehingga kartu/sheet ber-elevation tampak keunguan, berbeda dari SPEC "dark: surface tint + shadow lemah". | Emit `AppElevation` (BoxShadow list) dan set `surfaceTint` (atau `Colors.transparent`) serta `shadow`. | Belum. Semua kartu elevation 0 |
| T-09 | P2 | ColorScheme tidak lengkap: `tertiaryContainer`/`onTertiaryContainer`, `inverseSurface`/`onInverseSurface`/`inversePrimary` (dipakai **SnackBar**), dan `scrim`/`shadow` tidak diset, sehingga M3 men-derive warna yang tidak ada di palet. | Petakan `info*` ke tertiary container, tambahkan token `inverse.*`. | Belum (SnackBar memakai derivasi M3) |
| T-10 | P3 | Hanya `FilledButton` yang diberi theme. Varian SPEC (secondary, ghost, **success/Approve**, danger, **real-mode magenta**) tidak punya `ButtonStyle` helper, jadi tiap screen harus `styleFrom` manual dan rawan tidak konsisten. | Generate `AppButtons.success(context)`, `.danger`, `.real`, plus `outlinedButtonTheme`/`textButtonTheme` dengan `tapMin`. | Adapter menambah `outlinedButtonTheme`. Approve memakai `styleFrom(profit/real)` lokal |
| T-11 | P3 | Penamaan: `AppSpace.s0_5` (underscore di identifier, tidak kena lint saat ini tapi melanggar gaya lowerCamelCase Dart). `numStyle()` adalah fungsi global tanpa namespace. Nama produk "Sentra" (working name, dikonfirmasi team lead) belum diterapkan di app (masih "SolBot"/`solbot_mobile`). | Ganti jadi `AppSpace.s0half`/`xxs` dan `AppText.num(size)`. Rename app ke `sentra_mobile` / `com.sentra.app` saat pindah ke monorepo. | Dipakai apa adanya |
| T-12 | P3 | `useMaterial3: true` redundan (default sejak Flutter 3.16, parameter dijadwalkan deprecated). | Hapus. | – |
| T-13 | P3 | `AppMotion` belum punya helper reduced-motion (SPEC: `prefers-reduced-motion` → 0 ms, tapi hold tetap). | Tambahkan `AppMotion.of(context)` yang membaca `MediaQuery.disableAnimations`. | Hold-to-confirm memakai `holdPractice`/`holdReal` langsung |
| T-14 | info | `TradeColors.lerp(TradeColors? o, …)` mempersempit tipe parameter. Ini valid karena parameter base `covariant`, tapi lebih aman pakai `ThemeExtension<TradeColors>? other` + `is!` check. | Opsional. | OK, ada test |

## Hasil verifikasi setelah integrasi
- `flutter analyze`: **No issues found** (dengan suppress T-05 di salinan).
- `flutter test`: **17/17 lulus**, termasuk `theme_tokens_test.dart` (extension ada, lerp dark↔light, warna netral PnL, format `▲ +0,412` / `▼ −2,506` / `±0`).
- Screenshot web (`screens/*.png`) memakai palet "Calm Ledger" dark. Font jatuh ke Roboto (T-01).

## Yang diminta dari UX UI Designer
1. Regen `app_tokens.dart` dengan T-01, T-02, T-03, T-06, T-07 (P1/P2).
2. File font (lisensi OFL Inter + JetBrains Mono) atau persetujuan memakai paket `google_fonts`.
3. Konfirmasi mapping tipografi SPEC→M3 (T-04) dan varian tombol (T-10).
