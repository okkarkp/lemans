#!/usr/bin/env bash
# Nightly full verification of the audit ledger from the first entry.
source "$(dirname "$0")/common.sh"
if out=$($COMPOSE run --rm -T tools npx tsx scripts/verify-ledger.ts 2>&1 | grep -E 'LEDGER|rror'); then
  case "$out" in *"LEDGER OK"*) log "$out" ;; *) fail "$out" ;; esac
else
  fail "ledger verification could not run"
fi
