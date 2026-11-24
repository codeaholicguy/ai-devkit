//! Authoritative group operations. No runtime operations or legacy fallback.
use crate::rpc::RpcError;
use crate::server::Daemon;
use devkit_core::proto::{GroupMemberParams, GroupMembersParams, GroupNameParams};
use devkit_core::store::GroupError;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn parse<T: DeserializeOwned>(params: Value) -> Result<T, RpcError> {
    serde_json::from_value(params).map_err(|err| RpcError::invalid(err.to_string()))
}

fn domain(err: GroupError) -> RpcError {
    RpcError::new(err.code, err.message, Some(err.details))
}

/// Retry a failed startup import before serving any group RPC.
/// Successful imports and cleanup attempts happen once per startup.
fn ensure_groups_ready(daemon: &Daemon) -> Result<(), RpcError> {
    let mut ready = daemon.groups_ready.lock().unwrap();
    if !*ready {
        match daemon.store.import_groups(&daemon.groups_source) {
            Ok(warning) => {
                *ready = true;
                if let Some(msg) = warning {
                    tracing::warn!("{msg}");
                }
            }
            Err(err) => return Err(domain(err)),
        }
    }
    Ok(())
}

pub fn run(daemon: &Daemon, method: &str, params: Value) -> Result<Value, RpcError> {
    let is_known = matches!(
        method,
        "group.create"
            | "group.update"
            | "group.add"
            | "group.remove_agent"
            | "group.remove"
            | "group.list"
            | "group.detail"
            | "group.lookup"
    );
    if !is_known {
        return Err(RpcError::new(
            "unknown_method",
            format!("unknown method: {method}"),
            None,
        ));
    }
    ensure_groups_ready(daemon)?;

    let group = match method {
        "group.create" => {
            let p: GroupMembersParams = parse(params)?;
            daemon.store.create_group(&p.name, p.members)
        }
        "group.update" => {
            let p: GroupMembersParams = parse(params)?;
            daemon.store.update_group(&p.name, p.members)
        }
        "group.add" => {
            let p: GroupMemberParams = parse(params)?;
            daemon.store.add_group_member(&p.name, &p.member)
        }
        "group.remove_agent" => {
            let p: GroupMemberParams = parse(params)?;
            daemon.store.remove_group_member(&p.name, &p.member)
        }
        "group.remove" => {
            let p: GroupNameParams = parse(params)?;
            daemon.store.remove_group(&p.name).map_err(domain)?;
            return Ok(json!({ "ok": true }));
        }
        "group.list" => {
            let groups = daemon.store.list_groups().map_err(domain)?;
            return serde_json::to_value(groups).map_err(RpcError::internal);
        }
        "group.detail" | "group.lookup" => {
            let p: GroupNameParams = parse(params)?;
            daemon.store.get_group(&p.name)
        }
        _ => unreachable!("method validated above"),
    }
    .map_err(domain)?;

    serde_json::to_value(group).map_err(RpcError::internal)
}
