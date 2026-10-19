#!/usr/bin/env bash
# What EkBill's settings and keys are on this VM, without printing a secret. Safe to run at any time.
#
#   deploy/vm/check-env.sh
#
# 1. .env: each name, set or empty (a key only as its length; a model name as written).
# 2. Secret Manager: whether each secret up.sh reads has a value.
# 3. The running app and worker: what actually reached them.
# 4. OpenAI, called from inside the app with its own key: does the key work, and does each model it is
#    told to use exist on that key. The key never leaves the container or reaches this terminal.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
set +e

# A name whose value is a secret: shown only as set or empty, with its length.
is_secret() {
  case "$1" in *KEY* | *SECRET* | *PASSWORD* | *TOKEN* | DATABASE_URL) return 0 ;; *) return 1 ;; esac
}

say ".env ($REPO_DIR/.env)"
if [ -f "$REPO_DIR/.env" ]; then
  echo "permissions: $(stat -c '%A' "$REPO_DIR/.env") (should be -rw-------)"
  if git -C "$REPO_DIR" ls-files --error-unmatch .env >/dev/null 2>&1; then
    echo "WARNING: .env is tracked by git; it must never be committed"
  else
    echo "not in git: good"
  fi
  while IFS= read -r line; do
    case "$line" in '' | \#*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    key="$(echo "$key" | tr -d ' ')"
    if [ -z "$value" ]; then
      printf '  %-28s %s\n' "$key" "(empty)"
    elif is_secret "$key"; then
      printf '  %-28s %s\n' "$key" "set (${#value} chars)"
    else
      printf '  %-28s %s\n' "$key" "$value"
    fi
  done < "$REPO_DIR/.env"
else
  echo "no .env: up.sh uses Secret Manager and defaults (paste 3 of docs/MASTER-PROMPT.md writes one)"
fi

say "Secret Manager (project ${PROJECT:-unknown})"
for s in ekbill-db-password ekbill-openai-api-key ekbill-gate-password; do
  n="$(secret "$s" | wc -c)"
  if [ "$n" -gt 0 ]; then echo "  $s: has a value"; else echo "  $s: missing, empty or not readable from this VM"; fi
done
echo "  (up.sh takes OPENAI_API_KEY from .env when set there, else from ekbill-openai-api-key)"

# Inside a running container: each name set or not; secrets only as their length.
inside() {
  local service="$1"
  shift
  if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx "$service"; then
    echo "  $service is not running (start it with deploy/vm/up.sh)"
    return
  fi
  "${COMPOSE[@]}" exec -T "$service" node -e '
    const secret = (k) => /KEY|SECRET|PASSWORD|TOKEN/.test(k) || k === "DATABASE_URL";
    for (const k of process.argv.slice(1)) {
      const v = process.env[k] || "";
      console.log("  " + k.padEnd(28) + (v ? (secret(k) ? "set (" + v.length + " chars)" : v) : "(not set)"));
    }' "$@"
}

say "What the running app has"
inside app AUTH_MODE SESSION_SECRET DATABASE_URL OPENAI_API_KEY OPENAI_BASE_URL OPENAI_TEXT_MODEL OPENAI_VISION_MODEL \
  OPENAI_REALTIME_MODEL OPENAI_REALTIME_VOICE OPENAI_TRANSCRIBE_MODEL OPENAI_EMBED_MODEL FIREBASE_PROJECT_ID \
  NEXT_PUBLIC_FIREBASE_API_KEY

say "What the running worker has (it reads photos and old bills)"
inside worker DATABASE_URL OPENAI_API_KEY OPENAI_VISION_MODEL OPENAI_EMBED_MODEL

say "OpenAI, asked from inside the app with its own key"
if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx app; then
  "${COMPOSE[@]}" exec -T app node -e '
    const key = process.env.OPENAI_API_KEY;
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
    const uses = {
      OPENAI_TEXT_MODEL: "Poocho answers, the contract helper",
      OPENAI_VISION_MODEL: "photo to bill, old bills",
      OPENAI_REALTIME_MODEL: "voice",
      OPENAI_TRANSCRIBE_MODEL: "the written copy of what is said (optional)",
      OPENAI_EMBED_MODEL: "Poocho search by meaning (optional)",
    };
    if (!key) {
      console.log("  no OPENAI_API_KEY in the app: photo reading, Poocho answers and voice stay off");
      process.exit(0);
    }
    (async () => {
      const r = await fetch(base + "/v1/models", { headers: { authorization: "Bearer " + key } });
      if (!r.ok) {
        console.log("  the key was REFUSED (HTTP " + r.status + "): check it in .env or ekbill-openai-api-key");
        return;
      }
      console.log("  the key works");
      const have = new Set(((await r.json()).data || []).map((m) => m.id));
      // Voice needs a model made for live audio: one that exists but is not (gpt-live-1, 19 Oct) opens a session
      // and is then refused when the phone connects ("Awaaz jud nahi paayi").
      const realtime = [...have].filter((id) => /realtime/.test(id)).sort();
      for (const [k, what] of Object.entries(uses)) {
        const m = (process.env[k] || "").trim();
        let verdict = !m ? "(not set)" : have.has(m) ? m + "  ok" : m + "  NOT FOUND on this key";
        if (k === "OPENAI_REALTIME_MODEL" && m && !/realtime/.test(m)) verdict = m + "  NOT A REALTIME MODEL";
        console.log("  " + k.padEnd(28) + verdict.padEnd(44) + what);
      }
      console.log("  realtime models on this key: " + (realtime.length ? realtime.join(", ") : "none"));
    })().catch((e) => console.log("  could not reach OpenAI: " + e.message));'
else
  echo "  the app is not running (start it with deploy/vm/up.sh)"
fi

say "The app's own health"
curl -fsS http://127.0.0.1:8080/api/health || echo "  /api/health did not answer"
echo
