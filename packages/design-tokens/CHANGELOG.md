# Changelog — @sentra/design-tokens (Centurion Trade)

## 0.3.2 — 3 Nov 2026 · docs (keputusan lead)
Tidak ada perubahan nilai, nama token, atau output generator. Build + semua cek dijalankan ulang: contrast FAIL 0, CSS valid, baris ≤ 120.
- **Guard vs warning:** di light theme, ΔE2000 guard #A85400 vs warning #8A5A00 = 10,1, **diterima apa adanya berdasarkan keputusan lead**. Aturan di README: guard selalu pakai ikon perisai + label, warning selalu pakai segitiga, dan warna tidak pernah jadi satu-satunya penanda.
- **Sora:** path `static/Sora-SemiBold.ttf` dihapus karena tidak ada di Google Fonts. `Sora-SemiBold.ttf` di-instance dari `Sora[wght].ttf` pada wght 600. Sumber + sha256: `/workspace/ux-solbot/visual/g1-blue/fonts/SOURCE.md`.
- **Ukuran logo:** set file proxy `s` = 48/64/96/128/192. Klien meminta ukuran terkecil yang ≥ px × dpr. Masih pending di contracts Backend.

## 0.3.1 — 3 Nov 2026 · Guard status = amber (keputusan lead)
Status guard (chip "Guard", ikon perisai, banner guard-reject) pindah dari violet ke **amber/oranye**. Violet lama terlalu dekat dengan aksen biru G1 dan Real magenta di layar kecil. Hanya nilai yang berubah; nama token tetap (`semantic.guard`, `semantic.guardContainer`; CSS `--color-semantic-guard*`; Dart `TradeColors.guard/guardContainer`, `AppColors*.semanticGuard*`).

| token | 0.3.0 | 0.3.1 |
|---|---|---|
| `color.dark.semantic.guard` | #B39BFF | **#E57A12** |
| `color.dark.semantic.guardContainer` | #241B45 | **#361C08** |
| `color.light.semantic.guard` | #6A3FD1 | **#A85400** |
| `color.light.semantic.guardContainer` | #EDE6FF | **#FFF1E6** |

**Cek baru di `scripts/build.py` (exit 1 kalau gagal):** ΔE2000 `semantic.guard` vs `semantic.profit`, `semantic.loss`, `mode.practice`, `mode.real`, `brand.primary` ≥ 20 di kedua tema; vs `semantic.warning` ≥ 20 (dark) / ≥ 8 (light, pengecualian terdokumentasi, lihat di bawah).

| ΔE2000 guard vs | profit | loss | practice | real | brand | warning |
|---|---|---|---|---|---|---|
| dark #E57A12 | 54,2 | 24,7 | 50,4 | 43,4 | 52,5 | 21,4 |
| light #A85400 | 46,4 | 20,5 | 43,4 | 38,5 | 50,5 | 10,1 |

**Kontras (teks, AA 4,5:1):** dark: canvas 6,67 · surface 6,24 · raised 5,77 · overlay 5,26 · sunken 6,79 · di guardContainer 5,37. Light: canvas 4,98 · surface/raised/overlay 5,34 · sunken 4,68 · di guardContainer 4,82. Total contrast FAIL: 0.

