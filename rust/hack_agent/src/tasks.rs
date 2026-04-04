use std::collections::BTreeSet;
use std::net::ToSocketAddrs;
use std::path::{Path, PathBuf};
use std::process::{Command as StdCommand, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sysinfo::System;
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::time::{Instant, timeout};
use url::Url;

use crate::config::Config;
use crate::models::{AgentTaskLease, CompletePayload};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const SAFE_MODE_CUSTOM_TASK_ERROR: &str =
    "Safe-installed agent is not allowed to execute arbitrary command tasks.";
const LINUX_SERVICE_NAME: &str = "umirhack-agent";
const MACOS_PLIST_ID: &str = "com.umirhack.agent";
const WINDOWS_TASK_NAME: &str = "UmirhackAgent";

#[derive(Debug)]
pub struct TaskExecutionOutcome {
    pub result: CompletePayload,
    pub post_action: Option<PostTaskAction>,
}

#[derive(Debug)]
pub struct PostTaskAction {
    launcher_path: PathBuf,
    download_url: String,
    from_version: String,
    target_version: String,
}

#[derive(Debug, Default, Deserialize)]
struct SelfUpdatePayload {
    artifact_url: Option<String>,
    from_version: Option<String>,
    version: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
struct ServiceTelemetryEntry {
    name: String,
    status: String,
    display_name: Option<String>,
    description: Option<String>,
    load_state: Option<String>,
    active_state: Option<String>,
    sub_state: Option<String>,
}

pub async fn execute_task(
    task: &AgentTaskLease,
    config: &Config,
) -> TaskExecutionOutcome {
    match execute_task_inner(task, config).await {
        Ok(outcome) => outcome,
        Err(error) => TaskExecutionOutcome {
            result: failure_result(task, error.to_string()),
            post_action: None,
        },
    }
}

async fn execute_task_inner(
    task: &AgentTaskLease,
    config: &Config,
) -> Result<TaskExecutionOutcome> {
    let template = &task.task_template;
    let kind = template.kind.as_str();
    let payload = &template.payload_json;

    match kind {
        "host.system_profile" => {
            let telemetry = collect_system_profile();
            Ok(success_outcome(task, kind, telemetry))
        }
        "host.ip_interfaces" => {
            let telemetry = collect_interfaces().await?;
            Ok(success_outcome(task, kind, telemetry))
        }
        "network.endpoint_connectivity" => {
            let target = payload
                .get("target_endpoint")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow!("missing target endpoint"))?;
            let telemetry = collect_endpoint_connectivity(target).await;
            Ok(success_outcome(task, kind, telemetry))
        }
        "agent.self_update" => {
            let post_action = prepare_self_update(config, payload).await?;
            Ok(TaskExecutionOutcome {
                result: self_update_result(task, &post_action),
                post_action: Some(post_action),
            })
        }
        "diagnostic.command.custom" => {
            if config.safe_mode {
                return Ok(TaskExecutionOutcome {
                    result: forbidden_custom_command_result(task),
                    post_action: None,
                });
            }
            let command = payload
                .get("approved_command")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|command| !command.is_empty())
                .ok_or_else(|| anyhow!("missing approved command"))?;
            Ok(TaskExecutionOutcome {
                result: command_result(task, kind, command).await,
                post_action: None,
            })
        }
        kind if kind.starts_with("diagnostic.command.") => {
            let requested_command = template
                .approved_command
                .as_deref()
                .or_else(|| payload.get("approved_command").and_then(Value::as_str));
            let command = resolve_command_for_kind(kind, requested_command)?;
            Ok(TaskExecutionOutcome {
                result: command_result(task, kind, command).await,
                post_action: None,
            })
        }
        _ => Ok(TaskExecutionOutcome {
            result: failure_result(task, format!("Unsupported task kind: {kind}")),
            post_action: None,
        }),
    }
}

pub fn declared_os() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        _ => "linux",
    }
}

fn success_result(
    task: &AgentTaskLease,
    telemetry_kind: &str,
    telemetry_payload: Value,
) -> CompletePayload {
    CompletePayload {
        lease_token: task.lease_token.clone(),
        status: "succeeded".to_string(),
        exit_code: Some(0),
        stdout_text: Some(pretty_json(&telemetry_payload)),
        stderr_text: Some(String::new()),
        summary_json: Some(json!({ "telemetry_kind": telemetry_kind })),
        telemetry_kind: Some(telemetry_kind.to_string()),
        telemetry_payload: Some(telemetry_payload),
        failure_reason: None,
    }
}

fn success_outcome(
    task: &AgentTaskLease,
    telemetry_kind: &str,
    telemetry_payload: Value,
) -> TaskExecutionOutcome {
    TaskExecutionOutcome {
        result: success_result(task, telemetry_kind, telemetry_payload),
        post_action: None,
    }
}

fn failure_result(task: &AgentTaskLease, reason: String) -> CompletePayload {
    CompletePayload {
        lease_token: task.lease_token.clone(),
        status: "failed".to_string(),
        exit_code: Some(1),
        stdout_text: Some(String::new()),
        stderr_text: Some(reason.clone()),
        summary_json: Some(json!({ "error": reason })),
        telemetry_kind: None,
        telemetry_payload: None,
        failure_reason: Some(reason),
    }
}

