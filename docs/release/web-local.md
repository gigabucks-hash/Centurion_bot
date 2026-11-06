# Run the web app against the paper API (local)

This is the fastest usable surface: the Next.js app in `apps/web`, signed in with Phantom, reading and trading the
paper backend in `services/backend`. No chain, no real funds, no deploy.

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

## Known gaps (honest)

- **Open-position marks**: the REST API reports size/entry/rev but not a per-row mark price or unrealized PnL, so the
  positions screen shows an em dash for PnL/price instead of inventing a number. The executor feed has the values; a
  small `position_wire` + marks read is the next backend task.
- **Coin detail trail**: `/coins/{mint}/timeline` exists but the web trail decoder is not written yet; the detail page
  shows no trail.
- **Buy pause/resume and mode switches**: web routes for these are still mock-only; approving/rejecting works.
- **Coin tradeability flag**: `/coins` does not carry `tradeable`/`skip_reason`, so the screener does not mark rows
  untradeable yet.
- **Container build** on this machine is unverified (no Docker engine); the app build itself passes.