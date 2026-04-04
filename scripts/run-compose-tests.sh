#!/usr/bin/env sh
set -eu

sh ./scripts/prepare-test-artifacts.sh

docker compose stop rest-server-test >/dev/null 2>&1 || true
docker compose rm -f rest-server-test >/dev/null 2>&1 || true
docker compose --profile tests up -d --build --wait --wait-timeout 60 rest-server-test

docker compose --profile tests run --rm --no-deps --build run-integration-tests "$@"
