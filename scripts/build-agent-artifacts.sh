#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/artifacts/hack-agent"
WORKSPACE_DIR="$ROOT_DIR/rust"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

build_target() {
  local image="$1"
  local target="$2"
  local output_dir="$3"
  local binary_name="$4"
  local output_name="$5"

  mkdir -p "$ARTIFACT_DIR/$output_dir"

  docker run --rm \
    -u "$(id -u):$(id -g)" \
    -v "$ROOT_DIR:/workspace" \
    -w /workspace/rust \
    "$image" \
    bash -lc "
      cargo build --release -p hack_agent --target $target &&
      cp target/$target/release/$binary_name /workspace/artifacts/hack-agent/$output_dir/$output_name
    "
}

build_native_target() {
  local target="$1"
  local output_dir="$2"
  local binary_name="$3"
  local output_name="$4"

  mkdir -p "$ARTIFACT_DIR/$output_dir"
  (
    cd "$WORKSPACE_DIR"
    cargo build --release -p hack_agent --target "$target"
  )
  cp \
    "$WORKSPACE_DIR/target/$target/release/$binary_name" \
    "$ARTIFACT_DIR/$output_dir/$output_name"
}

need_cmd docker

build_target \
  "ghcr.io/cross-rs/x86_64-unknown-linux-musl:main" \
  "x86_64-unknown-linux-musl" \
  "linux/amd64" \
  "hack_agent" \
  "hack-agent"

build_target \
  "ghcr.io/cross-rs/aarch64-unknown-linux-musl:main" \
  "aarch64-unknown-linux-musl" \
  "linux/arm64" \
  "hack_agent" \
  "hack-agent"

build_target \
  "ghcr.io/cross-rs/x86_64-pc-windows-gnu:main" \
  "x86_64-pc-windows-gnu" \
  "windows/amd64" \
  "hack_agent.exe" \
  "hack-agent.exe"

if [[ "$(uname -s)" == "Darwin" ]]; then
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

echo "Agent artifacts written to $ARTIFACT_DIR"
