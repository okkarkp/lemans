#!/usr/bin/env bash
# Every 2 minutes: if readiness fails 3 times in a row, restart the app (not the database).
source "$(dirname "$0")/common.sh"
state=/tmp/lemans2-watchdog.count
if curl -fsS --max-time 5 http://127.0.0.1:3310/api/ready >/dev/null 2>&1; then
  [ -f "$state" ] && log "watchdog: app healthy again"
  rm -f "$state"; exit 0
fi
n=$(( $(cat "$state" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$state"
if [ "$n" -ge 3 ]; then
  rm -f "$state"
  $COMPOSE restart app >/dev/null 2>&1 && fail "watchdog: app not ready 3 checks running - restarted" || fail "watchdog: restart failed"
fi
log "watchdog: readiness check failed ($n/3)"
