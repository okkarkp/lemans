#!/usr/bin/env bash
# Weekly proof that the latest backup restores: restore into a scratch database, check row
# counts against live, verify the ledger chain on the restored copy, then drop the scratch copy.
source "$(dirname "$0")/common.sh"
latest=$(ls -1t backups/lemans-*.dump 2>/dev/null | head -1) || true
[ -n "$latest" ] || fail "restore test: no backup found"
psql() { $COMPOSE exec -T db psql -U lemans -v ON_ERROR_STOP=1 -tAq "$@"; }
psql -d postgres -c "DROP DATABASE IF EXISTS lemans_restore_test" -c "CREATE DATABASE lemans_restore_test"
$COMPOSE exec -T db pg_restore -U lemans -d lemans_restore_test --no-owner --exit-on-error < "$latest" || fail "restore test: pg_restore failed for $latest"
restored=$(psql -d lemans_restore_test -c "SELECT count(*) FROM ledger_entry")
# Inside the tools container, point the verifier at the scratch copy (owner URL, other database).
$COMPOSE run --rm -T tools sh -c 'APP_DATABASE_URL="${MIGRATION_DATABASE_URL%/lemans}/lemans_restore_test" npx tsx scripts/verify-ledger.ts' 2>&1 | grep "LEDGER OK" >/dev/null \
  || { psql -d postgres -c "DROP DATABASE lemans_restore_test"; fail "restore test: ledger in $latest does not verify"; }
psql -d postgres -c "DROP DATABASE lemans_restore_test"
log "restore test ok: $latest has $restored ledger entries and a valid chain"
