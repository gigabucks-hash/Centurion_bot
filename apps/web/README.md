# Sentra (working name): trading-bot web dashboard

Web dashboard for our own Solana trading bot (Phase 3 of the Apex Dev Lead blueprint, HOTBOT feature parity). **All UI, code, naming and copy are original.** Nothing is taken from HOTBOT.

Status: **UX Phase 0 applied, mock data only.** No wallet, RPC, chain or external service is touched anywhere. Auth is mock. No secrets are collected or stored.

## Stack
- Next.js 16.4 (App Router, TypeScript, Turbopack, Cache Components, Partial Prefetching)
- Tailwind CSS v4. UX tokens are ported to `@theme` in `app/theme.css`
- TradingView Lightweight Charts™ 5 (Apache-2.0, attribution logo kept on) for the coin price chart. recharts for the equity and exit charts. lucide-react icons
- playwright-core (dev only, screenshot script, uses system Chrome)

## Run
```bash
npm install
npm run dev                  # http://localhost:3100
npm run build && npm start   # production on :3100
npm run lint && npm run typecheck
npm run screenshots          # app must be running on :3100 → screenshots/*.png
```
Env (optional): `DATA_SOURCE=mock|http` (default `mock`), `API_BASE_URL`, `CHROME_PATH`, `BASE`.

## Design tokens (UX Phase 0 → Tailwind v4)
Source: `/workspace/ux-solbot/tokens/tokens.css` + `tailwind.config.tokens.js`. The v3 preset is ported to a v4 `@theme` block in `app/theme.css`. The default palette is reset, so only semantic names exist:
- Colours: `bg-bg-{canvas,surface,raised,overlay,inset}`, `text-text-{primary,secondary,tertiary,disabled,onAccent}`, `border-border-{subtle,default,strong,focus}`, `*-brand-primary[Hover|Pressed|Container]`, `*-semantic-{profit,loss,neutralPnl,warning,guard,info}[Container]`, `*-mode-{practice,real}[Container]`, `text-mode-on{Practice,Real}`, plus `*-mode-accent` which follows the nearest `[data-mode]`
- Type: `text-{display,headline,title,titleSm,bodyLg,body,label,caption,overline,numLg,numMd,numSm}`, `font-sans` (Inter), `font-mono` (JetBrains Mono), `num` utility (mono + tabular)
- Radius `rounded-{xs..xl}`, shadow `shadow-e0..e4`, motion `duration-{instant,fast,base,slow}` + `ease-standard…`, tap sizes `min-h-tap` (40) / `min-h-tap-touch` (48), `stripes-practice`
- Themes: dark is the default. Light comes from `[data-theme="light"]`, with a `prefers-color-scheme` fallback. The theme toggle sits in the top bar and is saved in localStorage `sentra_theme` (UI preference only, never the trading mode)

## Mode model
- `TradingMode = "practice" | "real"`, labelled **◇ PRACTICE** / **● REAL SOL** everywhere
- The workspace mode is server state (mock httpOnly cookie `sentra_mode`, set by `POST /api/mode`, where Real needs a 2.5 s hold). It is never kept in localStorage
- Every read is scoped to one mode, so Real numbers never appear on a Practice screen. Opening a coin or strategy from the other workspace shows a "switch workspace" notice
- A persistent ModeBanner (cyan stripes for Practice, magenta for Real) shows the mode and can't be dismissed