fn self_update_result(
    task: &AgentTaskLease,
    post_action: &PostTaskAction,
) -> CompletePayload {
    let summary_json = json!({
        "action": "self_update",
        "artifact_url": post_action.download_url,
        "from_version": post_action.from_version,
        "to_version": post_action.target_version,
        "version": post_action.target_version,
    });
    CompletePayload {
        lease_token: task.lease_token.clone(),
        status: "succeeded".to_string(),
        exit_code: Some(0),
        stdout_text: Some(pretty_json(&summary_json)),
        stderr_text: Some(String::new()),
        summary_json: Some(summary_json),
        telemetry_kind: None,
        telemetry_payload: None,
        failure_reason: None,
    }
}

fn forbidden_custom_command_result(task: &AgentTaskLease) -> CompletePayload {
    CompletePayload {
        lease_token: task.lease_token.clone(),
        status: "failed".to_string(),
        exit_code: Some(126),
        stdout_text: Some(String::new()),
        stderr_text: Some(SAFE_MODE_CUSTOM_TASK_ERROR.to_string()),
        summary_json: Some(json!({
            "code": "safe_mode_rejected",
            "error": SAFE_MODE_CUSTOM_TASK_ERROR,
        })),
        telemetry_kind: None,
        telemetry_payload: None,
        failure_reason: Some(SAFE_MODE_CUSTOM_TASK_ERROR.to_string()),
    }
}

async fn command_result(
    task: &AgentTaskLease,
    kind: &str,
    command: &str,
) -> CompletePayload {
    let result = run_command(command).await;
    let telemetry_payload =
        build_command_telemetry_payload(kind, command, &result.stdout);
    let stdout_text = if renders_structured_stdout(kind) {
        pretty_json(&telemetry_payload)
    } else {
        result.stdout.clone()
    };
    CompletePayload {
        lease_token: task.lease_token.clone(),
        status: if result.exit_code == 0 {
            "succeeded".to_string()
        } else {
            "failed".to_string()
        },
        exit_code: Some(result.exit_code),
        stdout_text: Some(stdout_text),
        stderr_text: Some(result.stderr.clone()),
        summary_json: Some(json!({ "command": command })),
        telemetry_kind: Some(kind.to_string()),
        telemetry_payload: Some(telemetry_payload),
        failure_reason: if result.exit_code == 0 {
            None
        } else {
            Some("Command exited with error".to_string())
        },
    }
}

fn collect_system_profile() -> Value {
    let mut system = System::new_all();
    system.refresh_all();

    let hostname = System::host_name().unwrap_or_else(hostname_fallback);
    let os_name = System::name().unwrap_or_else(|| declared_os().to_string());
    let platform_version =
        System::os_version().unwrap_or_else(|| "unknown".to_string());
    let kernel = System::kernel_version().unwrap_or_else(|| "unknown".to_string());
    let cpu_model = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().to_string())
        .filter(|brand| !brand.trim().is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    let cpu_cores = system.cpus().len() as u64;
    let memory_total_mb = system.total_memory() / (1024 * 1024);

    json!({
        "hostname": hostname,
        "os_name": os_name,
        "platform_version": platform_version,
        "kernel": kernel,
        "cpu_model": cpu_model,
        "cpu_cores": cpu_cores,
        "memory_total_mb": memory_total_mb,
    })
}

async fn collect_interfaces() -> Result<Value> {
    if let Ok(ip_cmd) = which::which("ip") {
        let output = Command::new(ip_cmd)
            .arg("-j")
            .arg("addr")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .context("failed to execute ip -j addr")?;
        if output.status.success() {
            let payload: Vec<IpInterfaceRaw> = serde_json::from_slice(&output.stdout)
                .context("failed to parse ip -j addr output")?;
            let interfaces = payload
                .into_iter()
                .map(|item| NetworkInterfaceTelemetry::from(item))
                .collect::<Vec<_>>();
            return Ok(json!({ "interfaces": interfaces }));
        }
    }

    if let Ok(ifconfig_cmd) = which::which("ifconfig") {
        let output = Command::new(ifconfig_cmd)
            .arg("-a")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .context("failed to execute ifconfig -a")?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let interfaces = parse_ifconfig_interfaces(&stdout);
            if !interfaces.is_empty() {
                return Ok(json!({ "interfaces": interfaces }));
            }
        }
    }

    let hostname = hostname_fallback();
    let ips = (hostname.as_str(), 0)
        .to_socket_addrs()
        .map(|iter| {
            iter.map(|addr| addr.ip().to_string())
                .collect::<BTreeSet<_>>()
        })
        .unwrap_or_default();

    let mut ipv4 = Vec::new();
    let mut ipv6 = Vec::new();
    for ip in ips {
        if ip.contains(':') {
            ipv6.push(ip);
        } else {
            ipv4.push(ip);
        }
    }

    Ok(json!({
        "interfaces": [
            {
                "name": "default",
                "mac": Value::Null,
                "ipv4": ipv4,
                "ipv6": ipv6,
            }
        ]
    }))
}

