//! RPC method implementations — one module per wire namespace
//! (`agent.*` → `rpc::agent`), one file per method inside it.

pub mod agent;

use serde_json::Value;

/// Wire-facing error: code + message + structured details, mapped onto
/// `Response.code`/`details`/`error` by the dispatcher.
#[derive(Debug)]
pub struct RpcError {
    pub code: &'static str,
    pub message: String,
    pub details: Option<Value>,
}

impl RpcError {
    pub fn new(code: &'static str, message: impl Into<String>, details: Option<Value>) -> Self {
        Self {
            code,
            message: message.into(),
            details,
        }
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new("invalid_params", message, None)
    }
    pub fn internal(e: impl std::fmt::Display) -> Self {
        Self::new("internal", e.to_string(), None)
    }
}
