#!/usr/bin/env bash
# Rebuilds a throwaway Postgres database, applies every migration in order and
# runs the database test suite against it.
#
# Uses a local Postgres with a small stand-in for the parts of Supabase the
# migrations rely on (the auth schema, the anon/authenticated/service_role
# roles), so the schema and its RLS policies can be verified without Docker.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
BASE="${WP_PGTEST_DIR:-/var/tmp/wp-pgtest}"
SOCK="$BASE/sock"
DB="${WP_TEST_DB:-writepilot}"
REPO="$(cd "$(dirname "${BASE_SOURCE:-$0}")/.." && pwd)"

run() { su postgres -c "$PGBIN/psql -h $SOCK -U postgres $*"; }

# Stage the SQL where the postgres user can read it.
rm -rf "$BASE/supabase"
cp -r "$REPO/supabase" "$BASE/"
chmod -R a+rX "$BASE/supabase" "$BASE/sql"

run "-q -c 'drop database if exists $DB;' -c 'create database $DB;'" > /dev/null
run "-d $DB -v ON_ERROR_STOP=1 -q -f $BASE/sql/00_harness.sql" 2>&1 | grep -iv notice || true

for file in "$BASE"/supabase/migrations/*.sql; do
  echo "applying $(basename "$file")"
  run "-d $DB -v ON_ERROR_STOP=1 -q -f $file" 2>&1 | grep -iv notice | grep -v '^$' || true
done

run "-d $DB -v ON_ERROR_STOP=1 -q -f $BASE/supabase/tests/database.test.sql" 2>&1 \
  | sed 's/^psql:[^ ]*: //'
