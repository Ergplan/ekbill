#!/usr/bin/env bash
# The restore drill (Stage 10): last night's backup into a scratch database beside the live one,
# checked whole (scripts/restore-check.mjs), the integration suite run in that same Postgres,
# the time recorded in deploy/vm/state/last-restore-drill.json. The live database, the app and
# the worker are not touched; the scratch databases are dropped at the end.
#
#   deploy/vm/restore-drill.sh            # the newest backup
#   deploy/vm/restore-drill.sh gs://.../ekbill2-20261015-210000.dump
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

src="${1:-latest}"
if [ "$src" = "latest" ]; then
  src="$(gcloud storage ls "gs://$BUCKET/pg2/" --project="$PROJECT" | grep '\.dump$' | sort | tail -1)"
fi
[ -n "$src" ] || { echo "No backup found in gs://$BUCKET/pg2/."; exit 1; }
db="$(container_of db)"
[ -n "$db" ] || { echo "The v2 database container (project $COMPOSE_PROJECT) is not running."; exit 1; }

# Names carry "test": the integration suite refuses any other database, and nothing here can reach the live one.
DRILL=ekbill2_drill_test
SUITE=ekbill2_drillsuite_test
psql_in() { docker exec -i "$db" psql -U ekbill -d ekbill -v ON_ERROR_STOP=1 -qAt "$@"; }
cleanup() {
  psql_in -c "drop database if exists $DRILL" -c "drop database if exists $SUITE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

say "Restoring $src into $DRILL"
started=$(date +%s)
cleanup
psql_in -c "create database $DRILL" -c "create database $SUITE"
gcloud storage cp "$src" - --project="$PROJECT" | docker exec -i "$db" pg_restore -U ekbill -d "$DRILL" --no-owner
restored=$(date +%s)

say "Checking the restored copy"
port="$(docker port "$db" 5432 2>/dev/null | head -1 | sed 's/.*://')"
[ -n "$port" ] || { echo "The database container publishes no port for the check; see docker-compose.yml."; exit 1; }
EKBILL_DB_PASSWORD="${EKBILL_DB_PASSWORD:-$(secret ekbill-db-password)}"
base="postgres://ekbill:${EKBILL_DB_PASSWORD}@127.0.0.1:${port}"
node "$REPO_DIR/scripts/restore-check.mjs" "$base/$DRILL"
checked=$(date +%s)

say "The integration suite in the same Postgres ($SUITE)"
( cd "$REPO_DIR" && DATABASE_URL_TEST="$base/$SUITE" npx vitest run --project integration )
finished=$(date +%s)

mkdir -p "$STATE_DIR"
printf '{"at":"%s","backup":"%s","restoreSeconds":%s,"checkSeconds":%s,"suiteSeconds":%s,"totalSeconds":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$src" $((restored - started)) $((checked - restored)) $((finished - checked)) \
  $((finished - started)) > "$STATE_DIR/last-restore-drill.json"
echo "restore drill passed in $((finished - started)) s (restore $((restored - started)) s); recorded in deploy/vm/state/last-restore-drill.json"
