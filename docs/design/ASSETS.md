# Assets shipped with Centurion Trade

The approved logo is the source. Vectors are traced or outlined from it. No third-party photographs or other brand logos are embedded.

| Asset | Where | Source | License |
|---|---|---|---|
| Approved raster | `docs/design/centurion-logo-reference.jpg` | Owner-supplied lockup | Project asset. Kept for traceability. |
| Helmet mark | `brand/helmet.svg`, `brand/mark.svg`, `brand/icon.svg` | Vector trace of the helmet in the approved raster (VTracer), then placed on a dark tile for icons | Project asset, derived from the reference above |
| Wordmarks | `brand/wordmark-on-dark.svg`, `brand/wordmark-on-light.svg` | Same helmet, plus **CENTURION** and **TRADE** outlined from Cinzel | See Cinzel below. Light variant uses a dark TRADE line so it reads on a light ground. Gold helmet and CENTURION stay. |
| README banners | `brand/readme-banner-dark.svg`, `brand/readme-banner-light.svg` | Wordmark on a flat dark or warm light ground | Same as the wordmarks |
| Social preview | `docs/design/social-preview.png` (1280×640) | Render of `brand/social-preview.svg` | Same as the wordmarks. Set it manually in GitHub Settings → Social preview. |
| App icons | `apps/web/public/brand/mark-*.png`, `apps/web/app/favicon.ico`, `apps/web/app/apple-icon.png`, `apps/desktop/src-tauri/icons/` | Renders of `brand/icon.svg` at the sizes each target asks for | Same helmet tile |
| Cinzel | `brand/fonts/Cinzel-wght.ttf` | [The Cinzel Project](https://github.com/NDISCOVER/Cinzel), via [Google Fonts](https://fonts.google.com/specimen/Cinzel) | SIL Open Font License 1.1. Full text: `brand/fonts/OFL-Cinzel.txt`. Copyright 2020 The Cinzel Project Authors. |
| UI icons | `lucide-react` | https://lucide.dev | ISC |
| Inter and JetBrains Mono | `next/font` and `packages/design-tokens/fonts` | `packages/design-tokens/fonts/SOURCE.md` | SIL Open Font License 1.1 |
| Colour tokens | `packages/design-tokens` | `src/tokens.json` | Project source. Contrast: `packages/design-tokens/tokens/contrast-report.md` |

Logo gold `#E7C56A` on the dark canvas is about 11:1. The light-mode gold-brown `#7A4E12` on the light canvas is about 6.7:1. Those two are used for small labels. TRADE on a light ground is `#1A140C`, not gold, because gold on cream fails contrast.

Phantom is named in sign-in copy because the owner connects that browser extension. The app does not ship the Phantom logo. Solana is named in product copy. The app does not ship the Solana logo.

There is no `LICENSE` file for the repository as a whole. The font license above covers only Cinzel.
