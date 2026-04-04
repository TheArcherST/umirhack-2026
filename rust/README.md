# Rust Agent Workspace

This workspace contains the Rust implementation of the pull-based `hack_agent`.

## Layout

- `hack_agent/`: binary crate implementing agent registration, heartbeat, task polling, task execution, and result upload.

## Run

From the repository root:

```bash
cd rust
cargo run -p hack_agent
```

Environment variables match the current backend agent API:

- `HACK_AGENT_API_URL`
- `HACK_AGENT_BOOTSTRAP_TOKEN`
- `HACK_AGENT_STATE_PATH`
- `HACK_AGENT_POLL_INTERVAL_SECONDS`
- `HACK_AGENT_VERSION`

## Packaged Artifacts

Hosted onboarding now expects built agent artifacts under `artifacts/rust/hack-agent/`:

- `linux/amd64/hack-agent`
- `linux/arm64/hack-agent`
- `macos/amd64/hack-agent`
- `macos/arm64/hack-agent`
- `windows/amd64/hack-agent.exe`

Build them from the repository root with:

```bash
./scripts/build-agent-artifacts.sh
```

That script uses `cargo zigbuild` for Linux targets, a MinGW-backed Rust target for Windows, and native `cargo` builds for macOS when run on a Darwin host with the Apple Rust targets installed.

For Linux deployment hosts without a Rust toolchain, use:

```bash
make artifacts args="--clean --container-only"
```

That runs the compose-backed `tool-artifacts` container, which contains the Rust cross-build toolchain and rebuilds the published Linux and Windows artifacts from scratch, replacing the existing `artifacts/rust/hack-agent/` contents with the fresh output.

For production deploys on a Linux host that should keep any separately published macOS artifacts intact, use:

```bash
make artifacts
```

That refreshes only the Linux and Windows subdirectories under `artifacts/rust/hack-agent/`.
