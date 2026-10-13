#!/usr/bin/env bash
# Dump the v2 database to the backup bucket. Nightly from cron (deploy/vm/schedule-backup.sh),
# and by hand before anything risky. Writes deploy/vm/state/last-backup.json, which /api/health
# reports as the last backup's age.
#   restore: deploy/vm/restore.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

db="$(container_of db)"
[ -n "$db" ] || { echo "The v2 database container (project $COMPOSE_PROJECT) is not running; nothing to back up."; exit 1; }

stamp="$(date -u +%Y%m%d-%H%M%S)"
object="gs://$BUCKET/pg2/ekbill2-$stamp.dump"
# Custom format: compressed, and pg_restore can pick tables out of it. pipefail (lib.sh) makes a
# failed dump fail the backup instead of uploading an empty file.
docker exec -i "$db" pg_dump -U ekbill -d ekbill -Fc | gcloud storage cp - "$object" --project="$PROJECT"
size="$(gcloud storage ls -l "$object" --project="$PROJECT" | awk 'NR==1{print $1}')"
[ "${size:-0}" -gt 1000 ] || { echo "The backup at $object is suspiciously small (${size:-0} bytes). Check it."; exit 1; }
mkdir -p "$STATE_DIR"
printf '{"at":"%s","object":"%s","bytes":%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$object" "$size" > "$STATE_DIR/last-backup.json"
echo "backup written: $object (${size} bytes)"