async fn collect_endpoint_connectivity(target: &str) -> Value {
    let parsed = Url::parse(target)
        .or_else(|_| Url::parse(&format!("tcp://{target}")))
        .ok();
    let host = parsed
        .as_ref()
        .and_then(Url::host_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| target.to_string());
    let port = parsed
        .as_ref()
        .and_then(Url::port)
        .unwrap_or_else(|| match parsed.as_ref().map(Url::scheme) {
            Some("https") | Some("tcp") => 443,
            _ => 80,
        });

    let started = Instant::now();
    let connect_target = format!("{host}:{port}");
    let (success, error) = match timeout(CONNECT_TIMEOUT, TcpStream::connect(connect_target)).await {
        Ok(Ok(_stream)) => (true, None),
        Ok(Err(err)) => (false, Some(err.to_string())),
        Err(_) => (false, Some("connection timed out".to_string())),
    };

    json!({
        "target_endpoint": target,
        "success": success,
        "latency_ms": (started.elapsed().as_secs_f64() * 1000.0 * 100.0).round() / 100.0,
        "error": error,
    })
}

async fn run_command(command: &str) -> CommandOutput {
    let mut process = if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg(command);
        cmd
    } else {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg(command);
        cmd
    };
    process.stdout(Stdio::piped()).stderr(Stdio::piped());

    match timeout(COMMAND_TIMEOUT, process.output()).await {
        Ok(Ok(output)) => CommandOutput {
            exit_code: output.status.code().unwrap_or(1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        },
        Ok(Err(err)) => CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: err.to_string(),
        },
        Err(_) => CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "command timed out".to_string(),
        },
    }
}

fn pretty_json(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

fn build_command_telemetry_payload(
    kind: &str,
    command: &str,
    stdout: &str,
) -> Value {
    match kind {
        "diagnostic.command.service_status" => json!({
            "command": command,
            "sample": stdout,
            "services": parse_service_status_output(stdout),
        }),
        _ => json!({
            "sample": stdout,
            "command": command,
        }),
    }
}

fn renders_structured_stdout(kind: &str) -> bool {
    matches!(kind, "diagnostic.command.service_status")
}

fn parse_service_status_output(stdout: &str) -> Vec<ServiceTelemetryEntry> {
    match std::env::consts::OS {
        "windows" => parse_windows_service_status(stdout),
        "macos" => parse_macos_service_status(stdout),
        _ => parse_linux_service_status(stdout),
    }
}

fn parse_linux_service_status(stdout: &str) -> Vec<ServiceTelemetryEntry> {
    stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("UNIT ")
                || trimmed.starts_with("LOAD ")
                || trimmed.starts_with("Legend:")
                || !trimmed.contains(".service")
            {
                return None;
            }

            let parts = trimmed.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 4 || !parts[0].ends_with(".service") {
                return None;
            }

            let description = parts
                .get(4..)
                .unwrap_or(&[])
                .join(" ")
                .trim()
                .to_string();
            let active_state = parts[2];
            let sub_state = parts[3];

            Some(ServiceTelemetryEntry {
                name: parts[0].to_string(),
                status: normalized_service_status(active_state, sub_state),
                display_name: None,
                description: if description.is_empty() {
                    None
                } else {
                    Some(description)
                },
                load_state: Some(parts[1].to_string()),
                active_state: Some(active_state.to_string()),
                sub_state: Some(sub_state.to_string()),
            })
        })
        .collect()
}

fn parse_macos_service_status(stdout: &str) -> Vec<ServiceTelemetryEntry> {
    stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("PID") {
                return None;
            }

            let parts = trimmed.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 3 {
                return None;
            }

            let pid = parts[0];
            let last_exit_status = parts[1];
            let name = parts[2..].join(" ");
            let sub_state = if pid == "-" { "stopped" } else { "running" };

            Some(ServiceTelemetryEntry {
                name,
                status: normalized_service_status("loaded", sub_state),
                display_name: None,
                description: Some(format!("last_exit_status={last_exit_status}")),
                load_state: Some("loaded".to_string()),
                active_state: Some("loaded".to_string()),
                sub_state: Some(sub_state.to_string()),
            })
        })
        .collect()
}

fn parse_windows_service_status(stdout: &str) -> Vec<ServiceTelemetryEntry> {
    let mut services = Vec::new();
    let mut current_name: Option<String> = None;
    let mut current_state: Option<String> = None;

    let push_current = |services: &mut Vec<ServiceTelemetryEntry>,
                        current_name: &mut Option<String>,
                        current_state: &mut Option<String>| {
        let Some(name) = current_name.take() else {
            return;
        };
        let raw_state = current_state.take().unwrap_or_else(|| "UNKNOWN".to_string());
        let sub_state = raw_state.to_ascii_lowercase();
        services.push(ServiceTelemetryEntry {
            name,
            status: normalized_service_status("loaded", &sub_state),
            display_name: None,
            description: None,
            load_state: Some("loaded".to_string()),
            active_state: Some(raw_state),
            sub_state: Some(sub_state),
        });
    };

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(name) = trimmed.strip_prefix("SERVICE_NAME:") {
            push_current(&mut services, &mut current_name, &mut current_state);
            current_name = Some(name.trim().to_string());
            continue;
        }

        if trimmed.starts_with("STATE")
            && let Some((_, raw_state)) = trimmed.split_once(':')
        {
            let parts = raw_state.split_whitespace().collect::<Vec<_>>();
            if let Some(state_name) = parts.get(1).or(parts.first()) {
                current_state = Some((*state_name).to_string());
            }
        }
    }

    push_current(&mut services, &mut current_name, &mut current_state);
    services
}

