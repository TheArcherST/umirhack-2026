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

Hosted onboarding now expects built agent artifacts under `artifacts/hack-agent/`:

- `linux/amd64/hack-agent`
- `linux/arm64/hack-agent`
- `macos/amd64/hack-agent`
- `macos/arm64/hack-agent`
- `windows/amd64/hack-agent.exe`

Build them from the repository root with:

```bash
./scripts/build-agent-artifacts.sh
```

That script uses containerized cross-target builders for Linux and Windows, and native `cargo` builds for macOS when run on a Darwin host with the Apple Rust targets installed.
