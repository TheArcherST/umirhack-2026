#!/bin/sh

alembic "$@"
chown -R ${EXTERNAL_UID}:${EXTERNAL_GID} /usr/src/app/src/*/alembic