fn normalized_service_status(active_state: &str, sub_state: &str) -> String {
    let active = active_state.to_ascii_lowercase();
    let sub = sub_state.to_ascii_lowercase();
    if active == "active"
        || sub == "running"
        || sub == "listening"
        || sub == "start_pending"
    {
        "running".to_string()
    } else {
        "stopped".to_string()
    }
}

fn resolve_command_for_kind<'a>(
    kind: &str,
    requested_command: Option<&'a str>,
) -> Result<&'static str> {
    if let Some(requested_command) = requested_command {
        let allowed = allowed_commands_for_kind(kind);
        if !allowed.contains(&requested_command) {
            return Err(anyhow!("Command is not approved for task kind: {kind}"));
        }
    }
    command_for_kind(kind)
        .ok_or_else(|| anyhow!("Unsupported diagnostic task kind: {kind}"))
}

fn command_for_kind(kind: &str) -> Option<&'static str> {
    match (std::env::consts::OS, kind) {
        ("windows", "diagnostic.command.port_scan") => Some("netstat -ano"),
        ("windows", "diagnostic.command.disk_usage") => {
            Some("wmic logicaldisk get caption,freespace,size")
        }
        ("windows", "diagnostic.command.memory_cpu") => {
            Some("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize,LastBootUpTime /Value & wmic cpu get loadpercentage,name")
        }
        ("windows", "diagnostic.command.service_status") => {
            Some("sc query type= service state= all")
        }
        ("windows", "diagnostic.command.system_logs") => {
            Some("wevtutil qe System /c:100 /f:text")
        }
        ("macos", "diagnostic.command.port_scan") => {
            Some("lsof -nP -iTCP -sTCP:LISTEN")
        }
        ("macos", "diagnostic.command.disk_usage") => Some("df -h"),
        ("macos", "diagnostic.command.memory_cpu") => {
            Some("vm_stat && sysctl -n hw.memsize && uptime")
        }
        ("macos", "diagnostic.command.service_status") => Some("launchctl list"),
        ("macos", "diagnostic.command.system_logs") => {
            Some("log show --style compact --last 1h | tail -n 100")
        }
        (_, "diagnostic.command.port_scan") => Some("ss -tulpn"),
        (_, "diagnostic.command.disk_usage") => Some("df -h"),
        (_, "diagnostic.command.memory_cpu") => Some("uptime && free -m"),
        (_, "diagnostic.command.service_status") => {
            Some("systemctl list-units --type=service --state=running --no-pager")
        }
        (_, "diagnostic.command.system_logs") => {
            Some("journalctl -n 100 --no-pager")
        }
        _ => None,
    }
}

fn allowed_commands_for_kind(kind: &str) -> &'static [&'static str] {
    match kind {
        "diagnostic.command.port_scan" => &[
            "ss -tulpn",
            "lsof -nP -iTCP -sTCP:LISTEN",
            "netstat -ano",
        ],
        "diagnostic.command.disk_usage" => &[
            "df -h",
            "wmic logicaldisk get caption,freespace,size",
        ],
        "diagnostic.command.memory_cpu" => &[
            "uptime && free -m",
            "vm_stat && sysctl -n hw.memsize && uptime",
            "wmic OS get FreePhysicalMemory,TotalVisibleMemorySize,LastBootUpTime /Value & wmic cpu get loadpercentage,name",
        ],
        "diagnostic.command.service_status" => &[
            "systemctl list-units --type=service --state=running --no-pager",
            "launchctl list",
            "sc query type= service state= all",
        ],
        "diagnostic.command.system_logs" => &[
            "journalctl -n 100 --no-pager",
            "log show --style compact --last 1h | tail -n 100",
            "wevtutil qe System /c:100 /f:text",
        ],
        _ => &[],
    }
}

pub fn launch_post_action(action: PostTaskAction) -> Result<()> {
    let mut command = if cfg!(target_os = "windows") {
        let mut cmd = StdCommand::new("powershell.exe");
        cmd.arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(&action.launcher_path);
        cmd
    } else {
        let mut cmd = StdCommand::new("sh");
        cmd.arg(&action.launcher_path);
        cmd
    };

    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .with_context(|| {
            format!(
                "failed to launch self-update helper: {}",
                action.launcher_path.display()
            )
        })?;
    Ok(())
}

