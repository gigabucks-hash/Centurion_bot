#!/usr/bin/env bash
# Apply the migration + smoke tests to a throwaway local Postgres database.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres scripts/check_sql.sh   (needs a superuser)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${SOLBOT_TEST_DB:-solbot_test}"
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P=(psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null)
"${P[@]}" -f supabase/tests/00_local_shim.sql
"${P[@]}" -f supabase/migrations/0001_init.sql
"${P[@]}" -f supabase/tests/10_smoke.sql
