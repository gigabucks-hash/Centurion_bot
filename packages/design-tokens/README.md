# @centurion/design-tokens

Owner: UX UI Designer. Aplikasi: **Centurion Trade**. Nama package tetap `@centurion/design-tokens` (codename internal).
**Sumber kebenaran:** `src/tokens.json` (W3C DTCG). Jalankan `python3 scripts/build.py` (atau `npm run build`). Tidak butuh dependency, cukup Python 3.9+. `dart format` dipakai otomatis kalau tersedia. Build gagal kalau ada pasangan warna di bawah WCAG AA (`tokens/contrast-report.md`).
Sumber desain beserta wireframe dan spec: `/workspace/ux-solbot` (tokens.json di sana identik, disinkronkan oleh UX).

| Output (`tokens/`) | Konsumen | Cara pakai |
|---|---|---|
| `tailwind.theme.css` | `apps/web` (Next.js + **Tailwind v4**) | `@import "tailwindcss"; @import "@centurion/design-tokens/tailwind.theme.css";` |
| `tauri.css` | `apps/desktop` (Tauri v2) | dark default, **Compact default** (kontrol 32px, hit 24px). Disarankan `sync-tokens.mjs` menyalin file ini, bukan `tokens.css` |
| `tokens.css` | CSS non-Tailwind / prototipe | dark + comfortable default; `[data-theme]`, `[data-mode]`, `[data-density]` |
| `app_tokens.dart` | `apps/mobile` (Flutter M3) | salin ke `lib/core/theme/`, butuh `google_fonts` |
| `tailwind.config.tokens.legacy-v3.js` | legacy | tidak dipakai MVP |

Atribut runtime: `data-theme="dark|light"` · `data-mode="practice|real"` · `data-density="comfortable|compact"`.
Panduan lengkap (font bundling, Tailwind v4 utilities, mapping M3, aturan Tauri, WCAG 2.5.8): `/workspace/ux-solbot/tokens/README.md`.

Breaking v0.2.0 (untuk Flutter): `context.trade` → `context.tradeColors`, `numStyle()` → `AppText.num()`, `AppSpace.s0_5` → `AppSpace.sHalf`. Warna berubah: dark `border.strong` #6B7995, `text.tertiary` #919CB2.

**v0.3.2 (3 Nov 2026) — docs saja, nilai token tidak berubah:** aturan guard vs warning (§ "Guard vs warning"), path sumber Sora diperbaiki (§ Font bundling), set ukuran logo proxy (§ "Ukuran file logo koin"). Detail: `CHANGELOG.md`.

**v0.3.1 (3 Nov 2026) — guard status amber (keputusan lead):** `semantic.guard` dark #E57A12 / light #A85400 (container #361C08 / #FFF1E6), cek ΔE2000 guard vs PnL/mode/aksen/warning di build. Detail: `CHANGELOG.md`.