async fn prepare_self_update(
    config: &Config,
    payload: &Value,
) -> Result<PostTaskAction> {
    let payload: SelfUpdatePayload = serde_json::from_value(payload.clone())
        .context("invalid self-update payload")?;
    let download_url = resolve_self_update_download_url(config, &payload)?;
    let work_dir = unique_self_update_dir();
    tokio::fs::create_dir_all(&work_dir)
        .await
        .with_context(|| format!("failed to create {}", work_dir.display()))?;

    let binary_name = current_binary_name();
    let staged_binary = work_dir.join(binary_name);
    let launcher_path = work_dir.join(if cfg!(target_os = "windows") {
        "apply-self-update.ps1"
    } else {
        "apply-self-update.sh"
    });
    let target_binary = std::env::current_exe()
        .context("failed to resolve current executable path for self-update")?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .context("failed to construct self-update HTTP client")?;
    let response = client
        .get(&download_url)
        .send()
        .await
        .with_context(|| format!("failed to download update from {download_url}"))?;
    let response = response
        .error_for_status()
        .with_context(|| format!("agent update download returned error for {download_url}"))?;
    let bytes = response
        .bytes()
        .await
        .context("failed to read downloaded self-update artifact")?;
    tokio::fs::write(&staged_binary, bytes.as_ref())
        .await
        .with_context(|| format!("failed to write {}", staged_binary.display()))?;
    ensure_executable(&staged_binary)?;

    let target_version = payload
        .version
        .clone()
        .unwrap_or_else(|| config.agent_version.clone());
    let from_version = payload
        .from_version
        .clone()
        .unwrap_or_else(|| config.agent_version.clone());
    let launcher =
        render_self_update_launcher(&staged_binary, &target_binary, &target_version);
    tokio::fs::write(&launcher_path, launcher.as_bytes())
        .await
        .with_context(|| format!("failed to write {}", launcher_path.display()))?;
    ensure_executable(&launcher_path)?;

    Ok(PostTaskAction {
        launcher_path,
        download_url,
        from_version,
        target_version,
    })
}

fn resolve_self_update_download_url(
    config: &Config,
    payload: &SelfUpdatePayload,
) -> Result<String> {
    if let Some(artifact_url) = payload
        .artifact_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(artifact_url.to_string());
    }

    let platform = declared_os();
    let arch = current_arch_label()?;
    let filename = current_binary_name();
    let version = payload
        .version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(config.agent_version.as_str());
    Ok(format!(
        "{}/agent-artifacts/{version}/{platform}/{arch}/{filename}",
        config.api_url
    ))
}

fn current_arch_label() -> Result<&'static str> {
    match std::env::consts::ARCH {
        "x86_64" => Ok("amd64"),
        "aarch64" | "arm64" => Ok("arm64"),
        "x86" if cfg!(target_os = "windows") => Ok("amd64"),
        other => Err(anyhow!("unsupported CPU architecture for self-update: {other}")),
    }
}

fn current_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "hack-agent.exe"
    } else {
        "hack-agent"
    }
}

fn unique_self_update_dir() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "umirhack-self-update-{}-{stamp}",
        std::process::id()
    ))
}

fn render_self_update_launcher(
    staged_binary: &Path,
    target_binary: &Path,
    target_version: &str,
) -> String {
    if cfg!(target_os = "windows") {
        return render_windows_self_update_launcher(
            staged_binary,
            target_binary,
            target_version,
        );
    }
    if cfg!(target_os = "macos") {
        return render_macos_self_update_launcher(
            staged_binary,
            target_binary,
            target_version,
        );
    }
    render_linux_self_update_launcher(staged_binary, target_binary, target_version)
}

fn render_linux_self_update_launcher(
    staged_binary: &Path,
    target_binary: &Path,
    target_version: &str,
) -> String {
    let staged = shell_quote(&staged_binary.to_string_lossy());
    let target = shell_quote(&target_binary.to_string_lossy());
    let service_name = shell_quote(LINUX_SERVICE_NAME);
    let version = shell_quote(target_version);
    format!(
        "#!/bin/sh\nset -eu\nsleep 2\nTARGET={target}\nSTAGED={staged}\nNEW_TARGET=\"$TARGET.new\"\nENV_FILE='/etc/umirhack-agent.env'\nVERSION_NOTE='/var/lib/umirhack-agent/version.txt'\nTARGET_VERSION={version}\ninstall -m 0755 \"$STAGED\" \"$NEW_TARGET\"\nmv \"$NEW_TARGET\" \"$TARGET\"\nTMP_ENV=\"$ENV_FILE.tmp\"\nif [ -f \"$ENV_FILE\" ]; then\n  awk -v version=\"$TARGET_VERSION\" 'BEGIN {{ updated = 0 }} /^HACK_AGENT_VERSION=/ {{ print \"HACK_AGENT_VERSION=\" version; updated = 1; next }} {{ print }} END {{ if (updated == 0) print \"HACK_AGENT_VERSION=\" version }}' \"$ENV_FILE\" > \"$TMP_ENV\"\n  mv \"$TMP_ENV\" \"$ENV_FILE\"\nelse\n  printf 'HACK_AGENT_VERSION=%s\\n' \"$TARGET_VERSION\" > \"$ENV_FILE\"\nfi\nprintf '%s\\n' \"$TARGET_VERSION\" > \"$VERSION_NOTE\"\nsystemctl restart {service_name}\nrm -f \"$STAGED\" \"$0\"\n"
    )
}

