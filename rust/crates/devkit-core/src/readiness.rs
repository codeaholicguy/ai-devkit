use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

/// Wire types for `agent.readiness`, mirroring
/// agent-manager's `AgentReadinessReport` shape exactly.
///
/// "pass" | "warn" | "fail" | "info" — strings so the schema
/// doesn't churn on new statuses.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ExecutableReadinessCheck {
    pub status: String,
    pub errors: Vec<String>,
    pub command: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryReadinessCheck {
    pub status: String,
    pub errors: Vec<String>,
    pub path: String,
    pub present: bool,
    pub readable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInSkillsReadinessCheck {
    pub status: String,
    pub errors: Vec<String>,
    pub path: Option<String>,
    #[ts(type = "number")]
    pub required: u64,
    #[ts(type = "number")]
    pub present: u64,
    pub missing: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AuthReadinessCheck {
    pub status: String,
    pub errors: Vec<String>,
    /// "authenticated" | "unauthenticated" | "unknown"
    pub state: String,
    pub source: String,
    pub provider: Option<String>,
    pub available_providers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationReadinessCheck {
    pub status: String,
    pub errors: Vec<String>,
    pub label: String,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "Record<string, unknown>")]
    pub details: Option<BTreeMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentReadinessReport {
    #[serde(rename = "type")]
    pub agent_type: String,
    pub executable: ExecutableReadinessCheck,
    pub global_config: DirectoryReadinessCheck,
    pub built_in_skills: BuiltInSkillsReadinessCheck,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub auth: Option<AuthReadinessCheck>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub integration: Option<IntegrationReadinessCheck>,
    pub status: String,
}

/// Result of `agent.readiness` — ordered per AGENT_TYPES (the JSON object
/// map can't carry key order; clients `fromEntries` it).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
pub struct AgentReadinessResult {
    pub reports: Vec<AgentReadinessReport>,
}
