# Centurion — monorepo

Paper-trading terminal for Solana tokens: one backend, three clients (web, desktop, mobile). Trading is
simulated end to end (`TRADING_MODE=paper`); there is no production trading and no production deploy.

## Layout

| Path | What it is | Owner |
|---|---|---|
| `apps/mobile` | Flutter app (Android/iOS) | Flutter Mobile Specialist |
| `apps/web` | Next.js dashboard (`/pnl`, `/stats`, coins, strategies) | Web Design & Frontend Specialist |
| `apps/desktop` | Tauri 2 desktop terminal | Desktop Cross-Platform Specialist |
| `services/backend/api` | TypeScript REST + SSE API (practice only) | Backend API Specialist |
| `services/backend/crates` | Rust engine: ingest, screener, guard, paper sim, logo, db | Backend API Specialist |
| `services/backend/supabase` | SQL migrations (schema is the source of truth for money) | Backend API Specialist |
| `packages/contracts` | Shared wire contract + `errors.json` (`1.1.6`) | Backend API Specialist |
| `packages/design-tokens` | G1-blue tokens for all platforms (`0.3.4`) | UX UI Designer |
| `packages/i18n` | EN/ID strings + ARB; mobile pins the vendored copies | UX UI Designer |
| `docs/design` | UX specs and cross-platform design notes | UX UI Designer / Lead |
| `docs/release` | Android and desktop release runbooks | Lead |

## Stack

- Node 22.18+ (API, web, desktop shell UI), TypeScript everywhere on the JS side.
- Rust 1.90 (engine crates, Tauri shell).
- Flutter 3.47 / Dart 3 (mobile), Postgres 17 (local) / Supabase (SQL).
- Icons: Lucide 1.67, one family on all platforms. Every coin renders a logo (`logo_hash`/`logo_url`,
  deterministic identicon fallback).

## Run and test

```bash
# API (needs Postgres; refuses to start unless TRADING_MODE=paper)
cd services/backend/api && npm ci && npm run typecheck && npm test && npm start

# web (port 3100)
cd apps/web && npm ci && npm run dev
cd apps/web && npm run ci        # lint + typecheck + test + build + audit

# desktop
cd apps/desktop && npm ci && npm run dev
cd apps/desktop && npm run build && npm run test:ui

# mobile
cd apps/mobile && flutter analyze && flutter test
cd apps/mobile && dart format --set-exit-if-changed lib test
```

SQL: apply `services/backend/supabase/migrations` in order; the API test harness needs `psql` on `PATH`.

## CI

Four path-filtered workflows in `.github/workflows`; nothing else blocks a merge, and `main` is the only
branch (no PR flow — CI on `main` is the guard).

| Workflow | Trigger paths | Extra on `main` push |
|---|---|---|
| `backend` | `services/backend/**`, `packages/contracts/**` | — |
| `web` | `apps/web/**`, `packages/*` | — |
| `desktop` | `apps/desktop/**`, `packages/*` | Linux `.deb`/`.AppImage`, Windows `.msi`/setup `.exe` |
| `mobile` | `apps/mobile/**`, ARB, `app_tokens.dart` | APK + AAB + symbol maps, optional Play upload |

## Pins and invariants

- Money is integer lamports end to end; clients never re-sum server totals.
- `packages/design-tokens` stays at **0.3.4**; `apps/mobile` pins `app_tokens.dart` by sha256.
- `packages/contracts` stays at **1.1.6**; `apps/desktop` pins it in `contracts.pin.json`.
- ARB is pinned: new mobile strings need `packages/i18n/arb/*` plus the vendored copies, or
  `apps/mobile/tool/ci_check_vendored.sh` fails.
- No secret in the repo or in chat. CI reads repository secrets only.
- Paper only: never enable real trading, never deploy to production.

## Docs

- `docs/design/pnl-report.md` — PnL card/report definitions, surfaces, backend 0022, known v1.1 gaps.
- `docs/release/android.md` — signing, keystore, Play Console, upload.
- `docs/release/desktop.md` — installer artifacts, versioning, unsigned/SmartScreen gap.
- `services/backend/docs` — engine and API design (screener, guard, MCP, real-money options).