from __future__ import annotations

from pathlib import Path
from typing import Literal


InstallPlatform = Literal["linux", "macos", "windows"]
ScriptKind = Literal["bash", "powershell"]

SUPPORTED_PLATFORM_LABELS = {
    "linux": "linux",
    "macos": "macos",
    "windows": "windows",
}

SUPPORTED_ARCHES = {
    "linux": {"amd64", "arm64"},
    "macos": {"amd64", "arm64"},
    "windows": {"amd64"},
}


def normalize_install_platform(value: str | None) -> InstallPlatform:
    lowered = (value or "").lower()
    if "win" in lowered:
        return "windows"
    if "mac" in lowered:
        return "macos"
    return "linux"


def parse_install_platform(value: str) -> InstallPlatform:
    lowered = value.lower()
    if lowered == "windows":
        return "windows"
    if lowered == "macos":
        return "macos"
    if lowered == "linux":
        return "linux"
    raise ValueError(f"Unsupported installer platform: {value!r}")


def script_kind_for_platform(platform: InstallPlatform) -> ScriptKind:
    if platform == "windows":
        return "powershell"
    return "bash"


def install_command_for_script(
    *,
    platform: InstallPlatform,
    script_url: str,
) -> str:
    if platform == "windows":
        return (
            "powershell -NoProfile -ExecutionPolicy Bypass "
            f'-Command "irm \'{script_url}\' | iex"'
        )
    return f"curl -fsSL '{script_url}' | sudo bash"


def artifact_relative_path(
    *,
    platform: InstallPlatform,
    arch: str,
) -> Path:
    if arch not in SUPPORTED_ARCHES[platform]:
        raise ValueError(f"Unsupported architecture {arch!r} for platform {platform!r}")
    filename = "hack-agent.exe" if platform == "windows" else "hack-agent"
    return Path(platform) / arch / filename


def render_install_script(
    *,
    platform: InstallPlatform,
    api_url: str,
    bootstrap_token: str,
    artifact_root_url: str,
) -> str:
    if platform == "windows":
        return _render_windows_install_script(
            api_url=api_url,
            bootstrap_token=bootstrap_token,
            artifact_root_url=artifact_root_url,
        )
    if platform == "macos":
        return _render_macos_install_script(
            api_url=api_url,
            bootstrap_token=bootstrap_token,
            artifact_root_url=artifact_root_url,
        )
    return _render_linux_install_script(
        api_url=api_url,
        bootstrap_token=bootstrap_token,
        artifact_root_url=artifact_root_url,
    )


def _render_linux_install_script(
    *,
    api_url: str,
    bootstrap_token: str,
    artifact_root_url: str,
) -> str:
    return f"""#!/usr/bin/env bash
set -euo pipefail

API_URL={_shell_quote(api_url)}
BOOTSTRAP_TOKEN={_shell_quote(bootstrap_token)}
ARTIFACT_ROOT_URL={_shell_quote(artifact_root_url)}
INSTALL_DIR=/usr/local/bin
BINARY_PATH="$INSTALL_DIR/hack-agent"
SERVICE_NAME=umirhack-agent
STATE_DIR=/var/lib/umirhack-agent
STATE_PATH="$STATE_DIR/state.json"
ENV_FILE=/etc/umirhack-agent.env
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

need_cmd() {{
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}}

download_file() {{
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi
  echo "curl or wget is required to download the agent binary" >&2
  exit 1
}}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer with root privileges." >&2
  exit 1
fi

need_cmd install
need_cmd mktemp
need_cmd systemctl

arch="$(uname -m)"
case "$arch" in
  x86_64|amd64)
    arch=amd64
    ;;
  aarch64|arm64)
    arch=arm64
    ;;
  *)
    echo "Unsupported CPU architecture: $arch" >&2
    exit 1
    ;;
esac

tmp_binary="$(mktemp)"
download_file "$ARTIFACT_ROOT_URL/linux/$arch/hack-agent" "$tmp_binary"
install -d "$INSTALL_DIR" "$STATE_DIR"
install -m 0755 "$tmp_binary" "$BINARY_PATH"
rm -f "$tmp_binary"

cat > "$ENV_FILE" <<EOF
HACK_AGENT_API_URL=$API_URL
HACK_AGENT_BOOTSTRAP_TOKEN=$BOOTSTRAP_TOKEN
HACK_AGENT_STATE_PATH=$STATE_PATH
HACK_AGENT_VERSION=rust-agent/1
EOF

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Umirhack Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=$ENV_FILE
ExecStart=$BINARY_PATH
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
echo "Installed $SERVICE_NAME and started the Rust agent."
"""


