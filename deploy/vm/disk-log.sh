#!/usr/bin/env bash
# Weekly (Stage 10): log what Docker holds and the free space. It only reads; nothing is removed
# unattended (rule 18). deploy/vm/free-space.sh is the by-hand clean-up for v2's own leftovers.
set -euo pipefail
echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker system df || echo "docker system df failed"
df -h / | tail -1
avail_kb="$(df -Pk / | awk 'NR==2{print $4}')"
if [ "${avail_kb:-0}" -lt $((8 * 1024 * 1024)) ]; then
  echo "WARNING: less than 8 GB free. Run deploy/vm/free-space.sh by hand and read what it offers."
fi
