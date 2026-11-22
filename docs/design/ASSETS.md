# Assets shipped with Centurion Trade

The helmet is an original drawing: a geometric side-profile galea, solid fill, a few paths. No trace, no embedded photograph, no third-party logo.

| Asset | Where | Source | License |
|---|---|---|---|
| Mark | `brand/mark.svg` | Hand-drawn helmet. `fill="currentColor"` so a host can tint it. | Project asset |
| Themed marks | `brand/mark-on-dark.svg`, `brand/mark-on-light.svg` | Same drawing. Dark is orange `#FF7A1A`. Light is blue `#2563EB`. | Project asset |
| Wordmarks | `brand/wordmark.svg`, `brand/wordmark-on-dark.svg`, `brand/wordmark-on-light.svg` | The mark, plus **Centurion** outlined from Schibsted Grotesk and a small **TRADE** outlined from Martian Mono. The plain file uses `currentColor`. | See the UI fonts below |
| README banners | `brand/readme-banner-dark.svg`, `brand/readme-banner-light.svg` | Wordmark on `#0B0B0D` or `#FFFFFF` | Same as the wordmarks |
| Social preview | `docs/design/social-preview.png` (1280×640) | Render of `brand/social-preview.svg` | Same as the wordmarks. Set it manually in GitHub Settings → Social preview. |
| App icon | `brand/icon.svg`, `brand/icon-maskable.svg` | Orange mark on a `#0B0B0D` tile. The app icon is a rounded square. The maskable tile is a full-bleed square with a larger margin. | Same helmet |
| Raster icons | `apps/web/public/brand/mark-*.png`, `apps/web/public/icon.svg`, `apps/web/app/favicon.ico`, `apps/web/app/apple-icon.png`, `apps/web/app/opengraph-image.png`, `apps/web/app/twitter-image.png`, `apps/desktop/src-tauri/icons/` | Renders of the icon and the social preview. 16, 24, 32 and 48 are a separate pixel drawing (`brand/small_icons.py`), not a shrink of the large mark. | Same helmet tile |
| UI icons | `lucide-react` | https://lucide.dev | ISC |
| Schibsted Grotesk and Martian Mono | `next/font/local` and `packages/design-tokens/fonts/ui` | `packages/design-tokens/fonts/SOURCE.md` | SIL Open Font License 1.1. The wordmark outlines these faces and does not embed the font files. |
| Colour tokens | `packages/design-tokens` | `src/tokens.json` | Project source. Contrast: `packages/design-tokens/tokens/contrast-report.md` |

The mark uses the theme accent: orange `#FF7A1A` on the dark canvas `#0B0B0D`, blue `#2563EB` on white. Rebuild the vectors with `brand/build_logo.py`.

Phantom is named in sign-in copy because the owner connects that browser extension. The app does not ship the Phantom logo. Solana is named in product copy. The app does not ship the Solana logo.

There is no `LICENSE` file for the repository as a whole. The font license covers Schibsted Grotesk and Martian Mono.
