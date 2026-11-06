#!/usr/bin/env bash
# Apply the migration + smoke tests to a throwaway local Postgres database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/check_sql.sh   (needs a superuser)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${SOLBOT_TEST_DB:-solbot_test}"
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P=(psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null)
# dblink connects from the server process, so it cannot inherit the client env.
N1_CONN="dbname=$DB host=${PGHOST:-localhost} port=${PGPORT:-5432} user=${PGUSER:-postgres}"
if [ -n "${PGPASSWORD:-}" ]; then N1_CONN="$N1_CONN password=$PGPASSWORD"; fi
"${P[@]}" -f supabase/tests/00_local_shim.sql
for m in supabase/migrations/*.sql; do "${P[@]}" -f "$m"; done
for s in supabase/tests/[1-9]*.sql; do "${P[@]}" -v n1_conn="$N1_CONN" -f "$s"; done
python3 scripts/check_error_codes.py
