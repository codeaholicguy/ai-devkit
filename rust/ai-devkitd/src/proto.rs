use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One JSON-RPC-ish request per line on the unix socket.
#[derive(Debug, Deserialize)]
pub struct Request {
    pub id: Option<u64>,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Serialize)]
pub struct Response {
    pub id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Response {
    pub fn ok(id: Option<u64>, result: Value) -> Self {
        Self {
            id,
            result: Some(result),
            error: None,
        }
    }
    pub fn err(id: Option<u64>, msg: impl Into<String>) -> Self {
        Self {
            id,
            result: None,
            error: Some(msg.into()),
        }
    }
}

/// Event pushed to subscribers. `seq` is the persisted log sequence number —
/// subscribers ack by seq to get at-least-once delivery.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub seq: u64,
    pub ts: i64,
    pub kind: String,
    pub payload: Value,
}
