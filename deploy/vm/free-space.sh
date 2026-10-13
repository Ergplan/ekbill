#!/usr/bin/env bash
# Free disk space taken by EkBill's own leftovers, and nothing else.
#
# Each rebuild leaves the previous app image behind. This removes images of the v2 compose
# project (ekbill2) that no container uses, and, when asked with --mvp, the stopped MVP's
# dangling images (project ekbill) too. It never touches the tariff or fdre products' images,
# containers, volumes or build cache, never runs a system or volume prune, and never removes
# a volume (ekbill2_pgdata, ekbill_pgdata and tariff_pgdata are not images and are not touched).
# Nothing is removed unattended: every removal is printed, and the list is shown first.
#
#   cd ~/ekbill && deploy/vm/free-space.sh [--mvp]
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

say "Before"
df -h / | tail -1
docker system df

projects=("$COMPOSE_PROJECT")
[ "${1:-}" = "--mvp" ] && projects+=("ekbill")
in_use="$(docker ps -a --format '{{.Image}}' | sort -u)"
for project in "${projects[@]}"; do
  say "Images of project $project no container uses"
  old="$(docker image ls --filter "label=com.docker.compose.project=$project" --filter dangling=true -q | sort -u)"
  if [ -z "$old" ]; then echo "none"; continue; fi
  for id in $old; do
    if echo "$in_use" | grep -q "$id"; then continue; fi
    docker image rm "$id" >/dev/null && echo "removed $id"
  done
done

say "After"
df -h / | tail -1
echo
echo "Still short of space? 'docker system df' above shows what is large. The build cache and the"
echo "other projects' images are shared with the tariff product: ask its owner before clearing them."
