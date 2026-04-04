use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SUPPORTED_TASK_KINDS: &[&str] = &[
    "host.system_profile",
    "host.ip_interfaces",
    "network.endpoint_connectivity",
    "diagnostic.command.port_scan",
    "diagnostic.command.disk_usage",
    "diagnostic.command.memory_cpu",
    "diagnostic.command.service_status",
    "diagnostic.command.system_logs",
];

#[derive(Debug, Serialize)]
pub struct AgentRegisterPayload {
    pub bootstrap_token: String,
    pub agent_version: String,
    pub declared_os: String,
    pub capabilities_json: Value,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct AgentRegisterResponse {
    pub agent_id: String,
    pub registration_token: String,
    pub poll_interval_seconds: u64,
    pub lease_duration_seconds: u64,
}

#[derive(Debug, Serialize)]
pub struct AgentHeartbeatPayload {
    pub agent_version: String,
    pub capabilities_json: Value,
}

#[derive(Debug, Serialize)]
pub struct AgentPollPayload {
    pub limit: usize,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct AgentExecutionTemplate {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub payload_json: Value,
    pub approved_command: Option<String>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct AgentExecutionHost {
    pub id: String,
    pub name: String,
    pub hostname: Option<String>,
    pub primary_ipv4: Option<String>,
    pub primary_ipv6: Option<String>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct AgentTaskLease {
    pub id: String,
    pub environment_id: String,
    pub host_id: String,
    pub lease_token: String,
    pub lease_until: String,
    pub task_template: AgentExecutionTemplate,
    pub host: AgentExecutionHost,
}

#[derive(Debug, Serialize)]
pub struct RunningPayload {
    pub lease_token: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct CompletePayload {
    pub lease_token: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout_text: Option<String>,
    pub stderr_text: Option<String>,
    pub summary_json: Option<Value>,
    pub telemetry_kind: Option<String>,
    pub telemetry_payload: Option<Value>,
    pub failure_reason: Option<String>,
}

pub fn capabilities_json() -> Value {
    serde_json::json!({
        "task_kinds": SUPPORTED_TASK_KINDS,
    })
}
