#!/usr/bin/env bash
# Nightly full verification of the audit ledger; the full head hash goes to syslog (an off-database copy).
source "$(dirname "$0")/common.sh"
out=$(docker exec "$C" lemans verify-ledger 2>&1) || fail "ledger verification: ${out:0:300}"
case "$out" in *"LEDGER OK"*) log "$out" ;; *) fail "$out" ;; esac
