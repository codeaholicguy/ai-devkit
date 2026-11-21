//! Wire projections for durable RPC consumers. Store owns their values.
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DurableIdentity {
    #[ts(type = "number")]
    pub pid: i64,
    pub started_at: String,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DurableActiveRun {
    pub token: String,
    pub owner: DurableIdentity,
    pub provider: Option<DurableIdentity>,
    pub started_at: String,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DurableLastResult {
    #[ts(type = "'succeeded' | 'failed' | 'interrupted'")]
    pub status: String,
    pub completed_at: String,
    pub exit_code: Option<i32>,
    pub summary: String,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DurableAgentWire {
    pub id: String,
    pub name: String,
    #[ts(type = "'claude' | 'codex' | 'pi'")]
    pub provider: String,
    #[ts(type = "'durable'")]
    pub mode: String,
    pub cwd: String,
    pub provider_session_id: Option<String>,
    #[ts(type = "'ready' | 'running' | 'degraded'")]
    pub state: String,
    #[ts(type = "'uninitialized' | 'healthy' | 'unknown' | 'mismatch'")]
    pub session_health: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_active_at: Option<String>,
    pub active_run: Option<DurableActiveRun>,
    pub last_result: Option<DurableLastResult>,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DurableRunWire {
    pub token: String,
    #[ts(type = "'running' | 'succeeded' | 'failed' | 'interrupted'")]
    pub status: String,
    pub completed_at: Option<String>,
    pub exit_code: Option<i32>,
    pub summary: String,
    pub result: Option<String>,
    pub stop_requested: bool,
}
