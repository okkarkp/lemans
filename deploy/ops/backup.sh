#!/usr/bin/env bash
# Nightly logical backup (custom format), kept for 14 days. Written atomically, mode 600.
source "$(dirname "$0")/common.sh"
umask 077
mkdir -p backups
out="backups/lemans-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec "$C" lemans backup > "$out.partial" || fail "backup failed"
[ -s "$out.partial" ] || fail "backup is empty"
mv "$out.partial" "$out"
find backups -name 'lemans-*.dump' -mtime +14 -print -delete | sed 's/^/expired: /'
log "backup ok: $out ($(du -h "$out" | cut -f1))"
