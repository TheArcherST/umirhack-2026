#!/usr/bin/env sh
set -eu

copy_if_missing() {
    target="$1"
    template="$2"

    if [ ! -f "$target" ]; then
        mkdir -p "$(dirname "$target")"
        cp "$template" "$target"
    fi
}

merge_missing_env_vars() {
    target="$1"
    template="$2"

    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            "" | \#*)
                continue
                ;;
        esac

        key="${line%%=*}"
        if ! grep -q "^${key}=" "$target"; then
            printf '%s\n' "$line" >>"$target"
        fi
    done <"$template"
}

upsert_env_var() {
    file="$1"
    key="$2"
    value="$3"
    tmp_file="$(mktemp)"

    if grep -q "^${key}=" "$file"; then
        awk -v key="$key" -v value="$value" '
            BEGIN { prefix = key "=" }
            index($0, prefix) == 1 { print prefix value; next }
            { print }
        ' "$file" >"$tmp_file"
    else
        cat "$file" >"$tmp_file"
        printf '%s=%s\n' "$key" "$value" >>"$tmp_file"
    fi

    mv "$tmp_file" "$file"
}

require_file() {
    path="$1"
    if [ ! -f "$path" ]; then
        echo "Missing required config file: $path" >&2
        exit 1
    fi
}

require_env_var() {
    file="$1"
    key="$2"
    if ! grep -q "^${key}=" "$file"; then
        echo "Missing required setting ${key} in ${file}" >&2
        exit 1
    fi
}

copy_if_missing .env .env.example
copy_if_missing python/.env python/.env.example
copy_if_missing nginx/default.conf nginx/default.conf.example

merge_missing_env_vars .env .env.example
merge_missing_env_vars python/.env python/.env.example

current_uid="$(id -u)"
current_gid="$(id -g)"

upsert_env_var .env COMPOSE__UID "$current_uid"
upsert_env_var .env COMPOSE__GID "$current_gid"

upsert_env_var python/.env HACK__EMAIL__RESEND_API_KEY "ci-test-key"
upsert_env_var python/.env HACK__EMAIL__FROM_ADDRESS "ci@example.invalid"
upsert_env_var python/.env HACK__EMAIL__TEMPLATE_NAME "ci-email-verification"
upsert_env_var python/.env HACK__EMAIL__APP_NAME "Umirhack CI"

require_file .env
require_file python/.env
require_file nginx/default.conf

for key in \
    COMPOSE__POSTGRES__HOST \
    COMPOSE__POSTGRES__PORT \
    COMPOSE__POSTGRES__USER \
    COMPOSE__POSTGRES__PASSWORD \
    COMPOSE__POSTGRES__DATABASE \
    COMPOSE__REDIS__HOST \
    COMPOSE__REDIS__PORT \
    COMPOSE__NGINX__HTTP_HOST \
    COMPOSE__NGINX__HTTP_PORT \
    COMPOSE__NGINX__HTTPS_HOST \
    COMPOSE__NGINX__HTTPS_PORT \
    COMPOSE__UID \
    COMPOSE__GID
do
    require_env_var .env "$key"
done

for key in \
    HACK__POSTGRES__HOST \
    HACK__POSTGRES__PORT \
    HACK__POSTGRES__USER \
    HACK__POSTGRES__PASSWORD \
    HACK__POSTGRES__DATABASE \
    HACK__POSTGRES__TEST_DATABASE \
    HACK__REDIS__HOST \
    HACK__REDIS__PORT \
    HACK__REDIS__DB \
    HACK__SERVER__ROOT_PATH \
    HACK__EMAIL__RESEND_API_KEY \
    HACK__EMAIL__FROM_ADDRESS \
    HACK__EMAIL__TEMPLATE_NAME \
    HACK__EMAIL__APP_NAME \
    HACK__EMAIL__CODE_VALIDITY_MINUTES \
    HACK__EMAIL__CODE_LENGTH \
    HACK__EMAIL__RESEND_COOLDOWN_SECONDS \
    HACK__EMAIL__MAX_VERIFICATION_ATTEMPTS
do
    require_env_var python/.env "$key"
done
