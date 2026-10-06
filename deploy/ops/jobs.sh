#!/usr/bin/env bash
# Every 5 minutes: run due jobs (reminders, alerts, month-end notice) and send queued email.
source "$(dirname "$0")/common.sh"
out=$(docker exec "$C" lemans run-jobs 2>&1) || fail "jobs: run failed: ${out:0:200}"
case "$out" in *'"ran":[]'*) ;; *) log "jobs: ${out:0:300}" ;; esac
