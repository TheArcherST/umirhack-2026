use std::collections::BTreeSet;
use std::net::ToSocketAddrs;
use std::process::Stdio;
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use serde::Deserialize;
use serde_json::{Value, json};
use sysinfo::System;
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::time::{Instant, timeout};
use url::Url;

use crate::models::{AgentTaskLease, CompletePayload};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

pub async fn execute_task(task: &AgentTaskLease) -> CompletePayload {
    match execute_task_inner(task).await {
        Ok(result) => result,
        Err(error) => failure_result(task, error.to_string()),
    }
}

async fn execute_task_inner(task: &AgentTaskLease) -> Result<CompletePayload> {
    let template = &task.task_template;
    let kind = template.kind.as_str();
    let payload = &template.payload_json;

    match kind {
        "host.system_profile" => {
            let telemetry = collect_system_profile();
            Ok(success_result(task, kind, telemetry))
        }
        "host.ip_interfaces" => {
            let telemetry = collect_interfaces().await?;
            Ok(success_result(task, kind, telemetry))
        }
        "network.endpoint_connectivity" => {
            let target = payload
                .get("target_endpoint")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow!("missing target endpoint"))?;
            let telemetry = collect_endpoint_connectivity(target).await;
            Ok(success_result(task, kind, telemetry))
        }
        kind if kind.starts_with("diagnostic.command.") => {
            let requested_command = template
                .approved_command
                .as_deref()
                .or_else(|| payload.get("approved_command").and_then(Value::as_str));
            let command = resolve_command_for_kind(kind, requested_command)?;
            let result = run_command(command).await;
            let telemetry_payload = json!({
                "sample": result.stdout,
                "command": command,
            });
            Ok(CompletePayload {
                lease_token: task.lease_token.clone(),
                status: if result.exit_code == 0 {
                    "succeeded".to_string()
                } else {
                    "failed".to_string()
                },
                exit_code: Some(result.exit_code),
                stdout_text: Some(result.stdout),
                stderr_text: Some(result.stderr.clone()),
                summary_json: Some(json!({ "command": command })),
                telemetry_kind: Some(kind.to_string()),
                telemetry_payload: Some(telemetry_payload),
                failure_reason: if result.exit_code == 0 {
                    None
                } else {
                    Some("Command exited with error".to_string())
                },
            })
        }
        _ => Ok(failure_result(
            task,
            format!("Unsupported task kind: {kind}"),
        )),
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

#[cfg(test)]
mod tests {
    use serde_json::json;
    use crate::models::{AgentExecutionHost, AgentExecutionTemplate, AgentTaskLease};

    use super::execute_task;

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

    #[tokio::test]
    async fn system_profile_task_returns_structured_success() {
        let task = lease_for_kind("host.system_profile", json!({}), None);

        let result = execute_task(&task).await;

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

        let result = execute_task(&task).await;

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

        let result = execute_task(&task).await;

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
