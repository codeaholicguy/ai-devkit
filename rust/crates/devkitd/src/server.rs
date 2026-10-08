use anyhow::Result;
use devkit_core::agent::EnrichedAgentsResult;
use devkit_core::proto::{Event, Request, Response};
use devkit_core::store::{chrono_now, Store};
use serde_json::{json, Value};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::broadcast;

pub struct Daemon {
    pub store: Arc<Store>,
    pub events: broadcast::Sender<Event>,
    pub started_at: i64,
    pub socket_path: PathBuf,
    pub enricher: devkit_harness::Registry,
    /// Enriched agents for ported harness types, refreshed per sweep so
    /// `agent.enriched` is O(1) over a prebuilt list.
    pub enriched: RwLock<EnrichedAgentsResult>,
    /// User home dir adapters resolve session trees (~/.claude, …) against.
    pub home: PathBuf,
}

impl Daemon {
    pub fn new(data_dir: &Path, socket_path: PathBuf, home: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(data_dir)?;
        let store = Store::open(&data_dir.join("daemon.db"))?;
        let (tx, _) = broadcast::channel(1024);
        Ok(Self {
            store: Arc::new(store),
            events: tx,
            started_at: chrono_now(),
            socket_path,
            enricher: devkit_harness::default_registry(&home),
            enriched: RwLock::new(EnrichedAgentsResult {
                agents: vec![],
                ported: vec![],
            }),
            home,
        })
    }

    fn emit(&self, kind: &str, payload: Value) {
        if let Ok(seq) = self.store.emit(kind, &payload) {
            let _ = self.events.send(Event {
                seq,
                ts: chrono_now(),
                kind: kind.to_string(),
                payload,
            });
        }
    }

    /// Handle one request line. Returns Err for a subscribed connection
    /// (handled inside dispatch by streaming, not a normal response).
    fn dispatch(&self, req: Request) -> Response {
        let id = req.id;
        match req.method.as_str() {
            "ping" => Response::ok(id, json!({"pong": true, "startedAt": self.started_at})),
            "daemon.status" => Response::ok(
                id,
                json!({
                    "version": env!("CARGO_PKG_VERSION"),
                    "startedAt": self.started_at,
                    "socket": self.socket_path,
                }),
            ),
            "registry.get" => {
                let scope = req.params["scope"].as_str().unwrap_or("channels");
                let name = req.params["name"].as_str();
                match self.store.registry_get(scope, name) {
                    Ok(v) => Response::ok(id, v),
                    Err(e) => Response::err(id, e.to_string()),
                }
            }
            "registry.put" => {
                let scope = req.params["scope"].as_str().unwrap_or("channels");
                let Some(name) = req.params["name"].as_str() else {
                    return Response::err(id, "params.name required");
                };
                let value = &req.params["value"];
                match self.store.registry_put(scope, name, value) {
                    Ok(()) => {
                        self.emit("registry.changed", json!({"scope": scope, "name": name}));
                        Response::ok(id, json!({"ok": true}))
                    }
                    Err(e) => Response::err(id, e.to_string()),
                }
            }
            "registry.delete" => {
                let scope = req.params["scope"].as_str().unwrap_or("channels");
                let Some(name) = req.params["name"].as_str() else {
                    return Response::err(id, "params.name required");
                };
                match self.store.registry_delete(scope, name) {
                    Ok(()) => {
                        self.emit(
                            "registry.changed",
                            json!({"scope": scope, "name": name, "deleted": true}),
                        );
                        Response::ok(id, json!({"ok": true}))
                    }
                    Err(e) => Response::err(id, e.to_string()),
                }
            }
            "agent.list" => match self.store.list_agents() {
                Ok(v) => Response::ok(id, Value::Array(v)),
                Err(e) => Response::err(id, e.to_string()),
            },
            "agent.enriched" => {
                let cached = self.enriched.read().unwrap().clone();
                Response::ok(id, serde_json::to_value(cached).unwrap())
            }
            "events.replay" => {
                let after = req.params["afterSeq"].as_u64().unwrap_or(0);
                let limit = req.params["limit"].as_u64().unwrap_or(1000) as u32;
                match self.store.events_after(after, limit) {
                    Ok(v) => Response::ok(id, serde_json::to_value(v).unwrap()),
                    Err(e) => Response::err(id, e.to_string()),
                }
            }
            "shutdown" => {
                // Caller expects a response before exit; schedule exit.
                tokio::spawn(async {
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                    std::process::exit(0);
                });
                Response::ok(id, json!({"ok": true}))
            }
            m => Response::err(id, format!("unknown method: {m}")),
        }
    }

