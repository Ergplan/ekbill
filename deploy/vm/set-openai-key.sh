#!/usr/bin/env bash
# Add or replace the app's OpenAI key in Secret Manager, typed at a hidden prompt, then restart.
# (The review loop's key lives only in .env, paste 3, and is not stored here.)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
echo "Paste the OpenAI API key and press Enter (nothing is shown):"
read -rs key
[ -n "$key" ] || { echo "Nothing entered."; exit 1; }
printf '%s' "$key" | gcloud secrets versions add ekbill-openai-api-key --data-file=- --project="$PROJECT" >/dev/null
unset key
echo "Stored. Restarting v2 so it picks the key up."
EKBILL_NO_BUILD=1 "$REPO_DIR/deploy/vm/up.sh"
