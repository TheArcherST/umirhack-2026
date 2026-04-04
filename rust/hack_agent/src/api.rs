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
        let bootstrap_token = self
            .config
            .bootstrap_token
            .clone()
            .context("missing HACK_AGENT_BOOTSTRAP_TOKEN for first registration")?;
        let payload = AgentRegisterPayload {
            bootstrap_token,
            agent_version: self.config.agent_version.clone(),
            declared_os: declared_os().to_string(),
            capabilities_json: capabilities_json(),
        };
        self.post_json("/agent/register", None, &payload).await
    }

    pub async fn heartbeat(&self, state: &AgentState) -> Result<()> {
        let payload = AgentHeartbeatPayload {
            agent_version: self.config.agent_version.clone(),
            capabilities_json: capabilities_json(),
        };
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
