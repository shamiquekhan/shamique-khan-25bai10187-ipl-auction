#!/usr/bin/env bash
# One-command verification suite:  bash scripts/verify.sh   (or: npm run verify)
#
#   1. typecheck (shared, server, web)
#   2. production build of the web app
#   3. unit + engine tests (vitest, in-memory SQLite)
#   4. race test (spawns its own in-memory server)
#   5. boots a THROWAWAY server on :3100 with a temp DB, then runs the
#      76-assertion backend check against it (your real DB/passcodes untouched)
#   6. 15-bot load/soak test (spawns its own in-memory server)
#   7. Playwright visual + axe accessibility suite against the throwaway server
#
# Config: VERIFY_PORT (default 3100), SKIP_UI=1 to skip step 7.
set -euo pipefail
cd "$(dirname "$0")/.."

VERIFY_PORT="${VERIFY_PORT:-3100}"
BASE="http://localhost:$VERIFY_PORT"
WORK="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  lsof -ti:"$VERIFY_PORT" 2>/dev/null | xargs -r kill 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { echo; echo "═══ $1 ═══"; }

step "1/7 typecheck"
npm run typecheck

step "2/7 build web"
npm run build

step "3/7 unit + engine tests"
npx vitest run

step "4/7 race test (concurrent bids, real sockets)"
npx tsx tests/race.ts

step "5/7 backend check (throwaway server on :$VERIFY_PORT, temp DB)"
PORT="$VERIFY_PORT" \
ADMIN_PASSWORD="verify-pass" \
DB_PATH="$WORK/auction.db" \
SEED_ON_EMPTY=true \
PASSCODES_CSV="$WORK/passcodes.csv" \
  npx tsx server/src/index.ts > "$WORK/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 60); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 0.5
done
curl -sf "$BASE/api/health" > /dev/null || {
  echo "throwaway server failed to boot:"; cat "$WORK/server.log"; exit 1;
}

AUCTION_BASE="$BASE" AUCTION_ADMIN="verify-pass" AUCTION_PASSCODES="$WORK/passcodes.csv" \
  npx tsx scripts/backend-check.ts

step "6/7 load test (15 bots)"
npx tsx tests/load.ts

if [ "${SKIP_UI:-0}" != "1" ]; then
  step "7/7 visual + axe accessibility (Playwright)"
  AUCTION_BASE="$BASE" npx playwright test --config web/playwright.config.ts --reporter=line
else
  echo; echo "(skipped UI suite — SKIP_UI=1)"
fi

echo
echo "✅ VERIFY: all suites passed"
