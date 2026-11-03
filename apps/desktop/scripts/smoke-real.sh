#!/usr/bin/env bash
# Real-transport smoke test: desktop HttpTransport (Rust) ↔ services/backend/api (practice only).
#   apps/desktop/scripts/smoke-real.sh            # fresh DB, start API, run cases, stop API
#   apps/desktop/scripts/smoke-real.sh --serve    # fresh DB + API only; writes .env.smoke.local (0600,
#                                                 # gitignored) for `set -a; . .env.smoke.local; npm run tauri dev`
# Needs: local Postgres (Backend's test instance, PGHOST/PGPORT/PGUSER), node ≥ 22.18, psql, cargo,
# services/backend/api/node_modules (npm ci there). Installs nothing.
# Dev JWT secret: CENTURION_DEV_JWT_SECRET from apps/desktop/.env.local (gitignored; generated on first
# run with openssl). Never committed, never printed. The token is minted with Backend's own signJwt().
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
desk="$(cd "$here/.." && pwd)"
api="$(cd "$desk/../../services/backend/api" && pwd)"
env_file="$desk/.env.local"
: "${PGHOST:=/tmp}" "${PGPORT:=55432}" "${PGUSER:=postgres}" "${SMOKE_DB:=centurion_desktop_smoke}" "${SMOKE_PORT:=18080}"
export PGHOST PGPORT PGUSER SMOKE_DB
for t in psql node cargo openssl; do command -v "$t" >/dev/null || { echo "missing tool: $t (not installing)" >&2; exit 3; }; done
[[ -d "$api/node_modules" ]] || { echo "services/backend/api/node_modules missing (run npm ci there)" >&2; exit 3; }
if [[ ! -f "$env_file" ]] || ! grep -q '^CENTURION_DEV_JWT_SECRET=' "$env_file"; then
  umask 077; echo "CENTURION_DEV_JWT_SECRET=$(openssl rand -hex 32)" >> "$env_file"
fi
CENTURION_DEV_JWT_SECRET="$(grep '^CENTURION_DEV_JWT_SECRET=' "$env_file" | head -1 | cut -d= -f2-)"
grep -q '^CENTURION_DEV_SESSION_SECRET=' "$env_file" || { umask 077; echo "CENTURION_DEV_SESSION_SECRET=$(openssl rand -hex 32)" >> "$env_file"; }
CENTURION_DEV_SESSION_SECRET="$(grep '^CENTURION_DEV_SESSION_SECRET=' "$env_file" | head -1 | cut -d= -f2-)"
# SIWS on (fails closed without an owner): the "owner" is the wSOL mint address — a public key nobody
# holds a private key for, so no real login can succeed; the smoke only exercises non-signing paths.
SMOKE_SIWS_DOMAIN="app.centuriontrade.local"
SMOKE_OWNER_WALLET="So11111111111111111111111111111111111111112"
export SMOKE_SIWS_DOMAIN SMOKE_OWNER_WALLET
git -C "$desk" check-ignore -q "$env_file" || { echo ".env.local is not gitignored — refusing" >&2; exit 4; }

db_url="$("$here/dev-seed/reset-db.sh")"
log="$(mktemp -t centurion-api-smoke.XXXX.log)"
( cd "$api" && TRADING_MODE=paper DATABASE_URL="$db_url" SUPABASE_JWT_SECRET="$CENTURION_DEV_JWT_SECRET" \
  AUTH_SIWS_DOMAINS="$SMOKE_SIWS_DOMAIN" OWNER_WALLETS="$SMOKE_OWNER_WALLET" AUTH_USER_CREATE=direct \
  CENTURION_SESSION_SECRET="$CENTURION_DEV_SESSION_SECRET" \
  API_HOST=127.0.0.1 API_PORT="$SMOKE_PORT" exec node src/main.ts ) >"$log" 2>&1 &
api_pid=$!
trap 'kill $api_pid 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:$SMOKE_PORT/healthz" >/dev/null && break; sleep 0.2; done
curl -sf "http://127.0.0.1:$SMOKE_PORT/healthz" >/dev/null || { echo "API did not start:"; cat "$log"; exit 5; }

# Owner of the seeded workspace, read+trade, channel desktop, 15 min.
token="$(cd "$api" && SECRET="$CENTURION_DEV_JWT_SECRET" node --input-type=module -e '
import { signJwt } from "./src/jwt.ts";
process.stdout.write(signJwt({ sub: "00000000-0000-0000-0000-0000000000a1", aud: "authenticated", role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 900, app_scopes: ["read", "trade"], centurion_client: "desktop" }, process.env.SECRET));')"

if [[ "${1:-}" == "--serve" ]]; then
  ( umask 077; printf 'CENTURION_BACKEND=%s\nCENTURION_WORKSPACE_ID=%s\nCENTURION_BACKEND_TOKEN=%s\n' "http://127.0.0.1:$SMOKE_PORT" \
      "10000000-0000-0000-0000-0000000000a1" "$token" > "$desk/.env.smoke.local" )
  git -C "$desk" check-ignore -q "$desk/.env.smoke.local" || { echo ".env.smoke.local not gitignored" >&2; exit 4; }
  echo "API on http://127.0.0.1:$SMOKE_PORT (pid $api_pid, log $log); env in .env.smoke.local; Ctrl-C to stop"
  wait "$api_pid"; exit 0
fi
export CENTURION_BACKEND="http://127.0.0.1:$SMOKE_PORT" CENTURION_WORKSPACE_ID="10000000-0000-0000-0000-0000000000a1" CENTURION_BACKEND_TOKEN="$token"
cd "$desk/src-tauri"
set +e
cargo test --offline --lib backend::smoke_real -- --ignored --nocapture --test-threads=1 2>&1 | sed -E 's/^test backend::smoke_real::smoke_real_transport \.\.\. //' | grep -E "^(PASS|FAIL|MISMATCH|NOTE|SUMMARY|  mismatch|test result|thread|scanned)"
rc=${PIPESTATUS[0]}
set -e
echo "api log: $log"
exit "$rc"
