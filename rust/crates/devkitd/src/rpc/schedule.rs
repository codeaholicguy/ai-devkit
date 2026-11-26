//! Daemon-owned scheduled send operations (`schedule.create/list/cancel`).
use crate::rpc::RpcError;
use crate::server::Daemon;
use devkit_core::proto::{ScheduleCancelParams, ScheduleCreateParams, ScheduleListParams};
use devkit_core::store::{ScheduleError, ScheduleFilter};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

fn parse<T: DeserializeOwned>(params: Value) -> Result<T, RpcError> {
    serde_json::from_value(params).map_err(|err| RpcError::invalid(err.to_string()))
}

fn domain(err: ScheduleError) -> RpcError {
    RpcError::new(err.code, err.message, Some(err.details))
}

pub fn run(daemon: &Daemon, method: &str, params: Value) -> Result<Value, RpcError> {
    match method {
        "schedule.create" => {
            let p: ScheduleCreateParams = parse(params)?;
            let created = daemon
                .store
                .create_schedule(
                    &p.agent_name,
                    &p.message,
                    &p.due_at,
                    p.created_by.as_deref(),
                )
                .map_err(domain)?;
            serde_json::to_value(created).map_err(RpcError::internal)
        }
        "schedule.list" => {
            let p: ScheduleListParams = if params.is_null() {
                ScheduleListParams::default()
            } else {
                parse(params)?
            };
            let filter = ScheduleFilter {
                status: p.status,
                agent_name: p.agent_name,
                limit: p.limit,
            };
            let items = daemon.store.list_schedules(&filter).map_err(domain)?;
            serde_json::to_value(items).map_err(RpcError::internal)
        }
        "schedule.cancel" => {
            let p: ScheduleCancelParams = parse(params)?;
            let id = p.id.trim();
            if daemon.in_flight_schedules.lock().unwrap().contains(id) {
                return Err(RpcError::new(
                    "not_cancellable",
                    format!("Cannot cancel scheduled send \"{id}\": currently being delivered."),
                    Some(json!({ "id": id, "status": "delivering" })),
                ));
            }
            let cancelled = daemon.store.cancel_schedule(id).map_err(domain)?;
            serde_json::to_value(cancelled).map_err(RpcError::internal)
        }
        _ => Err(RpcError::new(
            "unknown_method",
            format!("unknown method: {method}"),
            None,
        )),
    }
}
