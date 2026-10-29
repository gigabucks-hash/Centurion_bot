#!/usr/bin/env bash
# Recreate the desktop smoke database on the local Postgres Backend uses for its tests
# (PGHOST=/tmp PGPORT=55432 PGUSER=postgres by default): Backend's local shim + migrations + API test
# seed (read-only reuse), then apps/desktop/scripts/dev-seed/desktop_seed.sql. Prints the DATABASE_URL.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
backend="$(cd "$here/../../../../services/backend" && pwd)"
: "${PGHOST:=/tmp}" "${PGPORT:=55432}" "${PGUSER:=postgres}" "${SMOKE_DB:=sentra_desktop_smoke}"
export PGHOST PGPORT PGUSER
[[ "$SMOKE_DB" =~ ^[a-z_][a-z0-9_]{0,40}$ ]] || { echo "bad SMOKE_DB" >&2; exit 2; }
q() { psql -q -X -v ON_ERROR_STOP=1 -o /dev/null "$@"; }
q -d postgres -c "drop database if exists $SMOKE_DB" -c "create database $SMOKE_DB"
q -d "$SMOKE_DB" -f "$backend/supabase/tests/00_local_shim.sql"
for m in $(ls "$backend/supabase/migrations"/*.sql | sort); do q -d "$SMOKE_DB" -f "$m"; done
q -d "$SMOKE_DB" -f "$backend/api/test/seed.sql"
q -d "$SMOKE_DB" -f "$here/desktop_seed.sql"
host="$PGHOST"; [[ "$host" == /* ]] && host="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$PGHOST")"
echo "postgres://$PGUSER@$host:$PGPORT/$SMOKE_DB"
