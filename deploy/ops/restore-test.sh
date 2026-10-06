#!/usr/bin/env bash
# Weekly proof that the latest backup restores and its ledger verifies (in a scratch database).
source "$(dirname "$0")/common.sh"
latest=$(ls -1t backups/lemans-*.dump 2>/dev/null | head -1) || true
[ -n "$latest" ] || fail "restore test: no backup found"
out=$(docker exec -i "$C" lemans restore-test < "$latest" 2>&1) || fail "restore test failed for $latest: ${out: -200}"
case "$out" in *"LEDGER OK"*) log "restore test ok: $latest - $(echo "$out" | grep -E 'restored|LEDGER' | tr '\n' ' ')" ;; *) fail "restore test: ledger did not verify for $latest" ;; esac
