use std::time::Duration;

use anyhow::{Context, Result};
use reqwest::header::{HeaderMap, HeaderValue};

use crate::config::Config;
use crate::models::{
    AgentHeartbeatPayload, AgentPollPayload, AgentRegisterPayload,
    AgentRegisterResponse, AgentTaskLease, CompletePayload, RunningPayload,
    capabilities_json,
};
use crate::state::AgentState;
use crate::tasks::declared_os;

pub struct AgentApi {
    client: reqwest::Client,
    config: Config,
}

impl AgentApi {
    pub fn new(config: Config) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .context("failed to construct reqwest client")?;
        Ok(Self { client, config })
    }

    pub async fn register(&self) -> Result<AgentRegisterResponse> {
        let payload = build_register_payload(&self.config)?;
        self.post_json("/agent/register", None, &payload).await
    }

    pub async fn heartbeat(&self, state: &AgentState) -> Result<()> {
        let payload = build_heartbeat_payload(&self.config);
        let _: serde_json::Value = self
            .post_json("/agent/heartbeat", Some(state), &payload)
            .await?;
        Ok(())
    }

    pub async fn poll(&self, state: &AgentState, limit: usize) -> Result<Vec<AgentTaskLease>> {
        let payload = AgentPollPayload { limit };
        self.post_json("/agent/poll", Some(state), &payload).await
    }

    pub async fn mark_running(
        &self,
        state: &AgentState,
        task_run_id: &str,
        lease_token: &str,
    ) -> Result<()> {
        let payload = RunningPayload {
            lease_token: lease_token.to_string(),
        };
        let path = format!("/agent/task-runs/{task_run_id}/running");
        let _: serde_json::Value = self
            .post_json(&path, Some(state), &payload)
            .await?;
        Ok(())
    }

    pub async fn complete(
        &self,
        state: &AgentState,
        task_run_id: &str,
        payload: &CompletePayload,
    ) -> Result<()> {
        let path = format!("/agent/task-runs/{task_run_id}/complete");
        let _: serde_json::Value = self.post_json(&path, Some(state), payload).await?;
        Ok(())
    }

    async fn post_json<TReq, TResp>(
        &self,
        path: &str,
        state: Option<&AgentState>,
        payload: &TReq,
    ) -> Result<TResp>
    where
        TReq: serde::Serialize + ?Sized,
        TResp: serde::de::DeserializeOwned,
    {
        let url = format!("{}{}", self.config.api_url, path);
        let mut request = self.client.post(url).json(payload);
        if let Some(agent_state) = state {
            request = request.headers(auth_headers(agent_state)?);
        }

        let response = request.send().await.context("agent API request failed")?;
        let response = response.error_for_status().context("agent API returned error status")?;
        response
            .json::<TResp>()
            .await
            .context("failed to decode agent API response")
    }
}

fn auth_headers(state: &AgentState) -> Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    headers.insert("X-Agent-Id", HeaderValue::from_str(&state.agent_id)?);
    headers.insert(
        "X-Agent-Token",
        HeaderValue::from_str(&state.registration_token)?,
    );
    Ok(headers)
}

fn build_register_payload(config: &Config) -> Result<AgentRegisterPayload> {
    let bootstrap_token = config
        .bootstrap_token
        .clone()
        .context("missing HACK_AGENT_BOOTSTRAP_TOKEN for first registration")?;
    Ok(AgentRegisterPayload {
        bootstrap_token,
        agent_version: config.agent_version.clone(),
        declared_os: declared_os().to_string(),
        capabilities_json: capabilities_json(),
    })
}

fn build_heartbeat_payload(config: &Config) -> AgentHeartbeatPayload {
    AgentHeartbeatPayload {
        agent_version: config.agent_version.clone(),
        capabilities_json: capabilities_json(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use crate::config::Config;
    use crate::state::AgentState;

    fn test_config(api_url: String, bootstrap_token: Option<&str>) -> Config {
        Config {
            api_url,
            bootstrap_token: bootstrap_token.map(ToString::to_string),
            state_path: PathBuf::from("/tmp/hack-agent-test-state.json"),
            poll_interval_seconds: 5,
            agent_version: "rust-test-agent/1".to_string(),
        }
    }

    #[test]
    fn register_payload_requires_bootstrap_token() {
        let error = super::build_register_payload(&test_config(
            "http://example.invalid".to_string(),
            None,
        ))
        .expect_err("missing bootstrap token should fail");

        assert!(
            error
                .to_string()
                .contains("missing HACK_AGENT_BOOTSTRAP_TOKEN")
        );
    }

    #[test]
    fn register_payload_includes_agent_metadata_and_capabilities() {
        let payload = super::build_register_payload(&test_config(
            "http://example.invalid".to_string(),
            Some("bootstrap-123"),
        ))
        .expect("register payload should build");

        assert_eq!(payload.bootstrap_token, "bootstrap-123");
        assert_eq!(payload.agent_version, "rust-test-agent/1");
        assert_eq!(payload.declared_os, super::declared_os());
        assert!(
            payload
                .capabilities_json["task_kinds"]
                .as_array()
                .expect("task kinds should be an array")
                .len()
                >= 3
        );
    }

    #[test]
    fn heartbeat_payload_and_auth_headers_include_agent_identity() {
        let payload = super::build_heartbeat_payload(&test_config(
            "http://example.invalid".to_string(),
            None,
        ));
        let state = AgentState {
            agent_id: "agent-42".to_string(),
            registration_token: "registration-secret".to_string(),
        };
        let headers = super::auth_headers(&state).expect("headers should build");

        assert_eq!(payload.agent_version, "rust-test-agent/1");
        assert!(
            payload
                .capabilities_json["task_kinds"]
                .as_array()
                .expect("task kinds should be an array")
                .len()
                >= 3
        );
        assert_eq!(
            headers
                .get("X-Agent-Id")
                .expect("agent id header should exist"),
            "agent-42"
        );
        assert_eq!(
            headers
                .get("X-Agent-Token")
                .expect("agent token header should exist"),
            "registration-secret"
        );
    }
}
