FROM rust:bookworm

ARG ZIG_VERSION=0.13.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      clang \
      curl \
      gcc-mingw-w64-x86-64 \
      lld \
      pkg-config \
      xz-utils && \
    rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) zig_arch='x86_64' ;; \
      arm64) zig_arch='aarch64' ;; \
      *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://ziglang.org/download/${ZIG_VERSION}/zig-linux-${zig_arch}-${ZIG_VERSION}.tar.xz" -o /tmp/zig.tar.xz; \
    tar -xJf /tmp/zig.tar.xz -C /opt; \
    ln -s "/opt/zig-linux-${zig_arch}-${ZIG_VERSION}/zig" /usr/local/bin/zig; \
    rm -f /tmp/zig.tar.xz

RUN rustup target add \
      x86_64-unknown-linux-musl \
      aarch64-unknown-linux-musl \
      x86_64-pc-windows-gnu && \
    cargo install cargo-zigbuild --locked

# Pre-fetch crate sources — cached in this layer, only invalidated when Cargo.lock changes.
# At container runtime crates are already on disk, no index update or download needed.
COPY rust/Cargo.toml rust/Cargo.lock /tmp/prefetch/
COPY rust/hack_agent/Cargo.toml /tmp/prefetch/hack_agent/
RUN mkdir -p /tmp/prefetch/hack_agent/src \
    && echo 'fn main() {}' > /tmp/prefetch/hack_agent/src/main.rs \
    && cd /tmp/prefetch \
    && cargo fetch --locked \
    && rm -rf /tmp/prefetch

WORKDIR /workspace
