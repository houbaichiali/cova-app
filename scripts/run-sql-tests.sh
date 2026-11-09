#!/usr/bin/env bash
# Runs the COVA SQL test harness against a plain local Postgres (NOT Supabase).
#
# Usage:
#   scripts/run-sql-tests.sh [connection-args...]     e.g. scripts/run-sql-tests.sh
#   Env: PGHOST, PGUSER, PGDATABASE (defaults: /tmp/pgdata socket, postgres, covabase)
#
# The chain is:
#   00_mock_supabase.sql      fake auth schema / roles / realtime publication
#   migrations 20261012*      social base schema (profiles must exist first)
#   05_base_schema_stub.sql   TEST-ONLY stubs for tables whose real DDL lives in
#                             the live database (spaces/courses/assignments...)
#   remaining migrations      everything else, in filename order
#   10_rls_tests.sql          the assertions; must end with fail=0
set -euo pipefail
cd "$(dirname "$0")/../supabase"

export PGHOST="${PGHOST:-/tmp/pgdata}" PGUSER="${PGUSER:-postgres}"
DB="${PGDATABASE:-covabase}"

psql -d "$DB" -q -c "drop database if exists $DB" >/dev/null 2>&1 || dropdb --if-exists "$DB"
createdb "$DB"

psql -d "$DB" -q -f tests/00_mock_supabase.sql 2>/dev/null

applied_stub=0
for f in migrations/*.sql; do
  # insert the test-only stub right before the first migration that touches the
  # live-only tables (community_post_attachments alters space_posts)
  if [ "$applied_stub" = 0 ] && [[ "$f" == *20261022000001* ]]; then
    psql -d "$DB" -q -v ON_ERROR_STOP=1 -f tests/05_base_schema_stub.sql
    applied_stub=1
  fi
  if ! psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/tmp/cova_mig_err.txt 2>&1; then
    echo "MIGRATION FAILED: $f"; tail -10 /tmp/cova_mig_err.txt; exit 1
  fi
done
echo "-- all migrations applied"

psql -d "$DB" -v ON_ERROR_STOP=1 -f tests/10_rls_tests.sql 2>&1 | tail -3
psql -d "$DB" -v ON_ERROR_STOP=1 -f tests/20_admin_tests.sql 2>&1 | tail -3
psql -d "$DB" -v ON_ERROR_STOP=1 -f tests/30_profile_tests.sql 2>&1 | tail -3
