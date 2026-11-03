# Changelog — @sentra/design-tokens (Centurion Trade)

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
