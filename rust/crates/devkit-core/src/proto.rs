use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// One JSON-RPC-ish request per line on the unix socket.
#[derive(Debug, Deserialize, TS)]
pub struct Request {
    #[ts(optional, type = "number")]
    pub id: Option<u64>,
    pub method: String,
    #[serde(default)]
    #[ts(optional, type = "unknown")]
    pub params: Value,
}

#[derive(Debug, Serialize, TS)]
pub struct Response {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "unknown")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
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
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Event {
    #[ts(type = "number")]
    pub seq: u64,
    #[ts(type = "number")]
    pub ts: i64,
    pub kind: String,
    #[ts(type = "unknown")]
    pub payload: Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // The wire contract TS clients depend on — one JSON object per line.

    /// Regenerate packages/daemon-client/src/gen/*.ts. Deterministic: the
    /// output dir is anchored at CARGO_MANIFEST_DIR, not the test CWD, and
    /// `cargo test -p devkit-core` is the documented regen command.
    #[test]
    fn export_ts_bindings() {
        let out = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/daemon-client/src/gen");
        let cfg = ts_rs::Config::default().with_out_dir(&out);
        Request::export(&cfg).unwrap();
        Response::export(&cfg).unwrap();
        Event::export(&cfg).unwrap();
        crate::agent::EnrichedAgent::export(&cfg).unwrap();

        // ts-rs emits `import ... from "./X"` without the `.js` extension
        // this package's nodenext resolution requires — rewrite in place.
        for entry in std::fs::read_dir(&out).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().and_then(|e| e.to_str()) != Some("ts") {
                continue;
            }
            let src = std::fs::read_to_string(&path).unwrap();
            let mut fixed = String::with_capacity(src.len() + 16);
            for line in src.lines() {
                if line.contains("from \"./") && !line.contains(".js\"") {
                    fixed.push_str(&line.replacen("\";", ".js\";", 1));
                } else {
                    fixed.push_str(line);
                }
                fixed.push('\n');
            }
            std::fs::write(&path, fixed).unwrap();
        }
    }

    #[test]
    fn request_parses_minimal_and_full() {
        let r: Request = serde_json::from_str(r#"{"method":"ping"}"#).unwrap();
        assert_eq!(r.id, None);
        assert_eq!(r.method, "ping");
        assert_eq!(r.params, Value::Null); // params is optional

        let r: Request = serde_json::from_str(
            r#"{"id":7,"method":"subscribe","params":{"afterSeq":3}}"#,
        )
        .unwrap();
        assert_eq!(r.id, Some(7));
        assert_eq!(r.params["afterSeq"], 3);
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
