//! Port of `AntigravitySessionLocator` — the
//! `cache/last_conversations.json` cwd→conversationId registry and the
//! per-process join.

use devkit_core::discover::AgentProc;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

/// `AntigravityConversationRef`.
pub struct ConversationRef {
    pub cwd: String,
    pub conversation_id: String,
    pub transcript_path: String,
}

/// `AntigravityProcessMatch` — every agy proc gets a row; `conversation`
/// is None when its cwd isn't registered.
pub struct ProcessMatch<'a> {
    pub process: &'a AgentProc,
    pub cwd: String,
    pub conversation: Option<ConversationRef>,
}

/// `matchRunningProcesses` — one entry per process, in process order,
/// joined on `proc.cwd || ""`.
pub fn match_running_processes<'a>(
    base_dir: &Path,
    processes: &[&'a AgentProc],
) -> Vec<ProcessMatch<'a>> {
    let by_cwd: HashMap<String, ConversationRef> = list_conversations(base_dir)
        .into_iter()
        .map(|r| (r.cwd.clone(), r))
        .collect();
    processes
        .iter()
        .map(|process| {
            let cwd = process.cwd.clone().unwrap_or_default();
            let conversation = by_cwd.get(&cwd).map(|r| ConversationRef {
                cwd: r.cwd.clone(),
                conversation_id: r.conversation_id.clone(),
                transcript_path: r.transcript_path.clone(),
            });
            ProcessMatch {
                process,
                cwd,
                conversation,
            }
        })
        .collect()
}

/// `listConversations` — `{ <cwd>: <conversationId> }`; non-object JSON,
/// empty keys/ids, and non-string ids are all skipped.
fn list_conversations(base_dir: &Path) -> Vec<ConversationRef> {
    let content = std::fs::read_to_string(base_dir.join("cache/last_conversations.json"));
    let Ok(content) = content else { return Vec::new() };
    let Ok(parsed) = serde_json::from_str::<Value>(&content) else {
        return Vec::new();
    };
    let Some(obj) = parsed.as_object() else {
        return Vec::new();
    };
    obj.iter()
        .filter(|(cwd, id)| !cwd.is_empty() && id.as_str().is_some_and(|s| !s.is_empty()))
        .map(|(cwd, id)| {
            let conversation_id = id.as_str().unwrap().to_string();
            ConversationRef {
                cwd: cwd.clone(),
                transcript_path: base_dir
                    .join("brain")
                    .join(&conversation_id)
                    .join(".system_generated/logs/transcript.jsonl")
                    .to_string_lossy()
                    .into_owned(),
                conversation_id,
            }
        })
        .collect()
}
