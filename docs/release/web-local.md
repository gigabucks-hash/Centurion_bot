# Run the web app against the paper API (local)

This is the fastest usable surface: the Next.js app in `apps/web`, signed in with Phantom, reading and trading the
paper backend in `services/backend`. No chain, no real funds, no deploy.

## Fast path (Windows, copy/paste, ~6 minutes)

Prerequisite: Postgres 17 tools (`psql`, `createdb`) and Node 22 on `PATH`. Replace the two wallets/secrets once.

```powershell
# 0) repo root
cd C:\cw\app

# 1) database + schema (once per machine)
createdb -h 127.0.0.1 -p 5432 -U postgres centurion
psql -h 127.0.0.1 -p 5432 -U postgres -d centurion -f services/backend/supabase/tests/00_local_shim.sql
Get-ChildItem services/backend/supabase/migrations/*.sql | Sort-Object Name |
  ForEach-Object { psql -h 127.0.0.1 -p 5432 -U postgres -v ON_ERROR_STOP=1 -d centurion -f $_.FullName }

# 2) paper API (terminal 1)
cd services/backend/api
$env:NODE_ENV="development"; $env:TRADING_MODE="paper"
$env:DATABASE_URL="postgres://postgres@127.0.0.1:5432/centurion"
$env:API_PORT="8080"
$env:AUTH_SIWS_DOMAINS="localhost:3100"
$env:OWNER_WALLETS="<your Phantom public key>"
$env:CENTURION_SESSION_SECRET="<32+ random chars>"
$env:SUPABASE_JWT_SECRET="<32+ other random chars>"
$env:AUTH_USER_CREATE="direct"
npm start

# 3) web (terminal 2, after "listening on 0.0.0.0:8080")
cd C:\cw\app\apps\web
npm install                                  # first run only
$env:DATA_SOURCE="http"
$env:API_BASE_URL="http://127.0.0.1:8080"
$env:CENTURION_INSECURE_COOKIES="1"
npm run dev                                  # http://localhost:3100
```

Open http://localhost:3100, click **Phantom**, sign once: the owner, the practice workspace and 30 paper SOL are
created automatically. Nothing else is seeded; every figure on screen comes from the local paper API.

## One command (Windows)

`tools\paper\up.ps1` does the whole fast path above: creates the database, applies the shim + every migration, keeps
two generated API secrets in `.paper\secrets.json` (so restarts do not invalidate sessions), starts the paper API on
loopback and the built Next app in `DATA_SOURCE=http`, waits until both answer, and prints the local URL. Both bind
loopback by default; `-Lan` additionally serves the web app on the Wi-Fi address and prints that URL.

```powershell
$env:PGPASSWORD = "postgres"                 # local Postgres superuser
.\tools\paper\up.ps1 -OwnerWallet <your Phantom public key>
.\tools\paper\up.ps1 -OwnerWallet <key> -Lan  # also reachable from a phone on the same Wi-Fi
.\tools\paper\down.ps1                       # stop both processes
```

| Flag | Effect |
|---|---|
| `-OwnerWallet <base58>` | Required (or set `OWNER_WALLETS`). SIWS fails closed without it. |
| `-Reset` | Drop and recreate the database (all paper history is lost). |
| `-Rebuild` | Force `next build` even when `.next\BUILD_ID` exists. |
| `-Lan` | Listen on every interface instead of loopback, and allow the LAN origin in SIWS. Plain http: anyone on that Wi-Fi can open the app. |
| `-DbName`, `-ApiPort`, `-WebPort` | Defaults `centurion_paper`, `8080`, `3100`. |
| `-NoWait` | Start and return without waiting for the readiness checks. |

