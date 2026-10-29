#!/usr/bin/env bash
# Real-transport smoke test: desktop HttpTransport (Rust) ↔ services/backend/api (practice only).
#   apps/desktop/scripts/smoke-real.sh            # fresh DB, start API, run cases, stop API
#   apps/desktop/scripts/smoke-real.sh --serve    # fresh DB + API only; writes .env.smoke.local (0600,
#                                                 # gitignored) for `set -a; . .env.smoke.local; npm run tauri dev`
# Needs: local Postgres (Backend's test instance, PGHOST/PGPORT/PGUSER), node ≥ 22.18, psql, cargo,
# services/backend/api/node_modules (npm ci there). Installs nothing.
# Dev JWT secret: SENTRA_DEV_JWT_SECRET from apps/desktop/.env.local (gitignored; generated on first
# run with openssl). Never committed, never printed. The token is minted with Backend's own signJwt().
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
desk="$(cd "$here/.." && pwd)"
api="$(cd "$desk/../../services/backend/api" && pwd)"
env_file="$desk/.env.local"
: "${PGHOST:=/tmp}" "${PGPORT:=55432}" "${PGUSER:=postgres}" "${SMOKE_DB:=sentra_desktop_smoke}" "${SMOKE_PORT:=18080}"
export PGHOST PGPORT PGUSER SMOKE_DB
for t in psql node cargo openssl; do command -v "$t" >/dev/null || { echo "missing tool: $t (not installing)" >&2; exit 3; }; done
[[ -d "$api/node_modules" ]] || { echo "services/backend/api/node_modules missing (run npm ci there)" >&2; exit 3; }
if [[ ! -f "$env_file" ]] || ! grep -q '^SENTRA_DEV_JWT_SECRET=' "$env_file"; then
  umask 077; echo "SENTRA_DEV_JWT_SECRET=$(openssl rand -hex 32)" >> "$env_file"
fi
SENTRA_DEV_JWT_SECRET="$(grep '^SENTRA_DEV_JWT_SECRET=' "$env_file" | head -1 | cut -d= -f2-)"
git -C "$desk" check-ignore -q "$env_file" || { echo ".env.local is not gitignored — refusing" >&2; exit 4; }

db_url="$("$here/dev-seed/reset-db.sh")"
log="$(mktemp -t sentra-api-smoke.XXXX.log)"
( cd "$api" && TRADING_MODE=paper DATABASE_URL="$db_url" SUPABASE_JWT_SECRET="$SENTRA_DEV_JWT_SECRET" \
  API_HOST=127.0.0.1 API_PORT="$SMOKE_PORT" exec node src/main.ts ) >"$log" 2>&1 &
api_pid=$!
trap 'kill $api_pid 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:$SMOKE_PORT/healthz" >/dev/null && break; sleep 0.2; done
curl -sf "http://127.0.0.1:$SMOKE_PORT/healthz" >/dev/null || { echo "API did not start:"; cat "$log"; exit 5; }

# Owner of the seeded workspace, read+trade, channel desktop, 15 min.
token="$(cd "$api" && SECRET="$SENTRA_DEV_JWT_SECRET" node --input-type=module -e '
import { signJwt } from "./src/jwt.ts";
process.stdout.write(signJwt({ sub: "00000000-0000-0000-0000-0000000000a1", aud: "authenticated", role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 900, app_scopes: ["read", "trade"], sentra_client: "desktop" }, process.env.SECRET));')"

if [[ "${1:-}" == "--serve" ]]; then
  ( umask 077; printf 'SENTRA_BACKEND=%s\nSENTRA_WORKSPACE_ID=%s\nSENTRA_BACKEND_TOKEN=%s\n' "http://127.0.0.1:$SMOKE_PORT" \
      "10000000-0000-0000-0000-0000000000a1" "$token" > "$desk/.env.smoke.local" )
  git -C "$desk" check-ignore -q "$desk/.env.smoke.local" || { echo ".env.smoke.local not gitignored" >&2; exit 4; }
  echo "API on http://127.0.0.1:$SMOKE_PORT (pid $api_pid, log $log); env in .env.smoke.local; Ctrl-C to stop"
  wait "$api_pid"; exit 0
fi
export SENTRA_BACKEND="http://127.0.0.1:$SMOKE_PORT" SENTRA_WORKSPACE_ID="10000000-0000-0000-0000-0000000000a1" SENTRA_BACKEND_TOKEN="$token"
cd "$desk/src-tauri"
set +e
cargo test --offline --lib backend::smoke_real -- --ignored --nocapture --test-threads=1 2>&1 | sed -E 's/^test backend::smoke_real::smoke_real_transport \.\.\. //' | grep -E "^(PASS|FAIL|MISMATCH|NOTE|SUMMARY|  mismatch|test result|thread|scanned)"
rc=${PIPESTATUS[0]}
set -e
echo "api log: $log"
exit "$rc"
