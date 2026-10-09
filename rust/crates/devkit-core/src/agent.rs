use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Fully attributed agent, mirroring agent-manager's `AgentInfo` exactly —
/// the wire shape TS clients already consume from `listAgents`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct EnrichedAgent {
    pub name: String,
    #[serde(rename = "type")]
    pub agent_type: String,
    /// "running" | "waiting" | "idle" | "unknown" — string so future harness
    /// states don't churn the schema.
    pub status: String,
    pub summary: String,
    #[ts(type = "number")]
    pub pid: u64,
    pub project_path: String,
    pub session_id: String,
    /// ISO-8601 — TS `Date` crosses the wire as a string.
    pub last_active: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pinned: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub session_file_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn enriched_agent_wire_shape_matches_agent_info() {
        let a = EnrichedAgent {
            name: "proj".into(),
            agent_type: "claude".into(),
            status: "running".into(),
            summary: "hi".into(),
            pid: 42,
            project_path: "/p".into(),
            session_id: "s-1".into(),
            last_active: "2026-10-08T00:00:00.000Z".into(),
            pinned: None,
            session_file_path: None,
        };
        assert_eq!(
            serde_json::to_value(&a).unwrap(),
            json!({
                "name": "proj",
                "type": "claude",
                "status": "running",
                "summary": "hi",
                "pid": 42,
                "projectPath": "/p",
                "sessionId": "s-1",
                "lastActive": "2026-10-08T00:00:00.000Z"
            })
        );
    }

    #[test]
    fn optional_fields_present_when_set() {
        let a = EnrichedAgent {
            name: "x".into(),
            agent_type: "codex".into(),
            status: "idle".into(),
            summary: String::new(),
            pid: 1,
            project_path: "/q".into(),
            session_id: "s".into(),
            last_active: "t".into(),
            pinned: Some(true),
            session_file_path: Some("/f".into()),
        };
        let v = serde_json::to_value(&a).unwrap();
        assert_eq!(v["pinned"], json!(true));
        assert_eq!(v["sessionFilePath"], json!("/f"));
    }
}
