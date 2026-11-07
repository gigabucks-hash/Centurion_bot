# Centurion — monorepo

Paper-trading terminal for Solana tokens. Two clients (`apps/web`, `apps/desktop`) on one backend; the
web app is responsive and is the phone surface. Trading is simulated end to end (`TRADING_MODE=paper`);
there is no production trading and no production deploy. Mobile apps are cancelled.

## Layout

| Path | What it is | Owner |
|---|---|---|
| `apps/web` | Next.js dashboard (`/pnl`, `/stats`, coins, strategies); works on phones | Web Design & Frontend Specialist |
| `apps/desktop` | Tauri 2 desktop terminal (Windows release; Linux bundles) | Desktop Cross-Platform Specialist |
| `services/backend/api` | TypeScript REST + SSE API (practice only) | Backend API Specialist |
| `services/backend/crates` | Rust engine: ingest, screener, guard, paper sim, logo, db | Backend API Specialist |
| `services/backend/supabase` | SQL migrations (schema is the source of truth for money) | Backend API Specialist |
| `packages/contracts` | Shared wire contract + `errors.json` (`1.1.6`) | Backend API Specialist |
| `packages/design-tokens` | G1-blue tokens for all platforms (`0.3.4`) | UX UI Designer |
| `packages/i18n` | EN/ID strings (`0.4.12`) | UX UI Designer |
| `docs/design` | UX specs and cross-platform design notes | UX UI Designer / Lead |
| `docs/release` | Desktop release + updater runbook | Lead |

## Stack

- Node 22.18+ (API, web, desktop shell UI), TypeScript everywhere on the JS side.
- Rust 1.90 (engine crates, Tauri shell).
- Postgres 17 (local) / Supabase (SQL).
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
```

SQL: apply `services/backend/supabase/migrations` in order; the API test harness needs `psql` on `PATH`.

## CI

Three path-filtered workflows in `.github/workflows`; nothing else blocks a merge, and `main` is the only
branch (no PR flow — CI on `main` is the guard).

| Workflow | Trigger paths | Extra on `main` push | Extra on `desktop-v*` tag |
|---|---|---|---|
| `backend` | `services/backend/**`, `packages/contracts/**` | — | — |
| `web` | `apps/web/**`, `packages/*` | — | — |
| `desktop` | `apps/desktop/**`, `packages/*` | Linux `.deb`/`.AppImage`, Windows `.msi`/setup `.exe` | Signed Windows release + `latest.json` for the updater |

## Pins and invariants

- Money is integer lamports end to end; clients never re-sum server totals.
- `packages/design-tokens` stays at **0.3.4**.
- `packages/contracts` stays at **1.1.6**; `apps/desktop` pins it in `contracts.pin.json`.
- No secret in the repo or in chat. CI reads repository secrets only.
- Paper only: never enable real trading, never deploy to production.

## Desktop updates

The installed Windows app checks the **latest published GitHub release** for `latest.json`, verifies the
signed installer, installs it and restarts (`Settings → Update aplikasi`). Cutting a release:

1. Bump the version in `apps/desktop/src-tauri/tauri.conf.json`, `Cargo.toml` and `package.json`.
2. Push a tag `desktop-vX.Y.Z` (or run the `desktop` workflow manually with that tag).
3. CI signs the NSIS/MSI bundles, publishes the release and refreshes `latest.json`.

See `docs/release/desktop.md` for the signing key setup and troubleshooting.

## Docs

- `docs/design/pnl-report.md` — PnL card/report definitions, surfaces, backend 0022, known v1.1 gaps.
- `docs/release/desktop.md` — installers, versioning, updater, signing.
- `docs/release/web-local.md` — local paper stack + five-minute smoke checklist.
- `services/backend/docs` — engine and API design (screener, guard, MCP, real-money options).