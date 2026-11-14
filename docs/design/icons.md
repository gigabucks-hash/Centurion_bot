# Icon system

One icon family across the web app and the Windows desktop: **Lucide** — 24 px grid, 2 px stroke,
round caps, outline only. Licence **ISC** (Lucide contributors): commercial use, modification and
redistribution are allowed; only the copyright notice must stay. The Flutter app and its
`flutter_lucide` package were removed.

| Platform | Package | Version |
|---|---|---|
| Web | `lucide-react` | `1.67.0` |
| Windows desktop | `lucide-react` | `1.67.0` |

Keep the two versions in step: an icon added on one client must exist on the other.

## Names that bite

Lucide renamed a few icons:

| Wanted | Web / desktop |
|---|---|
| home | `house` (not `home`) |
| bar chart | `chart-no-axes-column` (`bar-chart-3` is an alias) |
| filter | `list-filter` |
| fingerprint | `fingerprint-pattern` |

## Navigation

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
- Colour comes from the text token — `currentColor` on web and desktop. Never pass a hex literal to an icon.
- Do not swap the active nav icon for a filled variant: Lucide is outline only, and mixing families
  is what this file exists to prevent.
- Hit area ≥ 40×40 on the web phone layout, ≥ 32×32 on desktop, even when the glyph is 20.
- Icon-only control needs a name (`aria-label` or a tooltip). Icon next to a
  visible label is decorative: `aria-hidden` / `excludeFromSemantics`.
- An icon never carries state alone — pair it with text or a token-coloured dot in the same row.

## Review gate before a UI commit

1. No second icon library and no hand-rolled icon `<svg>` (chart primitives such as the equity chart
   and sparkline are data, not icons).
2. No hex colour in an icon prop.
3. Nav and status rows render one family at one stroke scale.