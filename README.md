# Centurion — monorepo

Paper-trading terminal for Solana tokens: one backend and two app targets (web, Windows desktop). Trading is
simulated end to end (`TRADING_MODE=paper`); there is no production trading and no production deploy.
Android, iOS, and macOS are not supported app targets.

## Layout

| Path | What it is | Owner |
|---|---|---|
| `apps/web` | Next.js dashboard (`/pnl`, `/stats`, coins, strategies), including responsive mobile web layouts | Web Design & Frontend Specialist |
| `apps/desktop` | Tauri 2 desktop terminal. Supported desktop target: Windows. Linux CI verifies the same shell | Desktop Cross-Platform Specialist |
| `services/backend/api` | TypeScript REST + SSE API (practice only) | Backend API Specialist |
| `services/backend/crates` | Rust engine: ingest, screener, guard, paper sim, logo, db | Backend API Specialist |
| `services/backend/supabase` | SQL migrations (schema is the source of truth for money) | Backend API Specialist |
| `packages/contracts` | Shared wire contract + `errors.json` (`1.1.6`) | Backend API Specialist |
| `packages/design-tokens` | G1-blue tokens for web and desktop (`0.3.4`) | UX UI Designer |
| `packages/i18n` | EN/ID strings for web and desktop. ARB stays in the package and is not vendored into an app | UX UI Designer |
| `docs/design` | UX specs for web and desktop | UX UI Designer / Lead |
| `docs/release` | Web and Windows desktop release runbooks | Lead |

## Stack

- Node 22.18+ (API, web, desktop shell UI), TypeScript everywhere on the JS side.
- Rust 1.90 (engine crates, Tauri shell).
- Postgres 17 (local) / Supabase (SQL). Linux containers and shell scripts stay for the API, the web image, and verification.
- Icons: Lucide 1.67 on web and desktop. Every coin renders a logo (`logo_hash`/`logo_url`,
  deterministic identicon fallback).

## Run and test

```bash
# API (needs Postgres; refuses to start unless TRADING_MODE=paper)
cd services/backend/api && npm ci && npm run typecheck && npm test && npm start

# web (port 3100)
cd apps/web && npm ci && npm run dev
cd apps/web && npm run ci        # lint + typecheck + test + build + audit

# desktop (Windows is the supported desktop target; these commands also verify the shell on Linux)
cd apps/desktop && npm ci && npm run dev
cd apps/desktop && npm run build && npm run test:ui
```

SQL: apply `services/backend/supabase/migrations` in order; the API test harness needs `psql` on `PATH`.

## CI

Three path-filtered workflows in `.github/workflows`. `main` is the integration branch
(CI on `main` is the guard). There is no mobile workflow and no macOS bundle.

| Workflow | Trigger paths | Extra on `main` push |
|---|---|---|
| `backend` | `services/backend/**`, `packages/contracts/**` | — |
| `web` | `apps/web/**`, `packages/*` | — |
| `desktop` | `apps/desktop/**`, `packages/*` | Linux `.deb`/`.AppImage` (verification), Windows `.msi`/setup `.exe` |

## Pins and invariants

- Money is integer lamports end to end; clients never re-sum server totals.
- `packages/design-tokens` stays at **0.3.4**. The generated Dart token file stays in the package; no app copies it.
- `packages/contracts` stays at **1.1.6**; `apps/desktop` pins it in `contracts.pin.json`.
- `packages/i18n/arb` stays in the shared catalog. Web and desktop read their own catalogs.
- No secret in the repo or in chat. CI reads repository secrets only.
- Paper only: never enable real trading, never deploy to production.

## Docs

- `docs/design/pnl-report.md` — PnL card/report definitions, surfaces, backend 0022, known v1.1 gaps.
- `docs/release/web.md` — web container image.
- `docs/release/desktop.md` — Windows installers, Linux verification bundles, unsigned/SmartScreen gap.
- `services/backend/docs` — engine and API design (screener, guard, MCP, real-money options).