mod api;
mod config;
mod models;
mod state;
mod tasks;

use anyhow::Context;
use std::future::Future;
use tokio::task::JoinSet;
use tokio::sync::watch;
use tokio::time::{Duration, sleep};

use crate::api::AgentApi;
use crate::config::Config;
use crate::models::AgentTaskLease;
use crate::state::{AgentState, load_state, save_state};
use crate::tasks::{PostTaskAction, execute_task, launch_post_action};

const POLL_REQUEST_LIMIT: usize = 128;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    run().await
}

async fn run() -> anyhow::Result<()> {
    let config = Config::from_env();
    let api = AgentApi::new(config.clone())?;
    let (state, poll_interval) = ensure_registered(&api, &config).await?;

    loop {
        if let Err(error) = tick(&api, &state, &config).await {
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

async fn tick(api: &AgentApi, state: &AgentState, config: &Config) -> anyhow::Result<()> {
    api.heartbeat(state).await.context("heartbeat failed")?;
    let mut running = JoinSet::new();
    let mut poll_error: Option<anyhow::Error> = None;

    loop {
        if poll_error.is_none() && running.len() < POLL_REQUEST_LIMIT {
            match api
                .poll(state, POLL_REQUEST_LIMIT.saturating_sub(running.len()))
                .await
                .context("poll failed")
            {
                Ok(tasks) => {
                    for task in tasks {
                        running.spawn(run_task(
                            api.clone(),
                            state.clone(),
                            config.clone(),
                            task,
                        ));
                    }
                }
                Err(error) => {
                    if running.is_empty() {
                        return Err(error);
                    }
                    poll_error = Some(error);
                }
            }
        }

        if running.is_empty() {
            break;
        }

        let finished = running
            .join_next()
            .await
            .context("task executor set terminated unexpectedly")?
            .context("task executor join failed")??;
        if let Some(post_action) = finished.post_action {
            running.abort_all();
            while running.join_next().await.is_some() {}
            launch_post_action(post_action).with_context(|| {
                format!("failed to apply post action for task {}", finished.task_id)
            })?;
            std::process::exit(0);
        }
    }

    if let Some(error) = poll_error {
        return Err(error);
    }

    Ok(())
}

struct FinishedTask {
    task_id: String,
    post_action: Option<PostTaskAction>,
}

async fn run_task(
    api: AgentApi,
    state: AgentState,
    config: Config,
    task: AgentTaskLease,
) -> anyhow::Result<FinishedTask> {
    api.mark_running(&state, &task.id, &task.lease_token)
        .await
        .with_context(|| format!("failed to mark task {} running", task.id))?;
    let task_id = task.id.clone();
    let (stop_tx, heartbeat_handle) = spawn_heartbeat_loop(
        Duration::from_secs(config.poll_interval_seconds.max(1)),
        {
            let api = api.clone();
            let state = state.clone();
            let task_id = task_id.clone();
            move || {
                let api = api.clone();
                let state = state.clone();
                let task_id = task_id.clone();
                async move {
                    if let Err(error) = api.heartbeat(&state).await {
                        eprintln!(
                            "background heartbeat failed while running task {}: {error:#}",
                            task_id
                        );
                    }
                }
            }
        },
    );
    let outcome = execute_task(&task, &config).await;
    let _ = stop_tx.send(true);
    if let Err(error) = heartbeat_handle.await {
        eprintln!(
            "background heartbeat loop failed for task {}: {error:#}",
            task_id
        );
    }
    api.complete(&state, &task.id, &outcome.result)
        .await
        .with_context(|| format!("failed to complete task {}", task.id))?;
    Ok(FinishedTask {
        task_id,
        post_action: outcome.post_action,
    })
}

fn spawn_heartbeat_loop<H, Fut>(
    interval: Duration,
    mut heartbeat: H,
) -> (watch::Sender<bool>, tokio::task::JoinHandle<()>)
where
    H: FnMut() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    let (stop_tx, mut stop_rx) = watch::channel(false);
    let handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                changed = stop_rx.changed() => {
                    if changed.is_err() || *stop_rx.borrow() {
                        break;
                    }
                }
                _ = sleep(interval) => heartbeat().await,
            }
        }
    });
    (stop_tx, handle)
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use tokio::task::yield_now;
    use tokio::time::{Duration, advance};

    #[tokio::test(start_paused = true)]
    async fn heartbeat_loop_runs_until_stopped() {
        let beats = Arc::new(AtomicUsize::new(0));
        let beats_for_loop = beats.clone();
        let (stop_tx, heartbeat_handle) =
            super::spawn_heartbeat_loop(Duration::from_millis(10), move || {
                let beats = beats_for_loop.clone();
                async move {
                    beats.fetch_add(1, Ordering::SeqCst);
                }
            });

        yield_now().await;
        advance(Duration::from_millis(11)).await;
        yield_now().await;
        let before_stop = beats.load(Ordering::SeqCst);
        assert_eq!(before_stop, 1);

        let _ = stop_tx.send(true);
        yield_now().await;
        heartbeat_handle
            .await
            .expect("heartbeat task should stop cleanly");

        advance(Duration::from_millis(30)).await;
        yield_now().await;
        assert_eq!(beats.load(Ordering::SeqCst), before_stop);
    }
}
