#!/usr/bin/env sh
set -eu

copy_if_missing() {
    target="$1"
    template="$2"

    if [ ! -f "$target" ]; then
        cp "$template" "$target"
    fi
}

copy_if_missing .env .env.example
copy_if_missing python/.env python/.env.example
copy_if_missing nginx/default.conf nginx/default.conf.example
