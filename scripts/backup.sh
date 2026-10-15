#!/usr/bin/env bash
# Saves a compressed copy of the database into ./backups and keeps the newest 14.
# Run it by hand, or every night with cron:   0 3 * * *  /path/to/kumtun/scripts/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
mkdir -p backups
FILE="backups/kumtun-$(date +%Y-%m-%d_%H%M).sql.gz"
docker compose exec -T db pg_dump -U kumtun kumtun | gzip > "$FILE"
[ -s "$FILE" ] || { echo "backup is empty, something is wrong" >&2; rm -f "$FILE"; exit 1; }
ls -1t backups/kumtun-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "saved $FILE ($(du -h "$FILE" | cut -f1))"
