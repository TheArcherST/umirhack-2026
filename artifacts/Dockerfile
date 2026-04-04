FROM rust:bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      clang \
      gcc-mingw-w64-x86-64 \
      lld \
      pkg-config \
      zig && \
    rm -rf /var/lib/apt/lists/*

RUN rustup target add \
      x86_64-unknown-linux-musl \
      aarch64-unknown-linux-musl \
      x86_64-pc-windows-gnu && \
    cargo install cargo-zigbuild --locked

WORKDIR /workspace
