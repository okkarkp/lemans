#!/bin/sh
# Single-container start-up: PostgreSQL (localhost only) + the Next.js app, each as its own
# unprivileged user. First start initialises the database and generates every secret onto the
# data volume (/data). Every start applies pending migrations before the app accepts traffic.
set -eu

DATA=/data
PGDATA=$DATA/pgdata
SECRETS=$DATA/secrets
export PGDATA

log() { echo "[lemans] $*"; }

# --- secrets: generated once, readable by root only, never printed -----------------------------
install -d -m 700 "$SECRETS"
secret() { [ -s "$SECRETS/$1" ] || (umask 077; head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-48 > "$SECRETS/$1"); }
for s in owner_password app_password session_secret jobs_token; do secret "$s"; done

# --- database -------------------------------------------------------------------------------------
FIRST_START=false
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  FIRST_START=true
  log "first start: initialising the database"
  install -d -o postgres -g postgres -m 700 "$PGDATA"
  su-exec postgres initdb -D "$PGDATA" --username=postgres --auth-local=peer --auth-host=scram-sha-256 --encoding=UTF8 >/dev/null
fi
install -d -o postgres -g postgres -m 775 /run/postgresql
su-exec postgres postgres -D "$PGDATA" -c listen_addresses=127.0.0.1 -c port=5432 \
  -c shared_buffers=128MB -c log_min_messages=warning -c log_destination=stderr &
PG_PID=$!
i=0; until su-exec postgres pg_isready -q -h /run/postgresql; do i=$((i+1)); [ $i -gt 60 ] && { log "database did not start"; exit 1; }; sleep 1; done

OWNER_PW=$(cat "$SECRETS/owner_password")
if [ "$FIRST_START" = true ]; then
  su-exec postgres psql -q -v ON_ERROR_STOP=1 -v pw="$OWNER_PW" <<'SQL'
CREATE ROLE lemans LOGIN CREATEROLE PASSWORD :'pw';
CREATE DATABASE lemans OWNER lemans;
SQL
fi

# One-time move from another installation: a pg_dump placed at /data/import.dump is restored on
# first start, then the migrations below bring it up to date. The file is renamed afterwards.
if [ "$FIRST_START" = true ] && [ -s "$DATA/import.dump" ]; then
  log "first start: restoring $DATA/import.dump"
  su-exec postgres psql -q -v ON_ERROR_STOP=1 -c "CREATE ROLE lemans_app_rw NOLOGIN" -c "GRANT lemans_app_rw TO lemans WITH ADMIN OPTION"
  su-exec postgres pg_restore -d lemans --no-owner --role=lemans --exit-on-error < "$DATA/import.dump"
  mv "$DATA/import.dump" "$DATA/import.dump.restored"
fi

export MIGRATIONS_DIR=/app/db/migrations
MIGRATION_DATABASE_URL="postgres://lemans:$OWNER_PW@127.0.0.1:5432/lemans" \
APP_DB_USER=lemans_app APP_DB_PASSWORD=$(cat "$SECRETS/app_password") \
  su-exec app node /app/ops/migrate.js

if [ "$FIRST_START" = true ] && [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  log "loading demo data"
  MIGRATION_DATABASE_URL="postgres://lemans:$OWNER_PW@127.0.0.1:5432/lemans" su-exec app node /app/ops/seed.js
fi

# --- application ------------------------------------------------------------------------------------
export DATABASE_URL="postgres://lemans_app:$(cat "$SECRETS/app_password")@127.0.0.1:5432/lemans"
export SESSION_SECRET="${SESSION_SECRET:-$(cat "$SECRETS/session_secret")}"
export JOBS_TOKEN="${JOBS_TOKEN:-$(cat "$SECRETS/jobs_token")}"
unset OWNER_PW
su-exec app node /app/server.js &
APP_PID=$!

stop() {
  log "stopping"
  kill -TERM "$APP_PID" 2>/dev/null || true
  wait "$APP_PID" 2>/dev/null || true
  su-exec postgres pg_ctl -D "$PGDATA" stop -m fast -w >/dev/null 2>&1 || true
}
trap 'stop; exit 0' TERM INT

# If either process dies, stop the other and exit, so Docker's restart policy brings both back.
while kill -0 "$APP_PID" 2>/dev/null && kill -0 "$PG_PID" 2>/dev/null; do sleep 2 & wait $!; done
log "a process exited unexpectedly"
stop
exit 1
