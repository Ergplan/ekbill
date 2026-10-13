#!/usr/bin/env bash
# Load a v2 backup from the bucket into this VM's v2 database.
#
#   deploy/vm/restore.sh                      # the newest backup, into an empty database
#   deploy/vm/restore.sh latest --replace     # the newest, over a database that has businesses in it
#   deploy/vm/restore.sh gs://.../ekbill2-20261013-210000.dump
#
# It refuses to overwrite a database that already has businesses unless told --replace. The app
# and the worker are stopped while the restore runs. Stage 10's restore drill runs this.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

src="${1:-latest}"
replace="${2:-}"
if [ "$src" = "latest" ]; then
  src="$(gcloud storage ls "gs://$BUCKET/pg2/" --project="$PROJECT" | grep '\.dump$' | sort | tail -1)"
fi
[ -n "$src" ] || { echo "No backup found in gs://$BUCKET/pg2/."; exit 1; }
echo "backup: $src"

say "Database"
db="$(container_of db)"
if [ -z "$db" ]; then
  EKBILL_DB_PASSWORD="$(secret ekbill-db-password)"
  [ -n "$EKBILL_DB_PASSWORD" ] || { echo "ekbill-db-password has no value, or this VM cannot read it."; exit 1; }
  export EKBILL_DB_PASSWORD EKBILL_DOMAIN=unused EKBILL_GATE_HASH=unused
  "${COMPOSE[@]}" up -d --no-build db
  db="$(container_of db)"
fi
for _ in $(seq 1 60); do
  docker exec "$db" pg_isready -U ekbill -d ekbill >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$db" pg_isready -U ekbill -d ekbill >/dev/null || { echo "The database did not come up."; exit 1; }

existing="$(docker exec "$db" psql -U ekbill -d ekbill -tAc "select count(*) from businesses" 2>/dev/null || echo 0)"
if [ "${existing:-0}" != "0" ] && [ "$replace" != "--replace" ]; then
  echo "This database already has ${existing} business(es). Not overwriting it."
  echo "To replace it with the backup: deploy/vm/restore.sh ${1:-latest} --replace"
  exit 1
fi

say "Restoring"
for svc in app worker; do
  c="$(container_of $svc)"
  [ -z "$c" ] || { docker stop "$c" >/dev/null && echo "$svc stopped for the restore"; }
done
gcloud storage cp "$src" - --project="$PROJECT" | docker exec -i "$db" pg_restore -U ekbill -d ekbill --no-owner --clean --if-exists
echo "restored: $(docker exec "$db" psql -U ekbill -d ekbill -tAc "select count(*) from businesses" 2>/dev/null || echo '?') business(es)"
echo
echo "Now start v2 again: EKBILL_NO_BUILD=1 deploy/vm/up.sh"