fn render_macos_self_update_launcher(
    staged_binary: &Path,
    target_binary: &Path,
    target_version: &str,
) -> String {
    let staged = shell_quote(&staged_binary.to_string_lossy());
    let target = shell_quote(&target_binary.to_string_lossy());
    let version = shell_quote(target_version);
    format!(
        "#!/bin/sh\nset -eu\nsleep 2\nTARGET={target}\nSTAGED={staged}\nNEW_TARGET=\"$TARGET.new\"\nRUNNER='/usr/local/libexec/umirhack-agent/run-agent.sh'\nVERSION_NOTE='/Library/Application Support/UmirhackAgent/version.txt'\nTARGET_VERSION={version}\ninstall -m 0755 \"$STAGED\" \"$NEW_TARGET\"\nmv \"$NEW_TARGET\" \"$TARGET\"\nif [ -f \"$RUNNER\" ]; then\n  TMP_RUNNER=\"$RUNNER.tmp\"\n  awk -v version=\"$TARGET_VERSION\" 'BEGIN {{ updated = 0 }} /^export HACK_AGENT_VERSION=/ {{ print \"export HACK_AGENT_VERSION='\\''\" version \"'\\''\"\"; updated = 1; next }} {{ print }} END {{ if (updated == 0) print \"export HACK_AGENT_VERSION='\\''\" version \"'\\''\"\" }}' \"$RUNNER\" > \"$TMP_RUNNER\"\n  mv \"$TMP_RUNNER\" \"$RUNNER\"\n  chmod 0755 \"$RUNNER\"\nfi\nprintf '%s\\n' \"$TARGET_VERSION\" > \"$VERSION_NOTE\"\nlaunchctl kickstart -k system/{plist_id}\nrm -f \"$STAGED\" \"$0\"\n",
        plist_id = MACOS_PLIST_ID,
    )
}

fn render_windows_self_update_launcher(
    staged_binary: &Path,
    target_binary: &Path,
    target_version: &str,
) -> String {
    let staged = powershell_quote(&staged_binary.to_string_lossy());
    let target = powershell_quote(&target_binary.to_string_lossy());
    let task_name = powershell_quote(WINDOWS_TASK_NAME);
    let version = powershell_quote(target_version);
    format!(
        "$ErrorActionPreference = \"Stop\"\n$staged = {staged}\n$target = {target}\n$targetVersion = {version}\n$newTarget = \"$target.new\"\n$runnerPath = Join-Path (Split-Path -Parent $target) \"run-agent.ps1\"\n$versionPath = Join-Path $env:ProgramData \"Umirhack\\version.txt\"\nStart-Sleep -Seconds 2\nfor ($i = 0; $i -lt 20; $i++) {{\n    try {{\n        if (Test-Path $newTarget) {{ Remove-Item -Force $newTarget }}\n        Copy-Item -Force $staged $newTarget\n        if (Test-Path $target) {{ Remove-Item -Force $target }}\n        Move-Item -Force $newTarget $target\n        break\n    }} catch {{\n        if ($i -eq 19) {{ throw }}\n        Start-Sleep -Seconds 1\n    }}\n}}\nif (Test-Path $runnerPath) {{\n    $runner = Get-Content -Raw -Path $runnerPath\n    if ($runner -match \"(?m)^\\$env:HACK_AGENT_VERSION = '.*'$\") {{\n        $runner = $runner -replace \"(?m)^\\$env:HACK_AGENT_VERSION = '.*'$\", ('$env:HACK_AGENT_VERSION = ''{{0}}''' -f $targetVersion)\n    }} else {{\n        $runner = $runner + \"`r`n\" + '$env:HACK_AGENT_VERSION = ''' + $targetVersion + ''''\n    }}\n    Set-Content -Path $runnerPath -Value $runner -Encoding ASCII\n}}\nSet-Content -Path $versionPath -Value $targetVersion -Encoding ASCII\nStart-ScheduledTask -TaskName {task_name}\nRemove-Item -Force $staged\nRemove-Item -Force $PSCommandPath\n"
    )
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(unix)]
fn ensure_executable(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = std::fs::metadata(path)
        .with_context(|| format!("failed to stat {}", path.display()))?
        .permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions)
        .with_context(|| format!("failed to chmod {}", path.display()))?;
    Ok(())
}