**Guard vs `semantic.warning` (#F5C04E / #8A5A00).** Warning sudah amber-kuning; tidak ada token amber/oranye lain (palet identicon #1 #8A4A1F berjarak ΔE 25,3 dan hanya dipakai untuk avatar koin, bukan status). Guard dibuat **lebih oranye** (hue ~30°, warning ~42°). Dark lolos ≥ 20. Di light theme, tidak ada amber yang sekaligus AA di #EEF0F5, ≥ 20 dari loss #C0262D, dan ≥ 20 dari warning #8A5A00. Ruang antara kuning-tua dan merah terlalu sempit, dan semua kandidat yang lolos berwarna cokelat gelap (#3x2x1x), jadi tidak terbaca sebagai amber. Berbagi keluarga warna dengan warning dianggap aman karena:
1. keduanya memang satu makna, yaitu "perhatian, tidak destruktif". Merah tetap khusus untuk loss/error;
2. guard **selalu** tampil dengan ikon perisai + label "Guard"/alasan guard, sedangkan warning memakai ikon segitiga. Warna tidak pernah menjadi satu-satunya penanda (WCAG 1.4.1);
3. guard dan warning tidak dipakai berdampingan sebagai pembeda status dalam satu sel atau kolom.
Kalau nanti dibutuhkan ≥ 20 di light, opsinya adalah menggeser `light.semantic.warning` ke kuning-zaitun. Itu perubahan token lain dan butuh keputusan lead.

Tidak berubah: semua token lain. **Renamed/removed:** tidak ada.

## 0.3.0 — 3 Nov 2026 · G1-blue (Boss-chosen direction)
Arah visual pilihan Boss = Canva concept G1, dengan satu perubahan: aksen violet → **biru**. Ini perubahan **nilai**; nama token lama tetap.

- **Renamed:** tidak ada. **Removed:** tidak ada (`bg.inset` tetap alias deprecated ke `bg.sunken`; penghapusan ditunda ke ≥ 0.4.0).
- **Generator (`scripts/build.py`):** output baru `--font-display`, `--text-eyebrow*`, `--density-tableHeader`, `--density-coinLogo`, `--coin-logo-*`, `--color-identicon-*`; Dart `AppFonts.display`, `AppText.eyebrow()`, `AppCoinLogo`, `AppDensity.tableHeader/coinLogo` (constructor `AppDensity(...)` kini butuh 2 field tambahan — hanya relevan kalau ada yang membuat instance sendiri; `flutter analyze` apps/mobile bersih). Slot M3 display*/headline*/titleLarge memakai Sora.
- **Cek baru di build:** identicon fg vs 12 palet ≥ 4,5:1; ΔE2000 `brand.primary` vs `mode.practice`/`mode.real`/`semantic.profit`/`semantic.loss` ≥ 20. Semua lulus (dark 30,6 / 36,0 / 50,5 / 42,0; light 21,2 / 34,3 / 45,5 / 43,0).
- Header file hasil generate: "Sentra (working name)" → "Centurion Trade (@sentra/design-tokens)".

### Nilai yang berubah (old → new)
| token | 0.2.5 | 0.3.0 |
|---|---|---|
| `color.dark.bg.canvas` | #0B0E14 | #0A0B10 |
| `color.dark.bg.surface` | #121722 | #12141B |
| `color.dark.bg.raised` | #1A2130 | #191C25 |
| `color.dark.bg.overlay` | #222B3D | #20242F |
| `color.dark.bg.sunken` | #080A0F | #07080C |
| `color.dark.border.subtle` | #232C3D | #1E222C |
| `color.dark.border.default` | #34405A | #2C313E |
| `color.dark.border.strong` | #6B7995 | #6C7590 |
| `color.dark.border.focus` | #9AA8FF | #8AB4FF |
| `color.dark.text.primary` | #E8ECF4 | #ECEEF4 |
| `color.dark.text.secondary` | #A9B3C7 | #A9B0C0 |
| `color.dark.text.tertiary` | #919CB2 | #9299AD |
| `color.dark.text.disabled` | #5A6479 | #565D6E |
| `color.dark.text.onAccent` | #0B0E14 | #06080D |
| `color.dark.brand.primary` | #8B97FF | #4F8CFF |
| `color.dark.brand.primaryHover` | #A3ADFF | #6E9FFF |
| `color.dark.brand.primaryPressed` | #7280F5 | #3A78F0 |
| `color.dark.brand.primaryContainer` | #1E2550 | #0F2246 |
| `color.dark.brand.onPrimaryContainer` | #D6DAFF | #D4E2FF |
| `color.dark.semantic.info` | #6CB6FF | #7AA7FF |
| `color.dark.semantic.infoContainer` | #0F2440 | #0F2140 |
| `color.dark.inverse.surface` | #E8ECF4 | #ECEEF4 |
| `color.dark.inverse.onSurface` | #121722 | #12141B |
| `color.dark.inverse.primary` | #3E4FD6 | #1F5FD1 |
| `color.dark.skeleton.base` | #262F43 | #272D3C |
| `color.dark.skeleton.highlight` | #343F58 | #353C4E |
| `color.light.border.focus` | #3E4FD6 | #1F5FD1 |
| `color.light.brand.primary` | #3E4FD6 | #1F5FD1 |
| `color.light.brand.primaryHover` | #3341BD | #1A52B8 |
| `color.light.brand.primaryPressed` | #2A36A3 | #15459C |
| `color.light.brand.primaryContainer` | #E3E6FF | #E1EBFF |
| `color.light.brand.onPrimaryContainer` | #18206B | #0E2A66 |
| `color.light.inverse.surface` | #1A2130 | #191C25 |
| `color.light.inverse.onSurface` | #E8ECF4 | #ECEEF4 |
| `color.light.inverse.primary` | #8B97FF | #6E9FFF |
| `typography.comfortable.display` | family sans | family display |
| `typography.comfortable.headline` | family sans | family display |
| `typography.comfortable.title` | family sans | family display |
| `typography.compact.display` | family sans | family display |
| `typography.compact.headline` | family sans | family display |
| `typography.compact.title` | family sans | family display |

**Renamed:** none. **Removed:** none.

**Added:** `font.family.display`, `typography.comfortable.eyebrow`, `typography.compact.eyebrow`, `density.comfortable.tableHeader`, `density.comfortable.coinLogo`, `density.compact.tableHeader`, `density.compact.coinLogo`, `coin.logo.size.sm`, `coin.logo.size.md`, `coin.logo.size.lg`, `coin.logo.size.card`, `coin.logo.size.detail`, `coin.logo.ring.dark`, `coin.logo.ring.light`, `coin.logo.notTradeableOpacity`, `coin.identicon.fg`, `coin.identicon.palette.0..11`.

Tidak berubah: semua `mode.*` (Practice cyan #3FD0E0, Real magenta #FF7DC4), `semantic.profit/loss/warning/guard`, spacing, radius, motion (hold 1,2 dtk Practice / 2,5 dtk Real), density compact row 32 px.
