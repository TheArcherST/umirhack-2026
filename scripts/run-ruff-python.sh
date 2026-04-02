#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

RUFF_BIN="$ROOT_DIR/python/.venv/bin/ruff"

if [ ! -x "$RUFF_BIN" ]; then
    echo "ruff is not installed in python/.venv. Run 'cd python && uv sync' first." >&2
    exit 1
fi

if [ "$#" -eq 0 ]; then
    set -- python/src
fi

"$RUFF_BIN" check --fix "$@"
"$RUFF_BIN" format "$@"
"$RUFF_BIN" check "$@"