#[cfg(not(unix))]
fn ensure_executable(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use serde_json::json;
    use crate::models::{AgentExecutionHost, AgentExecutionTemplate, AgentTaskLease};

    use crate::config::Config;

    use super::{
        PostTaskAction,
        SelfUpdatePayload,
        execute_task,
        parse_linux_service_status,
        parse_macos_service_status,
        parse_windows_service_status,
        render_linux_self_update_launcher,
        resolve_self_update_download_url,
    };

    fn lease_for_kind(
        kind: &str,
        payload_json: serde_json::Value,
        approved_command: Option<&str>,
    ) -> AgentTaskLease {
        AgentTaskLease {
            id: "task-1".to_string(),
            environment_id: "env-1".to_string(),
            host_id: "host-1".to_string(),
            lease_token: "lease-token".to_string(),
            lease_until: "2099-01-01T00:00:00Z".to_string(),
            task_template: AgentExecutionTemplate {
                id: "template-1".to_string(),
                kind: kind.to_string(),
                name: kind.to_string(),
                payload_json,
                approved_command: approved_command.map(ToString::to_string),
            },
            host: AgentExecutionHost {
                id: "host-1".to_string(),
                name: "alpha".to_string(),
                hostname: Some("alpha.internal".to_string()),
                primary_ipv4: Some("127.0.0.1".to_string()),
                primary_ipv6: None,
            },
        }
    }

    fn test_config(safe_mode: bool) -> Config {
        Config {
            api_url: "http://example.invalid/api".to_string(),
            bootstrap_token: None,
            state_path: PathBuf::from("/tmp/hack-agent-test-state.json"),
            poll_interval_seconds: 5,
            agent_version: "1.2.2".to_string(),
            safe_mode,
        }
    }

    #[tokio::test]
    async fn system_profile_task_returns_structured_success() {
        let task = lease_for_kind("host.system_profile", json!({}), None);

        let result = execute_task(&task, &test_config(false)).await.result;

        assert_eq!(result.status, "succeeded");
        assert_eq!(result.telemetry_kind.as_deref(), Some("host.system_profile"));
        let payload = result
            .telemetry_payload
            .expect("system profile should include telemetry payload");
        assert!(payload.get("hostname").is_some());
        assert!(payload.get("os_name").is_some());
    }

    #[tokio::test]
    async fn connectivity_task_requires_target_endpoint() {
        let task = lease_for_kind(
            "network.endpoint_connectivity",
            json!({}),
            None,
        );

        let result = execute_task(&task, &test_config(false)).await.result;

        assert_eq!(result.status, "failed");
        assert_eq!(result.telemetry_kind, None);
        assert!(
            result
                .failure_reason
                .as_deref()
                .expect("failure should be described")
                .contains("missing target endpoint")
        );
    }

    #[tokio::test]
    async fn diagnostic_task_rejects_unapproved_command_override() {
        let task = lease_for_kind(
            "diagnostic.command.port_scan",
            json!({}),
            Some("rm -rf /"),
        );

        let result = execute_task(&task, &test_config(false)).await.result;

        assert_eq!(result.status, "failed");
        assert_eq!(result.telemetry_kind, None);
        assert!(
            result
                .failure_reason
                .as_deref()
                .expect("failure should be described")
                .contains("not approved")
        );
    }

    #[tokio::test]
    async fn safe_mode_rejects_custom_command_tasks() {
        let task = lease_for_kind(
            "diagnostic.command.custom",
            json!({"approved_command": "uname -a"}),
            None,
        );

        let result = execute_task(&task, &test_config(true)).await.result;

        assert_eq!(result.status, "failed");
        assert_eq!(result.exit_code, Some(126));
        assert_eq!(result.telemetry_kind, None);
        assert_eq!(
            result.failure_reason.as_deref(),
            Some(super::SAFE_MODE_CUSTOM_TASK_ERROR)
        );
    }

    #[test]
    fn self_update_url_defaults_to_agent_artifact_endpoint() {
        let url = resolve_self_update_download_url(
            &test_config(false),
            &SelfUpdatePayload::default(),
        )
        .expect("self update url should resolve");

        let platform = super::declared_os();
        assert!(url.starts_with("http://example.invalid/api/agent-artifacts/"));
        assert!(url.contains("/agent-artifacts/1.2.2/"));
        assert!(url.contains(&format!("/1.2.2/{platform}/")));
        assert!(url.ends_with(super::current_binary_name()));
    }

    #[test]
    fn self_update_url_respects_explicit_override() {
        let url = resolve_self_update_download_url(
            &test_config(false),
            &SelfUpdatePayload {
                artifact_url: Some("https://updates.example.com/hack-agent".to_string()),
                from_version: None,
                version: Some("1.2.3".to_string()),
            },
        )
        .expect("explicit self update url should resolve");

        assert_eq!(url, "https://updates.example.com/hack-agent");
    }

    #[test]
    fn self_update_launcher_rewrites_linux_version_metadata() {
        let launcher = render_linux_self_update_launcher(
            Path::new("/tmp/hack-agent.new"),
            Path::new("/usr/local/bin/hack-agent"),
            "1.2.3",
        );

        assert!(launcher.contains("HACK_AGENT_VERSION="));
        assert!(launcher.contains("/var/lib/umirhack-agent/version.txt"));
        assert!(launcher.contains("1.2.3"));
    }

    #[test]
    fn self_update_result_includes_from_and_to_versions() {
        let task = lease_for_kind("agent.self_update", json!({}), None);
        let result = super::self_update_result(
            &task,
            &PostTaskAction {
                launcher_path: PathBuf::from("/tmp/apply-self-update.sh"),
                download_url: "https://updates.example.com/hack-agent".to_string(),
                from_version: "1.2.2".to_string(),
                target_version: "1.2.3".to_string(),
            },
        );
        let summary = result.summary_json.expect("self update should include summary");

        assert_eq!(summary.get("from_version").and_then(|v| v.as_str()), Some("1.2.2"));
        assert_eq!(summary.get("to_version").and_then(|v| v.as_str()), Some("1.2.3"));
        assert_eq!(summary.get("version").and_then(|v| v.as_str()), Some("1.2.3"));
    }

    #[test]
    fn parses_linux_service_status_into_structured_entries() {
        let services = parse_linux_service_status(
            "UNIT LOAD ACTIVE SUB DESCRIPTION\ncron.service loaded active running Regular background program processing daemon\nnginx.service loaded active running A high performance web server\n",
        );

        assert_eq!(services.len(), 2);
        assert_eq!(services[0].name, "cron.service");
        assert_eq!(services[0].status, "running");
        assert_eq!(services[0].active_state.as_deref(), Some("active"));
        assert_eq!(services[0].sub_state.as_deref(), Some("running"));
        assert_eq!(
            services[0].description.as_deref(),
            Some("Regular background program processing daemon")
        );
    }

    #[test]
    fn parses_macos_service_status_into_structured_entries() {
        let services = parse_macos_service_status(
            "PID\tStatus\tLabel\n123\t0\tcom.example.running\n-\t78\tcom.example.stopped\n",
        );

        assert_eq!(services.len(), 2);
        assert_eq!(services[0].name, "com.example.running");
        assert_eq!(services[0].status, "running");
        assert_eq!(services[1].name, "com.example.stopped");
        assert_eq!(services[1].status, "stopped");
    }

    #[test]
    fn parses_windows_service_status_into_structured_entries() {
        let services = parse_windows_service_status(
            "SERVICE_NAME: Appinfo\n        TYPE               : 20  WIN32_SHARE_PROCESS\n        STATE              : 4  RUNNING\nSERVICE_NAME: BITS\n        TYPE               : 20  WIN32_SHARE_PROCESS\n        STATE              : 1  STOPPED\n",
        );

        assert_eq!(services.len(), 2);
        assert_eq!(services[0].name, "Appinfo");
        assert_eq!(services[0].status, "running");
        assert_eq!(services[1].name, "BITS");
        assert_eq!(services[1].status, "stopped");
    }
}

