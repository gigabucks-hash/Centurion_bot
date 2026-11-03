# Centurion (working name): trading-bot web dashboard

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
- Themes: dark is the default. Light comes from `[data-theme="light"]`, with a `prefers-color-scheme` fallback. The theme toggle sits in the top bar and is saved in localStorage `centurion_theme` (UI preference only, never the trading mode)

## Pass 3: contracts 1.1.2, @centurion/i18n 0.4.3, design-tokens 0.2.3
- **i18n**: `@centurion/i18n` is a workspace dependency (`file:../../packages/i18n`, transpiled by Next). No local copy of the catalog or of `format.mjs` remains. Every number goes through `@centurion/i18n/format` (`lib/format.ts` → `useFmt()` / `getFmt()`, including `f.lamports()` and `f.solVar()`). Our own copy lives in the `app` namespace (`lib/i18n/en.ts`, `id.ts`). `lib/i18n/aliases.ts` maps our keys to UX keys, and a test checks that every alias target exists in en and id.
- **Wire**: types come from `@centurion/contracts/wire`. `lib/contracts.ts` is the only adapter: lamport strings, `*_price_sol` decimal strings, envelopes, approvals, and `settingsToWire` / `settingsFromWire` / `settingsPatch` (flat snake_case per `strategy_settings.schema.json`, checked by a test).
- **Mock BFF** (`app/api/v1/…`, wire format, Idempotency-Key on writes):
  - `workspaces/{ws}/strategies[/{id}]`: GET, POST, and PATCH with `If-Match`, giving 200, 202 `{proposal}`, 409 `STRATEGY_REV_CONFLICT` or 428.
  - `…/{id}/revisions/{rev}`.
  - `…/{id}/simulate-teammate-edit` (mock only).
  - `approvals[/{id}[/decision]]`, `confirmations/challenge`, `guard-changes/{id}/cancel`.
  - `positions[/{id}/sell]`.
  - `events` (seq paging), `events/stream` (SSE, Last-Event-ID, 15 s clock).
  - `practice/reset` (429 `RESET_COOLDOWN`), `me/deletion`, `devices[/{device_id}]`, `auth/siws/*`, `auth/email/otp/*`.
- **Revision conflict** (UX REVISION_CONFLICT.md): `components/builder/RevisionConflict.tsx`.
  - S1 is a `role=alert` banner built from `current_rev`, `base_rev`, `changed_by`, `changed_at` and `changed_fields`. Publishing is locked while it shows.
  - S2 is a 3-way review (base / saved / mine). Overlapping fields default to "saved".
  - S3 is the merged state, re-sent with `If-Match: current_rev`. S4 discards my edits, with a confirm.
- **Screener state `UNSUPPORTED_QUOTE_MINT`** follows wireframes WF-20 and WF-21 plus Apex's 29 Oct correction (`components/NotTradeable.tsx`).
  - The state comes from the wire: `tradeable: false` with `skip_reason: "UNSUPPORTED_QUOTE_MINT"`, mapped by `screenerStateOf()`.
  - It appears as a neutral dashed "⊘ Not tradeable" chip (text.tertiary, never red) in the coins screener, the coin trail, the feed and the queue.
  - On a queue card, **Skip works only as a dismiss**: no reason dialog and no swipe. Approve stays disabled, and so does Sell on a position.
  - The mock server answers 422 `UNSUPPORTED_QUOTE_MINT` to an approve or a close, and accepts a reject.
  - Mock seed `ap_105` is the race case: the pick was queued before the quote mint changed.
  - Copy comes from the `screener.*` keys in @centurion/i18n 0.4.3 (all 36 keys are aliased and tested).
- **PnL rule** (`lib/pnl.ts` `pnlDisplay` → `@centurion/i18n/format` `pnlSol()` / `pnlPct()`, used by `<Pnl>`):
  - The helper decides the text, sign, arrow and tone; we don't add our own logic.
  - An exact zero gives "0.00" in neutral, with no arrow and no sign.
  - A tiny non-zero value gives "<0.000001" (or "<0.1%"), with its sign, arrow and tone.
  - `formatSol(0)` gives "0.00 SOL".
  - Tests cover 0, positive, negative, "-0.00" and 1-lamport values.
