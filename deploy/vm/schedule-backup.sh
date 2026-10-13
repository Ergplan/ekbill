#!/usr/bin/env bash
# Put the nightly v2 backup in this user's crontab at 02:30 IST (21:00 UTC). Idempotent: the line
# is replaced, never duplicated, and the MVP's own backup line (easybills) is left alone.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

line="0 21 * * * $REPO_DIR/deploy/vm/backup.sh >> \$HOME/ekbill2-backup.log 2>&1"
if ! command -v crontab >/dev/null 2>&1; then
  echo "cron is not installed; the nightly backup is NOT scheduled. Install it (sudo apt-get install -y cron) and run this again."
  exit 1
fi
( crontab -l 2>/dev/null | grep -v "$REPO_DIR/deploy/vm/backup.sh" ; echo "$line" ) | crontab -
echo "scheduled:"; crontab -l | grep "$REPO_DIR/deploy/vm/backup.sh"