    /// Apply a discovery sweep, refresh the enriched cache, and emit
    /// appear/vanish events.
    ///
    /// Runtime-named procs (node/bun — script-distributed harnesses) are
    /// swept but only visible when some adapter claims them, mirroring TS
    /// `isCandidateProcess` gating; dedicated-binary procs stay raw-visible
    /// so unported harnesses still surface.
    pub fn apply_sweep(&self) {
        let all = devkit_core::discover::sweep();
        let candidate_pids: std::collections::HashSet<i64> = all
            .iter()
            .filter(|p| self.enricher.any_can_handle(p))
            .map(|p| p.pid)
            .collect();
        let mut procs: Vec<_> = all
            .iter()
            .filter(|p| {
                !devkit_core::discover::is_runtime_command(p.command.as_deref().unwrap_or(""))
                    || candidate_pids.contains(&p.pid)
            })
            .cloned()
            .collect();
        devkit_core::discover::enrich_agents(&mut procs);
        let ctx = devkit_harness::SweepContext {
            processes: &procs,
            now: chrono_now(),
            home: &self.home,
        };
        *self.enriched.write().unwrap() = self.enricher.enrich(&ctx);
        if let Ok((appeared, gone)) = self.store.apply_agent_snapshot(&procs) {
            for pid in appeared {
                self.emit("agent.appeared", json!({"pid": pid}));
            }
            for pid in gone {
                self.emit("agent.disappeared", json!({"pid": pid}));
            }
        }
    }
}

/// SO_PEERCRED check: same-uid only. Returns true if the peer is us.
#[cfg(target_os = "linux")]
fn peer_is_same_user(stream: &UnixStream) -> bool {
    use std::os::unix::io::AsRawFd;
    let mut cred: libc::ucred = unsafe { std::mem::zeroed() };
    let mut len = std::mem::size_of::<libc::ucred>() as u32;
    let ok = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            &mut cred as *mut _ as *mut _,
            &mut len,
        )
    };
    ok == 0 && cred.uid == unsafe { libc::getuid() }
}

#[cfg(not(target_os = "linux"))]
fn peer_is_same_user(_stream: &UnixStream) -> bool {
    true
}

pub async fn serve(daemon: Arc<Daemon>) -> Result<()> {
    if daemon.socket_path.exists() {
        std::fs::remove_file(&daemon.socket_path)?;
    }
    let listener = UnixListener::bind(&daemon.socket_path)?;
    std::fs::set_permissions(&daemon.socket_path, std::fs::Permissions::from_mode(0o600))?;
    tracing::info!("listening on {}", daemon.socket_path.display());

    // Discovery loop: one sweep per interval for all subscribers.
    {
        let d = daemon.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_secs(2));
            loop {
                tick.tick().await;
                d.apply_sweep();
            }
        });
    }

    loop {
        let (stream, _) = listener.accept().await?;
        if !peer_is_same_user(&stream) {
            tracing::warn!("rejected cross-uid connection");
            continue;
        }
        let d = daemon.clone();
        tokio::spawn(async move {
            let _ = handle_conn(d, stream).await;
        });
    }
}

