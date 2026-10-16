#!/usr/bin/env bash
# The load test on workflow_dispatch (Stage 10, .github/workflows/slow.yml): the load seed at 1/10
# (50 businesses, 60,000 bills) into the CI database, the app already running on :3000, then k6
# against the budgets. LOAD_SCALE and LOAD_DURATION override. The seed is removed at the end.
set -euo pipefail
cd "$(dirname "$0")/../.."
SCALE="${LOAD_SCALE:-0.1}"
npx tsx --conditions=react-server apps/worker/src/load/cli.ts seed "$SCALE"
trap 'npx tsx --conditions=react-server apps/worker/src/load/cli.ts remove' EXIT
if command -v k6 >/dev/null 2>&1; then
  k6 run -e BASE="${E2E_BASE_URL:-http://127.0.0.1:3000}" -e SCALE="$SCALE" tests/load/routes.k6.js
else
  echo "k6 is not installed: running tests/load/measure.mjs instead"
  node tests/load/measure.mjs --base "${E2E_BASE_URL:-http://127.0.0.1:3000}" --businesses "$(node -e "console.log(Math.max(1, Math.round(500 * $SCALE)))")" --users 20 --seconds "${LOAD_DURATION:-120}"
fi
