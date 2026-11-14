# fonts/ · sumber dan checksum

| File | Sumber | sha256 |
|---|---|---|
| `Inter-Bold.ttf` | Rilis resmi **rsms/inter v4.1** (2024-11-16), `Inter-4.1.zip` → `extras/ttf/Inter-Bold.ttf`, tidak diubah. Name table: "Inter" / "Bold", Version 4.001;git-9221beed3, usWeightClass 700 | `288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f` |
| `Inter-OFL.txt` | `LICENSE.txt` dari zip yang sama (SIL Open Font License 1.1) | — |

- Zip: https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip · sha256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e` (diunduh 3 Nov 2026 WIB).
- Dipakai untuk: inisial identicon logo koin (`docs/COIN_LOGO.md` §4: `#F4F6FB`, **Inter 700**; vektor di `visual/coin-logo-spec.html` juga 700).
  Web and desktop use this file for those initials. The Flutter font bundle was removed with the mobile app.
- Sora (display) tetap di `/workspace/ux-solbot/visual/g1-blue/fonts/` (lihat `SOURCE.md` di sana); belum ada di paket ini.
- Verifikasi: `sha256sum fonts/Inter-Bold.ttf`.