Logs and pids live in `.paper\` (git-ignored). The script builds with `NODE_ENV=production` (the API's
`development` env must not leak into `next build`) and serves the standalone output Next emits
(`.next\standalone\apps\web\server.js` with `static/` and `public/` copied in), because plain `next start` refuses
`output: "standalone"`. The API always binds `127.0.0.1`; the browser reaches it through the web proxy, so it never
needs the network. With `-Lan`, `AUTH_SIWS_DOMAINS` also carries `localhost:<port>`, `127.0.0.1:<port>` and the LAN
address of the interface with the default route, so a phone on the same Wi-Fi can open the printed LAN URL. Plain
`http` is a local/LAN convenience only: Phantom may refuse it from a phone, and a public host needs HTTPS (see §4).

## 1. Database (Postgres 17)

```powershell
createdb centurion
psql -d centurion -f services/backend/supabase/tests/00_local_shim.sql
Get-ChildItem services/backend/supabase/migrations/*.sql | Sort-Object Name |
  ForEach-Object { psql -v ON_ERROR_STOP=1 -d centurion -f $_.FullName }
```

`00_local_shim.sql` provides the Supabase-only roles/schemas (`auth.users`, `authenticated`, …) for a local server.

## 2. Paper API

```powershell
cd services/backend/api
$env:NODE_ENV="development"                 # AUTH_USER_CREATE=direct is refused in production
$env:DATABASE_URL="postgres://postgres@127.0.0.1:5432/centurion"
$env:API_PORT="8080"
$env:AUTH_SIWS_DOMAINS="localhost:3100"     # host:port of the web app, exactly what the browser opens
$env:OWNER_WALLETS="<your Phantom public key>"   # SIWS fails closed when empty
$env:CENTURION_SESSION_SECRET="<32+ random chars>"
$env:SUPABASE_JWT_SECRET="<32+ random chars>"    # signs the backend JWT the web forwards
$env:AUTH_USER_CREATE="direct"              # local only: creates auth.users without Supabase Admin API
npm start
```

The first Phantom sign-in creates the owner, the practice workspace (30 paper SOL) and returns its id. The web app
stores that id in the `centurion_ws` cookie; nothing is hard-coded per user.

## 3. Web

```powershell
cd apps/web
$env:DATA_SOURCE="http"
$env:API_BASE_URL="http://127.0.0.1:8080"
$env:CENTURION_INSECURE_COOKIES="1"         # only because this is plain http on localhost
npm run dev                                  # http://localhost:3100
```

Open http://localhost:3100, choose **Phantom**, sign the SIWS message. The mock panels (behaviour selector, mock wallet)
are hidden in http mode. Any other owner wallet is refused with "Access denied" by design.

## 4. Container (same env)

```bash
docker build -t centurion-web .
docker run --rm -p 3100:3100 \
  -e DATA_SOURCE=http \
  -e API_BASE_URL=http://host.docker.internal:8080 \
  -e CENTURION_INSECURE_COOKIES=1 \
  centurion-web
```

For a real host: put the web and API behind one HTTPS origin (or set `AUTH_SIWS_DOMAINS` to the web host), drop
`CENTURION_INSECURE_COOKIES` (Secure cookies need HTTPS), and never expose the backend without its own auth.

## What is wired end to end today

- SIWS login (real Phantom, base58 signature verified by the backend), session cookies, silent refresh, logout.
- Dashboard: cash / realized / unrealized / open / pending from `portfolio_latest`, strategies table, activity feed,
  PnL report (`/stats/pnl` + closed ledger), exit stats, coins screener list.
- Server reads use the session JWT from `centurion_at` and the workspace from `centurion_ws`.
- Browser actions (`approve`, `reject`, manual sell, events stream, logo images) are rewritten to one proxy route
  (`app/api/backend/[...path]`) that forwards to the paper API with the same cookies; the browser never sees a token.

## On a phone

The web app is the phone surface (mobile apps are cancelled). Layout: bottom tab bar (5 items) plus the
"More" sheet below `lg`, table horizontal scroll with a sticky first column and a scroll hint, cards below
`sm`. Pages render at 390×844 without page-level horizontal scroll: `/`, `/positions`, `/pnl`, `/coins`,
`/strategies`, `/activity`, `/stats`, `/settings`. To open it from a phone on the same LAN, run
`next start -H 0.0.0.0 -p 3100` and add the laptop's LAN host to `AUTH_SIWS_DOMAINS` (Phantom signs the
message for that origin). Do not expose this stack to the internet without HTTPS.

## HTTP paper re-check (2026-11-08, HEAD `9930a70`)

A scratch stack proved the paper read/write paths on this tree, not just the mock: Postgres 17 with the local shim
and migrations `0001`–`0026` (database `centurion_webpaper`), paper API on `:8091` (`TRADING_MODE=paper`,
`AUTH_USER_CREATE=direct`, synthetic test owner in `OWNER_WALLETS`), Next in `DATA_SOURCE=http` on `:3111`.

| Probe | Rows | Result |
|---|---|---|
| Backend wire (`docs/qa/repro/v3/http_paper_v3.mjs`) | 13 | pass — SIWS, null overview, no strategy `stats`, `practice -> real` 403, null realized with window sum, closed/open ledger rows, tradeable chip, exit stats, 401 without a session |
| Write flows (`http_paper_flows_v3.mjs`) | 21 | pass — pause/resume, stale `409`, approve/reject + replay, 50 % sell + replay |
| Server render (`render_http_v3.mjs`) | 13 checks / 4 defects | 13 pass; all four old defects now absent (coin detail is **200**, dashboard tile and strategy cards keep the em dash) |
| Ledger paging (`http_pnl_paging_v3.mjs`) | 6 | pass — 50 + remainder, no overlap, page 2 renders, `window=24h` keeps em dashes |
| Practice reset (`http_reset_v3.mjs`) | 4 | pass — epoch bump, `429 RESET_COOLDOWN`, open rows closed, reset history |
| Phone layout over HTTP (390×844 and 360×800) | 16 | pass — `/`, `/positions`, `/pnl`, `/strategies`, `/coins`, `/settings`, `/approvals`, `/activity`: page overflow 0, no tap target under 40 px, no error page |
| Invalid ledger cursor | 2 | pass — `/pnl?cursor=not-a-uuid` and a foreign UUID fall back to page 1 with `200`, no error screen |

Still unverified: **real Phantom** (the probes sign SIWS with a test-only ed25519 key) and a deployed host
with HTTPS. The production image itself is built and booted in CI (`docker` job, container `healthy`,
`GET /login` → 200). The UI defects that remain are cosmetic or latent: USD cells are
hidden in HTTP mode because the wire carries no SOL/USD rate, and exit-bucket aggregates still default to 0 only when
the server sends a null (a bucket with `sol_in = 0`).

### Re-check through `tools\paper\up.ps1` (2026-11-08, HEAD `f7c5b65`)

Same probes, this time started by the one-command launcher instead of hand-written terminals: Postgres 17 on
`:5432` (database `centurion_paper`, shim + `0001`-`0026` applied by the script), paper API on `:8080`
(`AUTH_USER_CREATE=direct`, synthetic owner `9C6hy…Jtpj`), web `next start` in `DATA_SOURCE=http` on `:3100`.

| Probe | Result |
|---|---|
| `http_paper_v3.mjs` | **13/13** — SIWS, null overview, no strategy `stats`, `practice -> real` 403, null realized + window sum, ledger rows, 0025 mark/unrealized, tradeable chip, `/trading`, exit stats, 401 |
| `http_paper_flows_v3.mjs` | **21/21** — pause/resume + replay, stale `409`, approve/reject + replay, 50 % sell + replay |
| `render_http_v3.mjs` | **13/13** checks, **0/4** old defects reproduced (coin detail 200; dashboard + strategy cards keep the em dash) |
| `http_pnl_paging_v3.mjs` | **6/6** |
| `http_reset_v3.mjs` | **4/4** |

Run them against the launcher stack with `BB_API=http://127.0.0.1:8080`, `BB_WEB=http://127.0.0.1:3100`,
`PGHOST/PGPORT/PGUSER/PGPASSWORD`, `PGDATABASE=<the -DbName you used>` and `BB_PSQL` set to the full `psql.exe` path
when it is not on `PATH`.


## Known gaps (honest)

- **Additive backend routes**: this web tree calls `POST /strategies/{id}/mode` and
  `GET/POST /trading[/pause-buys|resume-buys]`. They ship in the same tree (`services/backend`, migration 0026); an older
  API answers 404 on those two controls, everything else is unaffected. Mock mode mirrors the same wire contract.
- **Real stays locked by design**: `practice -> real` always answers `403 MODE_NOT_ALLOWED` with `real_locked_reason`;
  this build is paper-only. `real -> practice` is immediate (no hold).
- **Coin tradeability flag**: `/coins` and the coin timeline carry `tradeable`/`skip_reason`; the screener and the coin
  detail show the "Not tradeable" chip and disable Sell for those rows.
- **Open-position marks**: when the API omits the 0025 mark/unrealized fields the positions screen renders an em dash for
  PnL/price (never a fabricated 0).
- **Manual-sell ledger in mock mode** is a session-local simulation: a 100 % sell removes the position and appends one
  `manual` close so dashboard `/positions` `/pnl` agree; the paper API is the real source in http mode.
- **Practice epoch on Settings** starts unknown in http mode: the API has no GET for the reset state, so the epoch
  line appears only after a reset (the 24 h cooldown still comes back as `429` with `next_allowed_at`).
- **Container build** is verified in CI (`web` workflow `docker` job: image builds, container reports
  `healthy`, `GET /login` → 200). This machine still has no Docker engine, so the same two commands
  above are unverified locally.

## 5-minute local smoke checklist (click by click)

Stack: Postgres 17, paper API on `:8080`, web in `DATA_SOURCE=http` on `:3100` (§1–§3). Use one owner wallet.

| # | Do this | Expected result |
|---|---|---|
| 1 | `curl http://127.0.0.1:8080/healthz` | `200` with `mode: "practice"` and `real_enabled: false`; web `http://localhost:3100` loads the sign-in screen. |
| 2 | Click **Phantom**, approve the SIWS signature | Dashboard loads with 30 paper SOL start, cash/realized/open tiles, strategies table, activity feed. |
| 3 | Open **Settings** → **Stop buying** → confirm in the dialog | Card badge switches to **Buying paused**, shows **Paused at (WIB)** and **Paused via web**; `GET /trading` has `buys_paused: true` and a bumped `rev`. |
| 4 | Go to **Dashboard**, then **Strategies** | A warning banner **Buying is paused** with the WIB time and an **Open settings** link appears on both pages. |
| 5 | Return to **Settings** → **Resume buying** → confirm | Badge returns to **Buying active**, the paused-at row disappears, banners vanish on Dashboard/Strategies, `rev` bumps again. |
| 6 | **Approvals** → open a pending buy pick → hold **Approve** | Toast confirms; the item leaves the pending list. Open **Positions**: the new pair is listed, and the Dashboard open count / **in positions** SOL are the same as `/positions` (one snapshot). |
| 7 | On **Positions** focus that row → **Sell** → pick **100 %** | Before touching the hold button the sheet has **no** "Released early" note. Hold to fill: the row disappears, and **PnL** shows the new `manual` close as the newest row. Dashboard open count and in-positions SOL drop by that row. |
| 8 | **PnL** → switch language to **ID** (Settings → Language) | Ledger headers read **Koin · Masuk → keluar · Durasi tahan · Masuk · Keluar · Biaya (dilaporkan)**; no English `Entry → exit` / `Hold`. |
| 9 | **Strategies** → edit a Paper strategy → click **Real** | Dialog explains Real rules and holds 2.5 s. A Paper → Real attempt ends with the inline server lock explanation (403 `MODE_NOT_ALLOWED`) and the card refreshes; Real → Paper (when a Real strategy exists) applies immediately. |
| 10 | **Dashboard** → **PnL** report card → **Full report** (`/pnl`) | Realized/unrealized/total and the closed count match the Dashboard card; a missing value stays an em dash, never `0.00`. |