#!/usr/bin/env bash
# Every 2 minutes: if readiness fails 3 times in a row, restart the container.
source "$(dirname "$0")/common.sh"
state=/tmp/lemans2-watchdog.count
if curl -fsS --max-time 5 http://127.0.0.1:3310/api/ready >/dev/null 2>&1; then
  [ -f "$state" ] && log "watchdog: app healthy again"
  rm -f "$state"; exit 0
fi
n=$(( $(cat "$state" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$state"
if [ "$n" -ge 3 ]; then
  rm -f "$state"
  docker restart -t 30 "$C" >/dev/null 2>&1 && fail "watchdog: not ready for 3 checks in a row - restarted" || fail "watchdog: restart failed"
fi
log "watchdog: readiness check failed ($n/3)"
