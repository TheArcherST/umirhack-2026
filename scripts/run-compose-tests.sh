#!/usr/bin/env sh
set -eu

docker compose stop rest-server-test >/dev/null 2>&1 || true
docker compose rm -f rest-server-test >/dev/null 2>&1 || true
docker compose --profile tests run --rm --build run-integration-tests "$@"
