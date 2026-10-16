#!/usr/bin/env bash
# Runs the multi-store tests against a disposable copy of the whole app (separate database, port 8081),
# then throws it away. Your real data is never touched.
#   ./scripts/test-app.sh            run the tests
#   ./scripts/test-app.sh keep       leave the test app running on :8081 afterwards (for manual checks)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
C="docker compose -p kumtest -f docker-compose.yml -f docker-compose.test.yml"
cleanup() { [ "${1:-}" = keep ] || $C down -v >/dev/null 2>&1; }
trap 'cleanup "${1:-}"' EXIT
$C up --build -d >/dev/null
for _ in $(seq 1 60); do curl -sf localhost:8081/api/health >/dev/null && break; sleep 1; done
curl -sf localhost:8081/api/health >/dev/null || { echo "test app did not start"; exit 1; }
(cd frontend && node --test src/locales/locales.test.js)   # translations: nothing missing in English or Thai
(cd backend && KUMTUN_URL=http://localhost:8081 node --test)
