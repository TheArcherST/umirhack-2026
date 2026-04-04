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

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{AgentState, load_state, save_state};

    fn unique_path() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir()
            .join("umirhack-rust-tests")
            .join(format!("agent-state-{nanos}.json"))
    }

    #[tokio::test]
    async fn load_state_returns_none_for_missing_file() {
        let path = unique_path();

        let state = load_state(&path).await.expect("missing file should be handled");

        assert!(state.is_none());
    }

    #[tokio::test]
    async fn save_state_round_trips_agent_credentials() {
        let path = unique_path();
        let original = AgentState {
            agent_id: "agent-1".to_string(),
            registration_token: "secret-token".to_string(),
        };

        save_state(&path, &original)
            .await
            .expect("state should be saved");
        let loaded = load_state(&path)
            .await
            .expect("saved state should load")
            .expect("saved state should exist");

        assert_eq!(loaded.agent_id, original.agent_id);
        assert_eq!(loaded.registration_token, original.registration_token);

        let _ = tokio::fs::remove_file(path).await;
    }
}
