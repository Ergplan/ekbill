#!/usr/bin/env bash
# Start or update EkBill v2 on this VM. Safe to run again at any time.
#
#   deploy/vm/up.sh                 # build the image and start (needs ~8 GB free)
#   EKBILL_NO_BUILD=1 deploy/vm/up.sh   # start what is there (low disk, or only settings changed)
#
# Secrets are read from Secret Manager (the MVP's: ekbill-db-password, ekbill-gate-password,
# ekbill-openai-api-key) into this shell and handed to compose; they are never written to a file.
# The model names come from .env (paste 3). The gate password is hashed in a throwaway Caddy.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

say "Where we are"
df -h / | tail -1
if docker ps --filter label=com.docker.compose.project=ekbill --format '{{.Names}}' | grep -q .; then
  echo "The MVP (compose project ekbill) is still running. Stop it first (paste 2): never both at once on 8080/80/443."
  exit 1
fi
if [ "${EKBILL_NO_BUILD:-}" != "1" ] && [ "$(free_gb)" -lt 8 ]; then
  echo "Only $(free_gb)G free; an image build needs ~8G. Run deploy/vm/free-space.sh, or EKBILL_NO_BUILD=1 deploy/vm/up.sh."
  exit 1
fi

say "Secrets"
load_env
EKBILL_DB_PASSWORD="$(secret ekbill-db-password)"
[ -n "$EKBILL_DB_PASSWORD" ] || { echo "ekbill-db-password has no value in Secret Manager."; exit 1; }
gate="$(secret ekbill-gate-password)"
[ -n "$gate" ] || { echo "ekbill-gate-password has no value in Secret Manager."; exit 1; }
if [ -z "${OPENAI_API_KEY:-}" ]; then OPENAI_API_KEY="$(secret ekbill-openai-api-key)"; fi
echo "database password: present; gate password: present; OpenAI key: $([ -n "${OPENAI_API_KEY:-}" ] && echo present || echo 'not set (photo reading, voice and Poocho stay off)')"

EKBILL_GATE_HASH="$(printf '%s' "$gate" | docker run --rm -i caddy:2 sh -c 'caddy hash-password --plaintext "$(cat)"')"
unset gate
EKBILL_DOMAIN="$(domain)"
[ -n "$EKBILL_DOMAIN" ] || { echo "Could not work out a domain. Set EKBILL_DOMAIN in .env or write it to deploy/vm/domain."; exit 1; }
export EKBILL_DB_PASSWORD OPENAI_API_KEY EKBILL_GATE_HASH EKBILL_DOMAIN
export AUTH_MODE="${AUTH_MODE:-switcher}" SESSION_SECRET="${SESSION_SECRET:-}"
export OPENAI_VISION_MODEL="${OPENAI_VISION_MODEL:-}" OPENAI_TEXT_MODEL="${OPENAI_TEXT_MODEL:-}" OPENAI_REALTIME_MODEL="${OPENAI_REALTIME_MODEL:-}"
echo "domain: $EKBILL_DOMAIN   auth mode: $AUTH_MODE"
mkdir -p "$STATE_DIR"

if [ "${EKBILL_NO_BUILD:-}" = "1" ]; then
  say "Start without building (compose project $COMPOSE_PROJECT)"
  "${COMPOSE[@]}" up -d --no-build --remove-orphans
else
  say "Build and start (compose project $COMPOSE_PROJECT)"
  "${COMPOSE[@]}" up -d --build --remove-orphans
fi
"${COMPOSE[@]}" ps

say "Waiting for the app"
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then break; fi
  sleep 3
done
curl -sS http://127.0.0.1:8080/api/health; echo

say "Public address"
echo "https://$EKBILL_DOMAIN  (user: ${EKBILL_GATE_USER:-ekbill}; password: gcloud secrets versions access latest --secret=ekbill-gate-password)"
echo "The first HTTPS request can take ~30s while Caddy gets the certificate."
