use std::path::Path;

use anyhow::Context;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AgentState {
    pub agent_id: String,
    pub registration_token: String,
}

pub async fn load_state(path: &Path) -> anyhow::Result<Option<AgentState>> {
    if !path.exists() {
        return Ok(None);
    }
    let payload = tokio::fs::read_to_string(path)
        .await
        .with_context(|| format!("failed to read state file {}", path.display()))?;
    let state = serde_json::from_str(&payload)
        .with_context(|| format!("failed to parse state file {}", path.display()))?;
    Ok(Some(state))
}

pub async fn save_state(path: &Path, state: &AgentState) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }
    let payload = serde_json::to_string_pretty(state)?;
    tokio::fs::write(path, payload)
        .await
        .with_context(|| format!("failed to write state file {}", path.display()))?;
    Ok(())
}
