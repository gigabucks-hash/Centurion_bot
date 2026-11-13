# Assets shipped with the web app

Everything drawn in the interface is either a design-token colour, an icon from the dependencies below, or an original SVG in this repository. No third-party photographs, brand logos, or trademarked marks are embedded.

| Asset | Where | Source | License |
|---|---|---|---|
| Icons (navigation, stats, settings, status) | `lucide-react` | https://lucide.dev | ISC |
| Inter and JetBrains Mono | `next/font` plus `packages/design-tokens/fonts` | See `packages/design-tokens/fonts/SOURCE.md` | SIL Open Font License 1.1 |
| Colours, type scale, dark and light tokens | `packages/design-tokens` | Generated from `src/tokens.json` | Project source. Contrast is recorded in `packages/design-tokens/tokens/contrast-report.md` (WCAG 2.2 AA for the token pairs). |
| Crest mark | `apps/web/components/shell/Mark.tsx` | Original SVG | Project source |
| Page banners | `apps/web/components/shell/PageHero.tsx` | Original SVG, coloured only with design tokens so dark and light stay on palette | Project source |
| Sign-in illustration | `apps/web/components/auth/LoginScreen.tsx` (`FauxDashboard`) | Original SVG, same tokens | Project source |

Phantom is named in the sign-in copy because the owner connects that browser extension. The app does not ship the Phantom logo. Solana is named in product copy. The app does not ship the Solana logo.
