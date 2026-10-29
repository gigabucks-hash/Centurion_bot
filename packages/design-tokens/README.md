# @sentra/design-tokens

Owner: UX UI Designer. Sentra adalah working name.
**Sumber kebenaran:** `src/tokens.json` (W3C DTCG). Jalankan `python3 scripts/build.py` (atau `npm run build`). Tidak butuh dependency, cukup Python 3.9+. `dart format` dipakai otomatis kalau tersedia. Build gagal kalau ada pasangan warna di bawah WCAG AA (`tokens/contrast-report.md`).
Sumber desain beserta wireframe dan spec: `/workspace/ux-solbot` (tokens.json di sana identik, disinkronkan oleh UX).

| Output (`tokens/`) | Konsumen | Cara pakai |
|---|---|---|
| `tailwind.theme.css` | `apps/web` (Next.js + **Tailwind v4**) | `@import "tailwindcss"; @import "@sentra/design-tokens/tailwind.theme.css";` |
| `tauri.css` | `apps/desktop` (Tauri v2) | dark default, **Compact default** (kontrol 32px, hit 24px). Disarankan `sync-tokens.mjs` menyalin file ini, bukan `tokens.css` |
| `tokens.css` | CSS non-Tailwind / prototipe | dark + comfortable default; `[data-theme]`, `[data-mode]`, `[data-density]` |
| `app_tokens.dart` | `apps/mobile` (Flutter M3) | salin ke `lib/core/theme/`, butuh `google_fonts` |
| `tailwind.config.tokens.legacy-v3.js` | legacy | tidak dipakai MVP |

Atribut runtime: `data-theme="dark|light"` · `data-mode="practice|real"` · `data-density="comfortable|compact"`.
Panduan lengkap (font bundling, Tailwind v4 utilities, mapping M3, aturan Tauri, WCAG 2.5.8): `/workspace/ux-solbot/tokens/README.md`.

Breaking v0.2.0 (untuk Flutter): `context.trade` → `context.tradeColors`, `numStyle()` → `AppText.num()`, `AppSpace.s0_5` → `AppSpace.sHalf`. Warna berubah: dark `border.strong` #6B7995, `text.tertiary` #919CB2.

**v0.2.1 (29 Okt 2026, fix):** `tauri.css` v0.2.0 punya satu `}` berlebih setelah blok light (sisa penghapusan `@media prefers-color-scheme` di generator) → build Desktop gagal. Diperbaiki di `scripts/build.py`. Build sekarang memvalidasi CSS: brace-balance selalu + parse penuh `lightningcss` (errorRecovery off) bila tersedia (`LIGHTNINGCSS_NODE_PATH`, default `/tmp/twcheck/node_modules`). Build exit 1 kalau CSS invalid. Tidak ada perubahan token/nilai.

**v0.2.2 (29 Okt 2026):** T-15 helper Dart `TradeColors.pnlArrow()` / `pnlSign()` (nol persis = netral, tanpa panah/tanda; pasangan `pnlSol()` di `@sentra/i18n`). T-17 nama file bundling font. Tidak ada perubahan nilai token.

**v0.2.3 (29 Okt 2026, 17.36 WIB):** semua output kode (`.dart`, `.css`, `.js`) ≤ 120 kolom (T-16: header + 2 doc comment Dart, rule `[data-mode]`, `html, body`, reduced-motion, komentar Tauri/Tailwind dipecah) + lint di `scripts/build.py` (build exit 1 bila ada baris > 120). README font: 3 koreksi dari TOKENS_REVIEW Flutter (Inter dari Google Fonts **selalu** `static/Inter_18pt-*` → wajib rename; google_fonts mencocokkan **suffix** nama file; JetBrains Mono **tanpa** rename). Tidak ada perubahan nilai token / API Dart.

## Font bundling (Flutter, T-17)
MVP: `google_fonts` (unduh runtime). Production: google_fonts 9.x mencocokkan aset dengan **suffix**: nama file tanpa ekstensi harus **berakhiran** `<FamilyTanpaSpasi>-<Weight>` (`Inter-Regular`, `JetBrainsMono-Medium`). Variable font tidak dicocokkan; aset dimuat tanpa cek hash.

| Family | Weight dipakai | Nama file yang dibundel (harus berakhiran ini) | Dari unduhan Google Fonts |
|---|---|---|---|
| Inter | 400 · 500 · 600 | `Inter-Regular.ttf` · `Inter-Medium.ttf` · `Inter-SemiBold.ttf` | `static/Inter_18pt-{Regular,Medium,SemiBold}.ttf`, **wajib rename** ke `Inter-*.ttf` |
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
