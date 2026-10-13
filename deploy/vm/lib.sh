# shellcheck shell=bash disable=SC2034
# Shared by the scripts in deploy/vm. Sourced, not run.
#
# v2 lives beside the stopped MVP on the shared VM: compose project ekbill2, volume ekbill2_pgdata.
# These scripts never touch the tariff or fdre products, the MVP's project (ekbill) or its volume.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_PROJECT=ekbill2
COMPOSE=(docker compose -p "$COMPOSE_PROJECT" -f "$REPO_DIR/deploy/docker-compose.yml")
PROJECT="${EKBILL_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
PROJECT="${PROJECT:-tariff-order-parsing}"
VM_NAME="${EKBILL_VM:-tariff-order}"
VM_ZONE="${EKBILL_ZONE:-asia-south2-b}"
BUCKET="${EKBILL_BACKUP_BUCKET:-${PROJECT}-ekbill-backups}"
STATE_DIR="$REPO_DIR/deploy/vm/state"

say() { printf '\n== %s\n' "$*"; }

# A secret's latest value, or empty when it has none yet. Never echoed.
secret() {
  gcloud secrets versions access latest --secret="$1" --project="$PROJECT" 2>/dev/null || true
}

# .env at the repo root (paste 3), read into this shell without printing. Environment wins.
load_env() {
  [ -f "$REPO_DIR/.env" ] || return 0
  while IFS='=' read -r key value; do
    case "$key" in ''|\#*) continue ;; esac
    key="$(echo "$key" | tr -d ' ')"
    if [ -z "${!key:-}" ]; then export "$key=$value"; fi
  done < "$REPO_DIR/.env"
}

# The running container of one v2 service (db, app, worker, docling, caddy), by compose's labels.
# Scripts that only need a running container use plain `docker`, because `docker compose -f ...`
# refuses to load the file without the secrets in the environment -- the situation under cron.
container_of() {
  docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "label=com.docker.compose.service=$1" | head -1
}

external_ip() {
  curl -fsS -H 'Metadata-Flavor: Google' \
    'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip' \
    2>/dev/null || true
}

# The HTTPS name: EKBILL_DOMAIN if set, else deploy/vm/domain if present, else <ip-with-dashes>.sslip.io.
domain() {
  if [ -n "${EKBILL_DOMAIN:-}" ]; then echo "$EKBILL_DOMAIN"; return; fi
  if [ -s "$REPO_DIR/deploy/vm/domain" ]; then tr -d ' \n' < "$REPO_DIR/deploy/vm/domain"; return; fi
  local ip; ip="$(external_ip)"
  [ -n "$ip" ] && echo "${ip//./-}.sslip.io"
}

free_gb() { df -BG --output=avail / | tail -1 | tr -dc 0-9; }
