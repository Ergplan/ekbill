#!/usr/bin/env bash
# Put the nightly v2 backup in this user's crontab at 02:30 IST (21:00 UTC), and (Stage 10) the
# weekly disk log on Sundays at 08:30 IST (03:00 UTC). Idempotent: the lines are replaced, never
# duplicated, and the MVP's own backup line (easybills) is left alone.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

line="0 21 * * * $REPO_DIR/deploy/vm/backup.sh >> \$HOME/ekbill2-backup.log 2>&1"
disk="0 3 * * 0 $REPO_DIR/deploy/vm/disk-log.sh >> \$HOME/ekbill2-disk.log 2>&1"
if ! command -v crontab >/dev/null 2>&1; then
  echo "cron is not installed; the nightly backup is NOT scheduled. Install it (sudo apt-get install -y cron) and run this again."
  exit 1
fi
# grep -v on an empty crontab exits 1, which pipefail would turn into a failure: an empty crontab is a fine starting point.
( { crontab -l 2>/dev/null | grep -v -e "$REPO_DIR/deploy/vm/backup.sh" -e "$REPO_DIR/deploy/vm/disk-log.sh" || true; } ; echo "$line"; echo "$disk" ) | crontab -
echo "scheduled:"; crontab -l | grep -e "$REPO_DIR/deploy/vm/backup.sh" -e "$REPO_DIR/deploy/vm/disk-log.sh"
