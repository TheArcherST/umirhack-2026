#!/usr/bin/env sh
set -eu

python prepare_test_db.py
alembic upgrade head
pytest "$@"