async fn handle_conn(daemon: Arc<Daemon>, stream: UnixStream) -> Result<()> {
    let (read, mut write) = stream.into_split();
    let mut lines = BufReader::new(read).lines();
    let mut sub: Option<broadcast::Receiver<Event>> = None;

    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Some(line) = line? else { return Ok(()); };
                let parsed: std::result::Result<Request, _> = serde_json::from_str(&line);
                match parsed {
                    Ok(req) if req.method == "subscribe" => {
                        let after = req.params["afterSeq"].as_u64().unwrap_or(0);
                        // Replay persisted events first (at-least-once), then live.
                        if let Ok(events) = daemon.store.events_after(after, 10_000) {
                            for ev in events {
                                let s = serde_json::to_string(&json!({"event": ev}))?;
                                write.write_all(s.as_bytes()).await?;
                                write.write_all(b"\n").await?;
                            }
                        }
                        sub = Some(daemon.events.subscribe());
                        let resp = Response::ok(req.id, json!({"subscribed": true}));
                        write.write_all(serde_json::to_string(&resp)?.as_bytes()).await?;
                        write.write_all(b"\n").await?;
                    }
                    Ok(req) => {
                        let resp = daemon.dispatch(req);
                        write.write_all(serde_json::to_string(&resp)?.as_bytes()).await?;
                        write.write_all(b"\n").await?;
                    }
                    Err(e) => {
                        let resp = Response::err(None, format!("bad request: {e}"));
                        write.write_all(serde_json::to_string(&resp)?.as_bytes()).await?;
                        write.write_all(b"\n").await?;
                    }
                }
            }
            ev = async {
                match sub.as_mut() {
                    Some(rx) => rx.recv().await.map_err(|_| ()),
                    None => std::future::pending().await,
                }
            } => {
                if let Ok(e) = ev {
                    let s = serde_json::to_string(&json!({"event": e}))?;
                    write.write_all(s.as_bytes()).await?;
                    write.write_all(b"\n").await?;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::UnixStream;

    async fn test_daemon() -> (Arc<Daemon>, PathBuf) {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "aidk-srv-{}-{}",
            std::process::id(),
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let sock = dir.join("d.sock");
        // Tests use the temp dir as home — no harness session trees there.
        let d = Arc::new(Daemon::new(&dir, sock.clone(), dir.clone()).unwrap());
        let d2 = d.clone();
        tokio::spawn(async move {
            let _ = serve(d2).await;
        });
        for _ in 0..100 {
            if sock.exists() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        (d, sock)
    }

    async fn rpc(sock: &PathBuf, line: &str) -> Value {
        let mut s = UnixStream::connect(sock).await.unwrap();
        s.write_all(line.as_bytes()).await.unwrap();
        s.write_all(b"\n").await.unwrap();
        let mut lines = BufReader::new(s).lines();
        serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap()
    }

    #[tokio::test]
    async fn end_to_end_rpc_subscribe_replay_and_live() {
        let (d, sock) = test_daemon().await;

        let r = rpc(&sock, r#"{"id":1,"method":"registry.put","params":{"scope":"channels","name":"a","value":{"t":1}}}"#).await;
        assert_eq!(r["result"]["ok"], true);

        // Subscribe from seq 0: the persisted event replays before live frames.
        let mut s = UnixStream::connect(&sock).await.unwrap();
        s.write_all(br#"{"id":2,"method":"subscribe","params":{"afterSeq":0}}"#.as_ref())
            .await
            .unwrap();
        s.write_all(b"\n").await.unwrap();
        let mut lines = BufReader::new(s).lines();
        // Replay may include discovery events (the sweep ticks immediately);
        // read until the subscribe ack, collecting replayed events.
        let mut saw_registry_changed = false;
        loop {
            let line: Value =
                serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
            if line["result"]["subscribed"] == true {
                break;
            }
            if line["event"]["kind"] == "registry.changed" {
                saw_registry_changed = true;
            }
        }
        assert!(saw_registry_changed);

        let d2 = d.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            let seq = d2.store.emit("test.ping", &json!({})).unwrap();
            let _ = d2.events.send(devkit_core::proto::Event {
                seq,
                ts: 0,
                kind: "test.ping".into(),
                payload: json!({}),
            });
        });
        // Live stream may interleave discovery events; wait for ours.
        let mut saw_ping = false;
        for _ in 0..50 {
            let line: Value =
                serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
            if line["event"]["kind"] == "test.ping" {
                saw_ping = true;
                break;
            }
        }
        assert!(saw_ping);
    }

    #[tokio::test]
    async fn agent_enriched_returns_cached_result() {
        let (d, sock) = test_daemon().await;
        let r = rpc(&sock, r#"{"id":1,"method":"agent.enriched"}"#).await;
        // Live sweep may surface real claude processes on the dev machine —
        // the contract is the shape, not emptiness.
        assert!(r["result"]["agents"].is_array());
        assert_eq!(
            r["result"]["ported"],
            json!(["claude", "codex", "pi", "gemini_cli", "copilot"])
        );

        // A registered adapter would surface through the same cache; I0
        // verifies the cache is what apply_sweep refreshes.
        *d.enriched.write().unwrap() = devkit_core::agent::EnrichedAgentsResult {
            agents: vec![],
            ported: vec!["claude".into(), "codex".into(), "pi".into(), "gemini_cli".into(), "copilot".into()],
        };
        let r = rpc(&sock, r#"{"id":2,"method":"agent.enriched"}"#).await;
        assert_eq!(
            r["result"]["ported"],
            json!(["claude", "codex", "pi", "gemini_cli", "copilot"])
        );
    }

    #[tokio::test]
    async fn malformed_line_and_unknown_method_error_without_killing_conn() {
        let (_d, sock) = test_daemon().await;
        let mut s = UnixStream::connect(&sock).await.unwrap();
        s.write_all(b"not json\n").await.unwrap();
        s.write_all(br#"{"id":9,"method":"nope"}"#.as_ref())
            .await
            .unwrap();
        s.write_all(b"\n").await.unwrap();
        let mut lines = BufReader::new(s).lines();
        let e1: Value = serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert!(e1["error"].is_string());
        let e2: Value = serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
        assert!(e2["error"].as_str().unwrap().contains("unknown method"));
    }
}
