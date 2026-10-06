#!/usr/bin/env bash
# Builds the image and starts it the way deploy/docker-compose.yml does - including settings passed
# as empty strings - then checks start-up, readiness, sign-in, the restricted DB role, the ops
# command, and a restart. Catches configuration problems that tests against `next start` cannot.
set -euo pipefail
IMG=${1:-lemans2:smoke}; NAME=lemans2-smoke; VOL=lemans2-smoke-data; PORT=3599
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker volume rm "$VOL" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
[ "${SKIP_BUILD:-}" = 1 ] || docker build -q -t "$IMG" . >/dev/null
docker run -d --name "$NAME" -p 127.0.0.1:$PORT:3100 -v "$VOL":/data \
  -e DEMO_MODE=true -e SEED_DEMO_DATA=true -e OFFICE_CIDRS= -e SMTP_URL= -e EMAIL_TRANSPORT=log \
  -e COVERAGE_FLOOR=0.8 -e APP_BASE_URL=https://example.invalid "$IMG" >/dev/null
wait_ready() { for _ in $(seq 1 90); do curl -fs localhost:$PORT/api/ready >/dev/null && return 0; sleep 1; done; docker logs "$NAME" | tail -30; return 1; }
wait_ready || { echo "FAIL: not ready"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -H "origin: http://localhost:$PORT" -d '{"userId":"u-sp01"}' localhost:$PORT/api/auth/demo-login)
[ "$code" = 200 ] || { echo "FAIL: sign-in returned $code"; exit 1; }
user=$(docker exec "$NAME" lemans psql -tAc "SELECT DISTINCT usename FROM pg_stat_activity WHERE datname = 'lemans' AND usename = 'lemans_app'")
[ "$user" = lemans_app ] || { echo "FAIL: app is not connected as lemans_app"; exit 1; }
docker exec "$NAME" lemans verify-ledger | grep -q "LEDGER OK" || { echo "FAIL: ledger"; exit 1; }
docker restart -t 30 "$NAME" >/dev/null && wait_ready || { echo "FAIL: not ready after restart"; exit 1; }
echo "container smoke test passed"
