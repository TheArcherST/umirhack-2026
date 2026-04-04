#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/artifacts/rust/hack-agent"
WORKSPACE_DIR="$ROOT_DIR/rust"
mkdir -p "$ROOT_DIR/artifacts/.tmp"
TMP_ARTIFACT_DIR="$(mktemp -d "$ROOT_DIR/artifacts/.tmp/hack-agent-artifacts.XXXXXX")"
CLEAN_OUTPUT=0
CONTAINER_ONLY=0

cleanup() {
  rm -rf "$TMP_ARTIFACT_DIR"
}

usage() {
  cat <<'EOF'
usage: ./scripts/build-agent-artifacts.sh [--clean] [--container-only]

  --clean           Replace the published artifact directory with the freshly built set.
  --container-only  Build only the Linux and Windows targets supported by the tool container.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --clean)
      CLEAN_OUTPUT=1
      ;;
    --container-only)
      CONTAINER_ONLY=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

trap cleanup EXIT

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

prepare_output_dir() {
  local output_dir="$1"

  mkdir -p "$TMP_ARTIFACT_DIR/$output_dir"
}

ensure_rust_target() {
  local target="$1"

  rustup target add "$target" >/dev/null
}

build_linux_target() {
  local target="$1"
  local output_dir="$2"
  local output_name="$3"

  prepare_output_dir "$output_dir"
  ensure_rust_target "$target"
  (
    cd "$WORKSPACE_DIR"
    cargo zigbuild --release -p hack_agent --target "$target"
  )
  cp \
    "$WORKSPACE_DIR/target/$target/release/hack_agent" \
    "$TMP_ARTIFACT_DIR/$output_dir/$output_name"
}

build_windows_target() {
  local target="$1"
  local output_dir="$2"
  local output_name="$3"

  prepare_output_dir "$output_dir"
  ensure_rust_target "$target"
  (
    cd "$WORKSPACE_DIR"
    cargo build --release -p hack_agent --target "$target"
  )
  cp \
    "$WORKSPACE_DIR/target/$target/release/hack_agent.exe" \
    "$TMP_ARTIFACT_DIR/$output_dir/$output_name"
}

build_native_target() {
  local target="$1"
  local output_dir="$2"
  local binary_name="$3"
  local output_name="$4"

  prepare_output_dir "$output_dir"
  (
    cd "$WORKSPACE_DIR"
    cargo build --release -p hack_agent --target "$target"
  )
  cp \
    "$WORKSPACE_DIR/target/$target/release/$binary_name" \
    "$TMP_ARTIFACT_DIR/$output_dir/$output_name"
}

publish_artifacts() {
  mkdir -p "$(dirname "$ARTIFACT_DIR")"

  if [ "$CLEAN_OUTPUT" -eq 1 ]; then
    rm -rf "$ARTIFACT_DIR"
  else
    mkdir -p "$ARTIFACT_DIR"
    for target_path in "$TMP_ARTIFACT_DIR"/*; do
      [ -e "$target_path" ] || continue
      rm -rf "$ARTIFACT_DIR/$(basename "$target_path")"
    done
  fi

  mkdir -p "$ARTIFACT_DIR"
  cp -R "$TMP_ARTIFACT_DIR"/. "$ARTIFACT_DIR"/
}

need_cmd cargo
need_cmd rustup
need_cmd cargo-zigbuild

build_linux_target \
  "x86_64-unknown-linux-musl" \
  "linux/amd64" \
  "hack-agent"

build_linux_target \
  "aarch64-unknown-linux-musl" \
  "linux/arm64" \
  "hack-agent"

build_windows_target \
  "x86_64-pc-windows-gnu" \
  "windows/amd64" \
  "hack-agent.exe"

if [[ "$CONTAINER_ONLY" -eq 1 ]]; then
  echo "Skipping macOS artifacts in container-only mode."
elif [[ "$(uname -s)" == "Darwin" ]]; then
  need_cmd cargo
  need_cmd rustup

  for target in aarch64-apple-darwin x86_64-apple-darwin; do
    if ! rustup target list --installed | grep -qx "$target"; then
      echo "Rust target $target is not installed. Run: rustup target add $target" >&2
      exit 1
    fi
  done

  build_native_target \
    "aarch64-apple-darwin" \
    "macos/arm64" \
    "hack_agent" \
    "hack-agent"

  build_native_target \
    "x86_64-apple-darwin" \
    "macos/amd64" \
    "hack_agent" \
    "hack-agent"
else
  echo "Skipping macOS artifacts on non-Darwin host."
  echo "Run this script on macOS with Rust targets installed to publish Darwin builds."
fi

publish_artifacts

echo "Agent artifacts written to $ARTIFACT_DIR"
