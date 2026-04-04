#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "usage: $0 <git-revision>" >&2
    exit 1
fi

REVISION="$1"
REPO_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/hack-donstu-spring-2026-deploy.lock}"

exec 9>"$LOCK_FILE"
flock 9

cd "$REPO_DIR"
git fetch origin
git checkout --detach "$REVISION"

# Invoke make directly — no function wrapper, so bash has no stale in-memory
# commands from before the checkout above.
make up
