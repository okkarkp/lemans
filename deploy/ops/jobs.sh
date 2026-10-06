#!/usr/bin/env bash
# Every 5 minutes: run due jobs (reminders, alerts, month-end notice) and send queued email.
source "$(dirname "$0")/common.sh"
token=$(sed -n 's/^JOBS_TOKEN=//p' .env)
[ -n "$token" ] || fail "jobs: JOBS_TOKEN missing from .env"
out=$(curl -fsS --max-time 60 -X POST -H "x-jobs-token: $token" http://127.0.0.1:3310/api/internal/jobs 2>&1) || fail "jobs: run failed: ${out:0:200}"
case "$out" in *'"ran":[]'*) ;; *) log "jobs: ${out:0:300}" ;; esac
