# Shared by the ops scripts. Logs go to syslog under the tag "lemans2" (journalctl -t lemans2).
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose"
log() { logger -t lemans2 -- "$*"; echo "$(date -u +%FT%TZ) $*"; }
fail() { logger -p user.err -t lemans2 -- "ALERT: $*"; echo "ALERT: $*" >&2; exit 2; }
