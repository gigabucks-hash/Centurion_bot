# Icon system

One icon family across mobile, web and desktop: **Lucide** — 24 px grid, 2 px stroke, round caps,
outline only. Licence **ISC** (Lucide contributors): commercial use, modification and redistribution
are allowed; only the copyright notice must stay. `flutter_lucide` (the Dart package) is MIT.

| Platform | Package | Version |
|---|---|---|
| Mobile | `flutter_lucide` | `^1.67.0` |
| Web | `lucide-react` | `1.67.0` |
| Desktop | `lucide-react` | `1.67.0` |

Keep the three versions in step: an icon added on one platform must exist on all of them.
`flutter_lucide` ships a ~1 MB icon font that Flutter tree-shakes on release builds; the measured
`lucide.ttf` inside a release APK is ~15 KB.

## Names that bite

Lucide renamed a few icons, and the Dart package uses snake_case:

| Wanted | Web / desktop | Flutter |
|---|---|---|
| home | `house` (not `home`) | `LucideIcons.house` |
| bar chart | `chart-no-axes-column` (`bar-chart-3` is an alias) | `LucideIcons.chart_no_axes_column` |
| filter | `list-filter` | `LucideIcons.list_filter` (there is no `filter`) |
| fingerprint | `fingerprint-pattern` | `LucideIcons.fingerprint_pattern` (there is no `fingerprint`) |

## Navigation

Mobile tabs (`apps/mobile/lib/core/widgets/app_icons.dart`): `house` Home, `bot` Bots,
`activity` Activity, `shield` / `shield-check` Risk (active), `settings` Settings.
Approvals are not a tab: the pending count rides as a badge on **Risk**, in `semantic.warning`
with `onWarning` ink — not Material's red.

Web (`apps/web/components/shell/nav.ts`): `layout-dashboard`, `workflow`, `square-check`, `wallet`,
`activity`, `coins`, `chart-no-axes-column`, `settings`.

Desktop has no rail. Icons live in the titlebar mode chrome, dialogs, table row actions and empty
states (`apps/desktop/src/components/Icon.tsx`).

## Status

| Status | Icon | Colour |
|---|---|---|
| Running | `play` | `semantic.profit` |
| Guarded | `shield-check` | `semantic.guard` |
| Paused | `pause` | `text.tertiary` |
| Stop | `square` | `semantic.loss` — kill switch only, no per-bot stop |
| Real | `shield-check` | `mode.real` |
| Practice | `flask-conical` | `brand.primary` |

## Rules

- Sizes: 16 inline, 18 compact desktop rows, 20 controls, 24 page headers, 32 empty-state hero.
- Stroke: Lucide's 2 at 20–24 px; 1.75 at 16 px; 1.5 at 32 px.
- Colour comes from the text token — `currentColor` on web/desktop, `IconTheme` or a `TradeColors`
  value in Flutter. Never pass a hex literal to an icon.
- Do not swap the active nav icon for a filled variant: Lucide is outline only, and mixing families
  is what this file exists to prevent.
- Hit area ≥ 44×44 mobile, ≥ 32×32 desktop, even when the glyph is 20.
- Icon-only control needs a name (`aria-label`, or `Semantics`/`tooltip` in Flutter). Icon next to a
  visible label is decorative: `aria-hidden` / `excludeFromSemantics`.
- An icon never carries state alone — pair it with text or a token-coloured dot in the same row.

## Review gate before a UI commit

1. No second icon library and no hand-rolled icon `<svg>` (chart primitives such as the equity chart
   and sparkline are data, not icons).
2. No hex colour in an icon prop.
3. Nav and status rows render one family at one stroke scale.