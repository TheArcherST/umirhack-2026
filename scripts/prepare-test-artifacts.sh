#!/usr/bin/env sh
set -eu

AGENT_VERSION="$(sed -nE 's/^version = "([^"]+)"$/\1/p' rust/hack_agent/Cargo.toml | head -n 1)"
ARTIFACT_ROOT="artifacts/rust/hack-agent"
VERSION_DIR="$ARTIFACT_ROOT/$AGENT_VERSION"

mkdir -p "$VERSION_DIR"
for platform_dir in linux macos windows; do
  if [ -d "$ARTIFACT_ROOT/$platform_dir" ] && [ ! -d "$VERSION_DIR/$platform_dir" ]; then
    cp -R "$ARTIFACT_ROOT/$platform_dir" "$VERSION_DIR/$platform_dir"
  fi
done

cat > "$ARTIFACT_ROOT/manifest.json" <<EOF
{"current_version":"$AGENT_VERSION","versions":["$AGENT_VERSION"]}
EOF
