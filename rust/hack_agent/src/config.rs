use std::env;
use std::path::PathBuf;

const DEFAULT_API_URL: &str = "http://127.0.0.1:8000/api";
const DEFAULT_POLL_SECONDS: u64 = 5;
const DEFAULT_AGENT_VERSION: &str = "rust-agent/1";

#[derive(Clone, Debug)]
pub struct Config {
    pub api_url: String,
    pub bootstrap_token: Option<String>,
    pub state_path: PathBuf,
    pub poll_interval_seconds: u64,
    pub agent_version: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            api_url: env::var("HACK_AGENT_API_URL")
                .unwrap_or_else(|_| DEFAULT_API_URL.to_string())
                .trim_end_matches('/')
                .to_string(),
            bootstrap_token: env::var("HACK_AGENT_BOOTSTRAP_TOKEN").ok(),
            state_path: env::var("HACK_AGENT_STATE_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|_| default_state_path()),
            poll_interval_seconds: env::var("HACK_AGENT_POLL_INTERVAL_SECONDS")
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(DEFAULT_POLL_SECONDS),
            agent_version: env::var("HACK_AGENT_VERSION")
                .unwrap_or_else(|_| DEFAULT_AGENT_VERSION.to_string()),
        }
    }
}

fn default_state_path() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".umirhack-agent-state.json")
}