def _render_windows_install_script(
    *,
    api_url: str,
    bootstrap_token: str,
    artifact_root_url: str,
) -> str:
    return f"""$ErrorActionPreference = "Stop"

$apiUrl = {_powershell_quote(api_url)}
$bootstrapToken = {_powershell_quote(bootstrap_token)}
$artifactRootUrl = {_powershell_quote(artifact_root_url)}
$installDir = Join-Path $env:ProgramFiles "Umirhack"
$stateDir = Join-Path $env:ProgramData "Umirhack"
$binaryPath = Join-Path $installDir "hack-agent.exe"
$runnerPath = Join-Path $installDir "run-agent.ps1"
$taskName = "UmirhackAgent"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {{
    throw "Run this installer from an elevated PowerShell session."
}}

$archValue = $env:PROCESSOR_ARCHITECTURE.ToLowerInvariant()
switch ($archValue) {{
    "amd64" {{ $arch = "amd64" }}
    "x86" {{ $arch = "amd64" }}
    default {{ throw "Unsupported CPU architecture: $archValue" }}
}}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$downloadUrl = "$artifactRootUrl/windows/$arch/hack-agent.exe"
Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $binaryPath

$runner = @"
$env:HACK_AGENT_API_URL = '$apiUrl'
$env:HACK_AGENT_BOOTSTRAP_TOKEN = '$bootstrapToken'
$env:HACK_AGENT_STATE_PATH = '$stateDir\\state.json'
$env:HACK_AGENT_VERSION = 'rust-agent/1'
& '$binaryPath'
"@
$runner | Set-Content -Path $runnerPath -Encoding ASCII

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principalTask = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principalTask -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "Installed $taskName and started the Rust agent."
"""


def _render_macos_install_script(
    *,
    api_url: str,
    bootstrap_token: str,
    artifact_root_url: str,
) -> str:
    return f"""#!/usr/bin/env bash
set -euo pipefail

API_URL={_shell_quote(api_url)}
BOOTSTRAP_TOKEN={_shell_quote(bootstrap_token)}
ARTIFACT_ROOT_URL={_shell_quote(artifact_root_url)}
INSTALL_DIR=/usr/local/bin
LIBEXEC_DIR=/usr/local/libexec/umirhack-agent
BINARY_PATH="$INSTALL_DIR/hack-agent"
RUNNER_PATH="$LIBEXEC_DIR/run-agent.sh"
STATE_DIR="/Library/Application Support/UmirhackAgent"
STATE_PATH="$STATE_DIR/state.json"
PLIST_ID=com.umirhack.agent
PLIST_FILE="/Library/LaunchDaemons/$PLIST_ID.plist"
STDOUT_LOG=/var/log/umirhack-agent.log
STDERR_LOG=/var/log/umirhack-agent.err.log

need_cmd() {{
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}}

download_file() {{
  local url="$1"
  local output="$2"
  curl -fsSL "$url" -o "$output"
}}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer with root privileges." >&2
  exit 1
fi

need_cmd curl
need_cmd install
need_cmd launchctl
need_cmd mktemp

arch="$(uname -m)"
case "$arch" in
  x86_64|amd64)
    arch=amd64
    ;;
  arm64|aarch64)
    arch=arm64
    ;;
  *)
    echo "Unsupported CPU architecture: $arch" >&2
    exit 1
    ;;
esac

tmp_binary="$(mktemp)"
download_file "$ARTIFACT_ROOT_URL/macos/$arch/hack-agent" "$tmp_binary"
install -d "$INSTALL_DIR" "$LIBEXEC_DIR" "$STATE_DIR"
install -m 0755 "$tmp_binary" "$BINARY_PATH"
rm -f "$tmp_binary"

cat > "$RUNNER_PATH" <<EOF
#!/bin/sh
export HACK_AGENT_API_URL={_shell_quote(api_url)}
export HACK_AGENT_BOOTSTRAP_TOKEN={_shell_quote(bootstrap_token)}
export HACK_AGENT_STATE_PATH={_shell_quote("/Library/Application Support/UmirhackAgent/state.json")}
export HACK_AGENT_VERSION='rust-agent/1'
exec {_shell_quote("/usr/local/bin/hack-agent")}
EOF
chmod 0755 "$RUNNER_PATH"

cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_ID</string>
  <key>ProgramArguments</key>
  <array>
    <string>$RUNNER_PATH</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$STATE_DIR</string>
  <key>StandardOutPath</key>
  <string>$STDOUT_LOG</string>
  <key>StandardErrorPath</key>
  <string>$STDERR_LOG</string>
</dict>
</plist>
EOF
chmod 0644 "$PLIST_FILE"

launchctl bootout system "$PLIST_FILE" >/dev/null 2>&1 || true
launchctl bootstrap system "$PLIST_FILE"
launchctl enable "system/$PLIST_ID" >/dev/null 2>&1 || true
launchctl kickstart -k "system/$PLIST_ID"
echo "Installed $PLIST_ID and started the Rust agent."
"""


def _shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def _powershell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