fn hostname_fallback() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_string())
}

#[derive(Debug)]
struct CommandOutput {
    exit_code: i32,
    stdout: String,
    stderr: String,
}

#[derive(Debug, Deserialize)]
struct IpInterfaceRaw {
    ifname: Option<String>,
    address: Option<String>,
    #[serde(default)]
    addr_info: Vec<IpAddrInfoRaw>,
}

#[derive(Debug, Deserialize)]
struct IpAddrInfoRaw {
    family: Option<String>,
    local: Option<String>,
}

#[derive(Debug, serde::Serialize)]
struct NetworkInterfaceTelemetry {
    name: String,
    mac: Option<String>,
    ipv4: Vec<String>,
    ipv6: Vec<String>,
}

impl From<IpInterfaceRaw> for NetworkInterfaceTelemetry {
    fn from(value: IpInterfaceRaw) -> Self {
        let mut ipv4 = Vec::new();
        let mut ipv6 = Vec::new();
        for addr in value.addr_info {
            match addr.family.as_deref() {
                Some("inet") => {
                    if let Some(local) = addr.local {
                        ipv4.push(local);
                    }
                }
                Some("inet6") => {
                    if let Some(local) = addr.local {
                        ipv6.push(local);
                    }
                }
                _ => {}
            }
        }
        Self {
            name: value.ifname.unwrap_or_else(|| "unknown".to_string()),
            mac: value.address,
            ipv4,
            ipv6,
        }
    }
}

fn parse_ifconfig_interfaces(raw: &str) -> Vec<NetworkInterfaceTelemetry> {
    let mut interfaces = Vec::new();
    let mut current: Option<NetworkInterfaceTelemetry> = None;

    for line in raw.lines() {
        if line.is_empty() {
            continue;
        }

        if !line.starts_with('\t') && !line.starts_with(' ') {
            if let Some(interface) = current.take() {
                interfaces.push(interface);
            }

            let name = line
                .split(':')
                .next()
                .filter(|value| !value.is_empty())
                .unwrap_or("unknown")
                .to_string();
            current = Some(NetworkInterfaceTelemetry {
                name,
                mac: None,
                ipv4: Vec::new(),
                ipv6: Vec::new(),
            });
            continue;
        }

        let Some(interface) = current.as_mut() else {
            continue;
        };
        let trimmed = line.trim();

        if let Some(value) = trimmed.strip_prefix("ether ") {
            interface.mac = Some(value.to_string());
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("inet6 ") {
            let ipv6 = value
                .split_whitespace()
                .next()
                .unwrap_or("")
                .split('%')
                .next()
                .unwrap_or("")
                .to_string();
            if !ipv6.is_empty() {
                interface.ipv6.push(ipv6);
            }
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("inet ") {
            let ipv4 = value.split_whitespace().next().unwrap_or("").to_string();
            if !ipv4.is_empty() {
                interface.ipv4.push(ipv4);
            }
        }
    }

    if let Some(interface) = current {
        interfaces.push(interface);
    }

    interfaces
}
