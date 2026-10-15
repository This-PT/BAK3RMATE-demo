#!/usr/bin/env bash
# Saves a copy of a database that is NOT in Docker (for example Neon). Needs Docker only to run pg_dump.
#   DATABASE_URL='postgres://...?sslmode=require' ./scripts/backup-remote.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
: "${DATABASE_URL:?Set DATABASE_URL to your database's connection string}"
mkdir -p backups
FILE="backups/remote-$(date +%Y-%m-%d_%H%M).sql.gz"
# a newer pg_dump can read older servers, so use a recent one
docker run --rm "${PG_IMAGE:-postgres:17-alpine}" pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$FILE"
[ -s "$FILE" ] || { echo "backup is empty, something is wrong" >&2; rm -f "$FILE"; exit 1; }
ls -1t backups/remote-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "saved $FILE ($(du -h "$FILE" | cut -f1))"