- **Contracts 1.1.2**:
  - `seq` and `*_seq` are int64 strings compared with BigInt (`lib/seq.ts`).
  - Error details sit inside `error`, which feeds the 409 banner and the merge view.
  - Approvals use `If-Match: "<rev>"`.
  - Manual close is `POST …/positions/{id}/close` with `If-Match`, `Idempotency-Key` and `{fraction_bps}`. Bps come from `pctToFractionBps`, and the UI stays in percent.
  - Exit-stats rows are `{exit_reason, count, pnl_lamports, avg_pnl_pct, win_rate_pct, avg_hold_s}`.
  - `stop_loss_pct` (measured from entry) and `peak_trail_pct` (from the peak) are two separate fields.
  - SSE runs at `/v1/workspaces/{ws}/events/stream?include=marks,clock`. Frames carry `event: <type>` and `id: <seq>`; there is a `mark` event and a 5 s `clock`.
  - Coins carry `decimals` and `token_program`.
- **i18n 0.4.3**:
  - `{coin}`/`{sol}` became `{symbol}`/`{amount_lamports}`. The value is formatted SOL text from `formatLamports(v, locale, {paper})` (`f.amount()`).
  - Countdowns are `formatCountdown(remainingMs(exp, skewFrom(server_now)))` (`lib/clock.ts` `remainingUntil`). `mm_ss` is never passed in.
  - Error copy is looked up as `errors.map.json` `codes[code].key`, falling back to `error.code.internal`.
- **N-05 order.failed** (`lib/notify.ts`): vars `{side, symbol, reason_code, amount_lamports}`. `reason_code` maps to `order.fail_reason.*`, falling back to `.unknown`.
- **Real SOL**: `CENTURION_REAL_SOL=disabled` reproduces `403 REAL_SOL_DISABLED`, and the Real workspace then shows a dedicated state.
- **New pages**:
  - `/positions`: manual sell, simulated.
  - `/settings`: profile with account deletion, sign-in methods with the last-method lock, trading wallet, mode & defaults, Practice reset to 30 SOL, notifications with this browser's push registration, security with sessions and devices, appearance, and language with a number-format example.

## Mode model
- `TradingMode = "practice" | "real"`, labelled **◇ PRACTICE** / **● REAL SOL** everywhere
- The workspace mode is server state (mock httpOnly cookie `centurion_mode`, set by `POST /api/mode`, where Real needs a 2.5 s hold). It is never kept in localStorage
- Every read is scoped to one mode, so Real numbers never appear on a Practice screen. Opening a coin or strategy from the other workspace shows a "switch workspace" notice
- A persistent ModeBanner (cyan stripes for Practice, magenta for Real) shows the mode and can't be dismissed

## Pages
| Route | Content |
|---|---|
| `/login` | Mock sign-in per UX SIGN_IN_BUTTONS.md: one 40 px stack (Google, Apple, [Telegram, hidden unless `NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED=true`], or, Email, Wallet), striped logo placeholders (no brand logos shipped), spinner in the pressed button. Email OTP and SIWS go through `/api/v1/auth/*` mocks. Email OTP (6 digits, TTL 10 min, 5 attempts → 15 min lock, resend 60 s, mock code `123456`), Solana wallet SIWS message preview (signing is simulated). Edge-case scenario picker for UX review |
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

## Pass 4 · Design QA (QA-01..16) + contracts 1.1.3

- Contracts 1.1.3: official `ApprovalWire` (display extras ride in `payload`), `reject_reason` sent on reject only
  (chip map: none → user_declined, already_pumped → price_moved, other chips → other, Not tradeable → not_tradeable;
  the chip id stays in free-text `reason`), mock server validates it (422 otherwise) and echoes it;
  `ConflictError.current` required (`RevConflict` derived from the contract type; a 409 without `current` is a plain
  error, never an empty merge); RESET_COOLDOWN reads `error.next_allowed_at`. Time stop / stall exit stay "device only"
  (TODO for 1.1.4 `time_stop_s`, `stall_exit {window_s, min_move_pct}` in lib/contracts.ts).
- errors.json v5 `GUARD_WEAKEN_REQUIRES_APPROVAL` is not in errors.map.json yet → app copy (en/id) instead of the generic text.
- QA-02 lock rows · QA-04 paper SOL headers · QA-05 GIS / Apple-rendered buttons (see public/brand/README.md) ·
  QA-09/10 nowrap numeric headers, compact mobile KPI tiles · QA-15 `CENTURION_QA_SHOTS=1` hides the dev badge ·
  practice reset starts a flat epoch in the mock overview (30 paper SOL, no PnL/positions/exit stats).
