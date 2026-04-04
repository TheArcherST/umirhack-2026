mod api;
mod config;
mod models;
mod state;
mod tasks;

use anyhow::Context;
use tokio::time::{Duration, sleep};

use crate::api::AgentApi;
use crate::config::Config;
use crate::state::{AgentState, load_state, save_state};
use crate::tasks::execute_task;

const POLL_LIMIT: usize = 4;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    run().await
}

async fn run() -> anyhow::Result<()> {
    let config = Config::from_env();
    let api = AgentApi::new(config.clone())?;
    let (state, poll_interval) = ensure_registered(&api, &config).await?;

    loop {
        if let Err(error) = tick(&api, &state).await {
            eprintln!("agent tick failed: {error:#}");
        }

        sleep(Duration::from_secs(poll_interval)).await;
    }
}

async fn ensure_registered(
    api: &AgentApi,
    config: &Config,
) -> anyhow::Result<(AgentState, u64)> {
    if let Some(state) = load_state(&config.state_path).await? {
        return Ok((state, config.poll_interval_seconds.max(1)));
    }

    let response = api.register().await.context("agent registration failed")?;
    let state = AgentState {
        agent_id: response.agent_id,
        registration_token: response.registration_token,
    };
    save_state(&config.state_path, &state).await?;
    Ok((state, response.poll_interval_seconds.max(1)))
}

async fn tick(api: &AgentApi, state: &AgentState) -> anyhow::Result<()> {
    api.heartbeat(state).await.context("heartbeat failed")?;
    let tasks = api.poll(state, POLL_LIMIT).await.context("poll failed")?;

    for task in tasks {
        api.mark_running(state, &task.id, &task.lease_token)
            .await
            .with_context(|| format!("failed to mark task {} running", task.id))?;
        let result = execute_task(&task).await;
        api.complete(state, &task.id, &result)
            .await
            .with_context(|| format!("failed to complete task {}", task.id))?;
    }

    Ok(())
}
