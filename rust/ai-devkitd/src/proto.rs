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
    #[serde(skip_serializing_if = "Option::is_none")]
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // The wire contract TS clients depend on — one JSON object per line.

    #[test]
    fn request_parses_minimal_and_full() {
        let r: Request = serde_json::from_str(r#"{"method":"ping"}"#).unwrap();
        assert_eq!(r.id, None);
        assert_eq!(r.method, "ping");
        assert_eq!(r.params, Value::Null); // params is optional

        let r: Request =
            serde_json::from_str(r#"{"id":7,"method":"registry.put","params":{"scope":"s"}}"#)
                .unwrap();
        assert_eq!(r.id, Some(7));
        assert_eq!(r.params["scope"], "s");
    }

    #[test]
    fn response_omits_absent_fields() {
        let ok = serde_json::to_string(&Response::ok(Some(1), json!({"x":1}))).unwrap();
        assert_eq!(ok, r#"{"id":1,"result":{"x":1}}"#);
        let err = serde_json::to_string(&Response::err(Some(2), "nope")).unwrap();
        assert_eq!(err, r#"{"id":2,"error":"nope"}"#);
        // No `id` field serialized for malformed-request errors.
        assert!(!serde_json::to_string(&Response::err(None, "bad"))
            .unwrap()
            .contains("\"id\""));
    }

    #[test]
    fn event_frame_shape_is_stable() {
        // Subscribers parse {"event": {...}} — field names are the contract.
        let ev = Event {
            seq: 3,
            ts: 1,
            kind: "agent.appeared".into(),
            payload: json!({"pid":1}),
        };
        let v: Value = serde_json::from_str(&serde_json::to_string(&ev).unwrap()).unwrap();
        for k in ["seq", "ts", "kind", "payload"] {
            assert!(v.get(k).is_some(), "missing field {k}");
        }
        let rt: Event = serde_json::from_str(&serde_json::to_string(&ev).unwrap()).unwrap();
        assert_eq!(rt.seq, 3);
    }
}
