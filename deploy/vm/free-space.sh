#!/usr/bin/env bash
# Free disk space taken by EkBill's own leftovers, and nothing else.
#
# Each rebuild leaves the previous app image behind. This removes images of the v2 compose
# project (ekbill2) that no container uses, and, when asked with --mvp, the stopped MVP's
# dangling images (project ekbill) too. It never touches the tariff or fdre products' images,
# containers, volumes or build cache, never runs a system or volume prune, and never removes
# a volume (ekbill2_pgdata, ekbill_pgdata and tariff_pgdata are not images and are not touched).
# Nothing is removed unattended: without --apply the script only lists what it would remove;
# with --apply it removes exactly that list and prints each id.
#
#   cd ~/ekbill && deploy/vm/free-space.sh [--mvp]           # list only
#   cd ~/ekbill && deploy/vm/free-space.sh [--mvp] --apply   # remove the listed images
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

say "Before"
df -h / | tail -1
docker system df

projects=("$COMPOSE_PROJECT")
apply=0
for arg in "$@"; do
  case "$arg" in
    --mvp) projects+=("ekbill") ;;
    --apply) apply=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
in_use="$(docker ps -a --format '{{.Image}}' | sort -u)"
for project in "${projects[@]}"; do
  say "Images of project $project no container uses"
  old="$(docker image ls --filter "label=com.docker.compose.project=$project" --filter dangling=true -q | sort -u)"
  if [ -z "$old" ]; then echo "none"; continue; fi
  for id in $old; do
    if echo "$in_use" | grep -q "$id"; then continue; fi
    if [ "$apply" = 1 ]; then
      docker image rm "$id" >/dev/null && echo "removed $id"
    else
      echo "would remove $id ($(docker image inspect --format '{{.Size}}' "$id" | awk '{printf "%.0f MB", $1/1048576}'))"
    fi
  done
done
[ "$apply" = 1 ] || echo "(nothing removed: run again with --apply to remove the images listed)"

say "After"
df -h / | tail -1
echo
echo "Still short of space? 'docker system df' above shows what is large. The build cache and the"
echo "other projects' images are shared with the tariff product: ask its owner before clearing them."