## Pages
| Route | Content |
|---|---|
| `/login` | Mock sign-in: Google / Apple / Telegram, email OTP (6 digits, TTL 10 min, 5 attempts → 15 min lock, resend 60 s, mock code `123456`), Solana wallet SIWS message preview (signing is simulated). Edge-case scenario picker for UX review |
| `/welcome` | Onboarding: Practice workspace with 30 paper SOL → pick a preset → dashboard |
| `/` | KPIs (cash, realized PnL, open positions/cap, waiting approvals + "expiring < 2 min"), strategy table (status, approval mode, PnL, win rate, max DD, avg hold, sparkline), latest coin trail, 72h equity, activity feed with chips (All/Buys/Sells/Guard/Proposals), warnings |
| `/strategies` | Strategy cards with the **funnel as horizontal bars + step conversion %** (Sankey later), rejection reasons, Edit / Duplicate / New |
| `/strategies/new` | Builder (5 non-linear steps: Screener, Guards, Entry + approval mode, Exit plan, Review & sim), presets, `?from=<id>` duplicate, autosave (local draft, 800 ms) |
| `/strategies/[id]/edit` | Same builder with a diff against the active rev (weakens / strengthens / new / neutral, plus an "only weakening" filter). Publishing a change that loosens a guard creates a guard-change approval |
| `/approvals` | Queue sorted by soonest expiry, with a countdown on every item (< 2 min turns red). Tabs Pending / In progress / Done / Expired. Skip reasons + Undo 5 s. Batch approve for **picks only** (Real shows total SOL). Real picks need an extra confirm dialog + 2.5 s hold. Guard changes use the hardened dialog. Team actions need a mock passkey + hold. Keyboard J/K/A/S/X/⇧A/Enter/Esc. Mobile swipe for Practice picks only |
| `/activity` | Realtime SSE feed, chips + strategy filter, pause/resume |
| `/coins`, `/coins/[mint]` | Coin list (`?q=`). The coin trail has step nodes (snapshot rev), a **Lightweight Charts price chart with ▲ buy / ▼ TP / exit markers** (mock series), a timeline with checks (measured vs threshold), and positions |
| `/stats` | Exit-reason stats for the current workspace (strategy and window filters) |

Guard weakening, hardened (SPEC §3): the change is detected when a max goes up, a min goes down, a check is turned off, a must-have is removed, or the pass mark drops. The dialog shows the diff, the mock 7-day replay risk impact and a risk badge. **Practice:** 1.2 s hold, no cooldown. **Real SOL:** type the strategy name + second factor (mock passkey button, nothing read) + 2.5 s hold → 10 min cooldown with a "Cancel change" banner, optional auto-revert after 24 h, and an audit entry. The server-side mock (`lib/mock/store.ts`) enforces the same rules.

## Structure
```
app/theme.css, globals.css, layout.tsx (fonts, theme init, toasts)
app/(app)/…            ← shell pages (layout reads the mode cookie inside <Suspense>)
app/(auth)/login, welcome
app/api/{stream,approvals,mode,strategies,auth}
components/ui/          ← Card, Badge, Button, StatTile, Table, Pnl, RiskBadge, Sparkline (server) + client.ts (Toggle, NumberInput, Segmented, Countdown, HoldButton, Dialog, Toast)
components/shell/       ← AppShell, ModeBanner, ModeSwitch, ThemeToggle, RealtimeProvider, nav
components/approvals/   ← ApprovalQueue, GuardWeakeningDialog, SwipeRow
components/builder/     ← StrategyBuilder
components/auth/        ← LoginScreen
components/charts/      ← PriceChart (lightweight-charts), EquityChart, ExitCharts
lib/types.ts, strategy-schema.ts (fields, presets, validation, diff), api.ts, http-api.ts, client.ts, mode.ts, format.ts (id-ID), theme.ts
lib/mock/               ← seeded data, mutable store (TTL, holds, cooldown, audit), stream generator
```

## Deviations from the SPEC (on purpose, mock build)
- UI copy is English (the wireframes are Indonesian). Numbers use id-ID format. Language is still an open i18n question
- The 2FA / biometric step is a "Verify with passkey (mock)" button. No codes or credentials are read. Production should use WebAuthn
- Swipe is only on Practice picks. Real SOL swipe is turned off completely (stricter than "Real above a limit")
- App pages aren't auth-gated (mock). There's no Settings / linked-accounts page yet, and no rev-conflict banner
- IdP buttons use neutral placeholder glyphs until we have official Google/Apple/Telegram assets
- Risk impact, replay and the builder simulation are deterministic mock estimates
- Switching to Real skips the wallet-setup wizard and shows a notice instead
- The exit-stats sample is synthetic and doesn't reconcile with the overview totals