**v0.3.0 (3 Nov 2026) — G1-blue (arah pilihan Boss: Canva G1, aksen violet → biru).** Perubahan nilai, bukan rename: **tidak ada token yang di-rename atau dihapus** (`bg.inset` tetap alias deprecated; penghapusan ditunda ke ≥ 0.4.0). Detail lengkap + tabel old → new: `CHANGELOG.md`.
- Warna dark: surface near-black (`bg.canvas` #0A0B10 …), border/teks dirapikan, `brand.primary` **#4F8CFF** (biru, hue 219°; dulu violet #8B97FF), `border.focus` #8AB4FF, `semantic.info` #7AA7FF (keluarga biru). Light: `brand.primary` #1F5FD1.
- `mode.practice` (#3FD0E0) dan `mode.real` (#FF7DC4) **tidak berubah**. Build sekarang mengecek ΔE2000 `brand.primary` vs `mode.practice`/`mode.real`/`semantic.profit`/`semantic.loss` ≥ 20 (dark: 30,6 / 36,0 / 50,5 / 42,0).
- Tipografi: token baru `font.family.display` = **Sora** (OFL) untuk display/headline/title, plus style baru `typography.*.eyebrow` (Sora 600, 11/10 px, tracking 0,16em; CSS `--text-eyebrow`, Dart `AppText.eyebrow()`). `overline` tidak berubah. Body tetap Inter, angka tetap JetBrains Mono. CSS `--font-display` (Tailwind `font-display`), Dart `AppFonts.display` + slot M3 display*/headline*/titleLarge memakai `GoogleFonts.sora`. Bundling: tambah `Sora-SemiBold.ttf` (+ `Sora-OFL.txt`).
- Density baru: `density.{comfortable,compact}.tableHeader` (36/28) dan `.coinLogo` (32/24) → CSS `--density-tableHeader`, `--density-coinLogo`, Dart `AppDensity.tableHeader/coinLogo`. Compact row tetap 32 px.
- Coin logo (final, COIN_LOGO.md): `coin.logo.size.{sm,md,lg,card,detail}` 20/24/32/48/64, `coin.logo.ring.{dark,light}`, `coin.logo.notTradeableOpacity` 0,55, `coin.identicon.fg` + `coin.identicon.palette.0..11`. CSS `--coin-logo-size-*`, `--coin-logo-ring` (per tema), `--color-identicon-{0..11,fg}` (Tailwind `bg-identicon-7`), Dart `AppCoinLogo`. Build mengecek fg vs 12 palet ≥ 4,5:1.

**v0.2.1 (29 Okt 2026, fix):** `tauri.css` v0.2.0 punya satu `}` berlebih setelah blok light (sisa penghapusan `@media prefers-color-scheme` di generator) → build Desktop gagal. Diperbaiki di `scripts/build.py`. Build sekarang memvalidasi CSS: brace-balance selalu + parse penuh `lightningcss` (errorRecovery off) bila tersedia (`LIGHTNINGCSS_NODE_PATH`, default `/tmp/twcheck/node_modules`). Build exit 1 kalau CSS invalid. Tidak ada perubahan token/nilai.

**v0.2.2 (29 Okt 2026):** T-15 helper Dart `TradeColors.pnlArrow()` / `pnlSign()` (nol persis = netral, tanpa panah/tanda; pasangan `pnlSol()` di `@centurion/i18n`). T-17 nama file bundling font. Tidak ada perubahan nilai token.

**v0.2.3 (29 Okt 2026, 17.36 WIB):** semua output kode (`.dart`, `.css`, `.js`) ≤ 120 kolom (T-16: header + 2 doc comment Dart, rule `[data-mode]`, `html, body`, reduced-motion, komentar Tauri/Tailwind dipecah) + lint di `scripts/build.py` (build exit 1 bila ada baris > 120). README font: 3 koreksi dari TOKENS_REVIEW Flutter (Inter dari Google Fonts **selalu** `static/Inter_18pt-*` → wajib rename; google_fonts mencocokkan **suffix** nama file; JetBrains Mono **tanpa** rename). Tidak ada perubahan nilai token / API Dart.

**v0.2.5 (29 Okt 2026):** skeleton — `color.{dark,light}.skeleton.{base,highlight}` (`--color-skeleton-*`, Tailwind `bg-skeleton-base`, Dart `skeletonBase`/`skeletonHighlight`), `motion.duration.{shimmer,skeletonDelay,skeletonMin}`, CSS `.skeleton`, `.skeleton--text`, `.skeleton--circle`; reduced motion = statis; build cek visibilitas ≥1,15:1. Spec: ux-solbot `docs/PERFORMANCE_BUDGET.md`.

**v0.2.4 (29 Okt 2026):** token resmi `bg.sunken` (`--color-bg-sunken`, Tailwind `bg-bg-sunken`, Dart `bgSunken`). `bg.inset` / `--color-bg-inset` / `bgInset` jadi alias deprecated yang menunjuk ke `bg.sunken`, dengan nilai sama sehingga tampilan tidak berubah. Detail di bawah.

## Guard vs warning (0.3.1, keputusan lead 0.3.2)
`semantic.guard` (amber-oranye) dan `semantic.warning` (amber-kuning) satu keluarga warna. Dark: ΔE2000 21,4. Light: **ΔE2000 10,1, diterima apa adanya berdasarkan keputusan lead**. Di light theme tidak ada amber yang AA, ≥ 20 dari `semantic.loss`, sekaligus ≥ 20 dari warning. Build mengecek floor light ≥ 8.
Aturan wajib di semua platform:
- **Guard selalu tampil dengan ikon perisai + label** ("Guard" atau alasan guard).
- **Warning selalu tampil dengan ikon segitiga.**
- **Warna tidak pernah menjadi satu-satunya penanda** (WCAG 1.4.1). Chip, badge, baris feed, dan banner wajib punya ikon + teks.

## Ukuran file logo koin (proxy, 0.3.2)
Token `coin.logo.size.*` = ukuran **tampil** (20/24/32/48/64 px). Proxy backend menyajikan file di set **`s` = 48 / 64 / 96 / 128 / 192** (`GET /v1/img/coin/{mint}?s=…&v={logo_hash}`).
Aturan klien: minta **ukuran terkecil di set yang ≥ px × dpr** (dpr = devicePixelRatio; Desktop maks. 2). Kalau melebihi 192, pakai 192.
| tampil | @1x | @2x | @3x |
|---|---|---|---|
| 20 | 48 | 48 | 64 |
| 24 | 48 | 48 | 96 |
| 32 | 48 | 64 | 96 |
| 48 | 48 | 96 | 192 |
| 64 | 64 | 128 | 192 |
**Status:** s=128/192 dan aturan nearest-size **masih pending di contracts Backend** (contracts saat ini: `s=48|64|96`). Sampai landed, pakai 96 untuk kebutuhan > 96.
Spek: `/workspace/ux-solbot/docs/COIN_LOGO.md` §2.

## Surface `bg.sunken` (0.2.4)
Token resmi untuk **inset well, background input, code block, chip/kartu "Tidak bisa ditradingkan"** (di wireframe disebut `surface.sunken`).
| Tema | Nilai | CSS | Tailwind | Dart |
|---|---|---|---|---|
| dark | `#080A0F` | `--color-bg-sunken` | `bg-bg-sunken` | `AppColorsDark.bgSunken` |
| light | `#EEF0F5` | `--color-bg-sunken` | `bg-bg-sunken` | `AppColorsLight.bgSunken` |

`bg.inset` (nama lama) = **alias deprecated**: `--color-bg-inset: var(--color-bg-sunken)` di tokens.css / tauri.css / tailwind.theme.css (utility `bg-bg-inset` tetap ada), Dart `@Deprecated bgInset = bgSunken`. Nilai sama, jadi pemakaian Desktop/Web sekarang tidak berubah tampilan. Hapus alias paling cepat di 0.3.0. M3: `surfaceContainerLowest` + `InputDecorationTheme.fillColor` = `bgSunken`. Kontras: semua token teks di `bg.sunken` ≥ 4.5:1 (dark min `text.tertiary` 7,17:1; light min `semantic.profit` 4,73:1, `text.tertiary` 5,06:1), `border.strong` ≥ 3:1 (dark 4,52, light 3,17). `text.disabled` dikecualikan (WCAG SC 1.4.3, komponen nonaktif).

## Font bundling (Flutter, T-17)
MVP: `google_fonts` (unduh runtime). Production: google_fonts 9.x mencocokkan aset dengan **suffix**: nama file tanpa ekstensi harus **berakhiran** `<FamilyTanpaSpasi>-<Weight>` (`Inter-Regular`, `JetBrainsMono-Medium`). Variable font tidak dicocokkan; aset dimuat tanpa cek hash.

| Family | Weight dipakai | Nama file yang dibundel (harus berakhiran ini) | Dari unduhan Google Fonts |
|---|---|---|---|
| Inter | 400 · 500 · 600 | `Inter-Regular.ttf` · `Inter-Medium.ttf` · `Inter-SemiBold.ttf` | `static/Inter_18pt-{Regular,Medium,SemiBold}.ttf`, **wajib rename** ke `Inter-*.ttf` |
| Sora (0.3.0) | 600 (display/headline/title) | `Sora-SemiBold.ttf` | **Tidak ada** `static/Sora-SemiBold.ttf` di Google Fonts (`github.com/google/fonts` `ofl/sora` hanya punya variable `Sora[wght].ttf`). File ini di-*instance* dari `Sora[wght].ttf` pada **wght 600** (fontTools `varLib.instancer --static --update-name-table`). Ambil file siap pakai + sha256 + `OFL.txt` di `/workspace/ux-solbot/visual/g1-blue/fonts/` (lihat `SOURCE.md`) |
| JetBrains Mono | 500 · 600 (angka, `AppText.num`) | `JetBrainsMono-Medium.ttf` · `JetBrainsMono-SemiBold.ttf` | `static/JetBrainsMono-{Medium,SemiBold}.ttf`, **tanpa rename** |

Weight lain (mis. JetBrains Mono 700) tidak dibundel: `AppText.num(weight: w700)` gagal saat runtime fetching OFF. Pakai w500/w600.

Ambil file statis dari fonts.google.com. Inter dari Google Fonts **selalu** berawalan optical size (`static/Inter_18pt-*`, `_24pt`, `_28pt`; tidak ada static tanpa prefix): pakai 18pt lalu **ganti nama** ke `Inter-*.ttf` (OFL 1.1 tanpa Reserved Font Name, rename boleh). JetBrains Mono sudah bernama benar, **tidak perlu rename**. Alternatif: rilis resmi rsms/inter dan JetBrains/JetBrainsMono. Taruh di `assets/google_fonts/` bersama `OFL.txt` masing-masing font (`Inter-OFL.txt`, `JetBrainsMono-OFL.txt`).
  ```yaml
  flutter:
    assets:
      - assets/google_fonts/     # .ttf + OFL; JANGAN didaftarkan lagi di `fonts:`
  ```
  ```dart
  void main() {
    GoogleFonts.config.allowRuntimeFetching = false;   // production: gagal keras kalau file tidak ada
    LicenseRegistry.addLicense(() async* {
      for (final f in ['Inter-OFL.txt', 'JetBrainsMono-OFL.txt']) {
        yield LicenseEntryWithLineBreaks(['google_fonts'], await rootBundle.loadString('assets/google_fonts/$f'));
      }
    });
    runApp(const App());
  }
  ```
Lisensi: kedua font memakai **SIL Open Font License 1.1**. Boleh di-bundle dan didistribusikan di app, dengan syarat teks OFL ikut disertakan, font tidak dijual terpisah, dan nama font tidak dipakai untuk versi modifikasi. Jangan pakai weight lain (mis. `w700`) tanpa menambah file; kalau fetch dimatikan, weight yang tidak ada akan error. Uji CI: widget test dengan `allowRuntimeFetching = false` yang merender `AppText.num` dan `bodyMedium`.
