//! Authoritative group operations. No runtime operations or legacy fallback.
use crate::rpc::RpcError;
use crate::server::Daemon;
use devkit_core::proto::{GroupMemberParams, GroupMembersParams, GroupNameParams};
use devkit_core::store::GroupError;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn parse<T: DeserializeOwned>(params: Value) -> Result<T, RpcError> {
    serde_json::from_value(params).map_err(|e| RpcError::invalid(e.to_string()))
}
fn domain(e: GroupError) -> RpcError {
    RpcError::new(e.code, e.message, Some(e.details))
}
pub fn run(d: &Daemon, method: &str, params: Value) -> Result<Value, RpcError> {
    if !matches!(
        method,
        "group.create"
            | "group.update"
            | "group.add"
            | "group.remove_agent"
            | "group.remove"
            | "group.list"
            | "group.detail"
            | "group.lookup"
    ) {
        return Err(RpcError::new(
            "unknown_method",
            format!("unknown method: {method}"),
            None,
        ));
    }
    // A failed startup import may be repaired without restarting the daemon.
    // Successful imports and cleanup attempts happen once per startup.
    let mut ready = d.groups_ready.lock().unwrap();
    if !*ready {
        match d.store.import_groups(&d.groups_source) {
            Ok(warning) => {
                *ready = true;
                if let Some(w) = warning {
                    tracing::warn!("{w}");
                }
            }
            Err(e) => return Err(domain(e)),
        }
    }
    drop(ready);
    let group = match method {
        "group.create" | "group.update" => {
            let p: GroupMembersParams = parse(params)?;
            if method == "group.create" {
                d.store.create_group(&p.name, p.members)
            } else {
                d.store.update_group(&p.name, p.members)
            }
        }
        "group.add" | "group.remove_agent" => {
            let p: GroupMemberParams = parse(params)?;
            if method == "group.add" {
                d.store.add_group_member(&p.name, &p.member)
            } else {
                d.store.remove_group_member(&p.name, &p.member)
            }
        }
        "group.remove" => {
            let p: GroupNameParams = parse(params)?;
            d.store.remove_group(&p.name).map_err(domain)?;
            return Ok(json!({"ok":true}));
        }
        "group.list" => {
            return serde_json::to_value(d.store.list_groups().map_err(domain)?)
                .map_err(RpcError::internal)
        }
        _ => {
            let p: GroupNameParams = parse(params)?;
            d.store.get_group(&p.name)
        }
    }
    .map_err(domain)?;
    serde_json::to_value(group).map_err(RpcError::internal)
}
