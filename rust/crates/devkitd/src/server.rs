use anyhow::Result;
use devkit_core::agent::EnrichedAgent;
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
    /// Serializes store.emit + broadcast send so subscribers always observe
    /// events in seq order — seqs are assigned under the store mutex but the
    /// send happens after emit returns, so two racing emits could otherwise
    /// broadcast out of order.
    emit_mutex: std::sync::Mutex<()>,
    pub started_at: i64,
    pub socket_path: PathBuf,
    pub enricher: devkit_harness::Registry,
    /// Fully attributed agents refreshed per sweep so `agent.list` is
    /// O(1) over a prebuilt list.
    pub enriched: RwLock<Vec<EnrichedAgent>>,
    /// User home dir adapters resolve session trees (~/.claude, …) against.
    pub home: PathBuf,
    /// Serializes agent.start so name-uniqueness can't race.
    pub start_mutex: std::sync::Mutex<()>,
}

impl Daemon {
    pub fn new(data_dir: &Path, socket_path: PathBuf, home: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(data_dir)?;
        // The db may one day hold sensitive state — the socket is
        // already 0600, tighten the directory so wal/shm sidecars (created
        // per open with default umask) aren't world-readable either.
        let _ = std::fs::set_permissions(data_dir, std::fs::Permissions::from_mode(0o700));
        let db = data_dir.join("daemon.db");
        // A corrupt db previously killed devkitd on open — and autostart
        // would respawn it on every call into the same crash. Quarantine
        // once and start over with a fresh file.
        let store = match Store::open(&db) {
            Ok(s) => s,
            Err(e) => {
                let backup = format!("daemon.db.corrupt-{}", chrono_now());
                tracing::warn!("daemon.db failed to open ({e:#}); moving to {backup}");
                for side in ["", "-wal", "-shm"] {
                    let src = data_dir.join(format!("daemon.db{side}"));
                    if src.exists() {
                        let _ = std::fs::rename(&src, data_dir.join(format!("{backup}{side}")));
                    }
                }
                Store::open(&db)?
            }
        };
        let (tx, _) = broadcast::channel(1024);
        let store = Arc::new(store);
        // Legacy agents.db bridge: adopt pre-migration registrations as
        // tombstones, then dual-write future starts back so unmigrated TS
        // consumers keep resolving agents.
        store.set_legacy_db(data_dir.join("agents.db"))?;
        if let Err(e) = store.import_legacy_agents() {
            tracing::warn!("legacy agents.db import failed: {e:#}");
        }
        Ok(Self {
            store,
            events: tx,
            emit_mutex: std::sync::Mutex::new(()),
            started_at: chrono_now(),
            socket_path,
            enricher: devkit_harness::default_registry(&home),
            enriched: RwLock::new(Vec::new()),
            home,
            start_mutex: std::sync::Mutex::new(()),
        })
    }

    pub(crate) fn emit(&self, kind: &str, payload: Value) {
        let _g = self.emit_mutex.lock().unwrap();
        match self.store.emit(kind, &payload) {
            Ok(seq) => {
                // send() only fails when there are no subscribers — normal.
                let _ = self.events.send(Event {
                    seq,
                    ts: chrono_now(),
                    kind: kind.to_string(),
                    payload,
                });
            }
            Err(e) => tracing::warn!("event emit failed ({kind}): {e:#}"),
        }
    }

    /// Handle one request line. Returns Err for a subscribed connection
    /// (handled inside dispatch by streaming, not a normal response).
    fn dispatch(&self, req: Request) -> Response {
        let id = req.id;
        match req.method.as_str() {
            "ping" => Response::ok(id, json!({"pong": true, "startedAt": self.started_at})),
            "daemon.status" => {
                let mut status = identity();
                status["startedAt"] = json!(self.started_at);
                status["socket"] = json!(self.socket_path);
                status["pid"] = json!(std::process::id());
                Response::ok(id, status)
            }
            "agent.list" => {
                let cached = self.enriched.read().unwrap().clone();
                Response::ok(id, serde_json::to_value(cached).unwrap())
            }
            "agent.start" => {
                let params = match Self::parse_params::<devkit_core::proto::AgentStartParams>(
                    &req,
                    "agent.start",
                ) {
                    Ok(p) => p,
                    Err(resp) => return *resp,
                };
                match crate::rpc::agent::start::run_with(
                    self,
                    params,
                    &crate::runtime::Runtimes::default(),
                ) {
                    Ok(result) => {
                        Response::ok(id, serde_json::to_value(result).unwrap_or_default())
                    }
                    Err(e) => Response::err_coded(id, e.code, e.message, e.details),
                }
            }
            "agent.lookup" | "agent.unregister" => {
                let params = match Self::parse_params::<devkit_core::proto::AgentNameParams>(
                    &req,
                    &req.method,
                ) {
                    Ok(p) => p,
                    Err(resp) => return *resp,
                };
                let result = if req.method == "agent.lookup" {
                    crate::rpc::agent::lookup::run(self, params).map(serde_json::to_value)
                } else {
                    crate::rpc::agent::unregister::run(self, params).map(serde_json::to_value)
                };
                match result {
                    Ok(v) => Response::ok(id, v.unwrap_or_default()),
                    Err(e) => Response::err_coded(id, e.code, e.message, e.details),
                }
            }
            "agent.rename" => {
                let params = match Self::parse_params::<devkit_core::proto::AgentRenameParams>(
                    &req,
                    "agent.rename",
                ) {
                    Ok(p) => p,
                    Err(resp) => return *resp,
                };
                match crate::rpc::agent::rename::run(self, params) {
                    Ok(r) => Response::ok(id, serde_json::to_value(r).unwrap_or_default()),
                    Err(e) => Response::err_coded(id, e.code, e.message, e.details),
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

    /// Parse `req.params` into `T`, mapping failure onto an
    /// `invalid_params` coded response. Every method arm uses this —
    /// keeps the serde error text uniform.
    fn parse_params<T>(req: &Request, method: &str) -> Result<T, Box<Response>>
    where
        T: serde::de::DeserializeOwned,
    {
        serde_json::from_value(req.params.clone()).map_err(|e| {
            Box::new(Response::err_coded(
                req.id,
                "invalid_params",
                format!("invalid {method} params: {e}"),
                None,
            ))
        })
    }

    /// Apply a discovery sweep, refresh the enriched cache, and emit
    /// appear/vanish events.
    ///
    /// Runtime-named procs (node/bun — script-distributed harnesses) are
    /// swept but only visible when some adapter claims them, mirroring TS
    /// `isCandidateProcess` gating; dedicated-binary procs stay raw-visible
    /// so unported harnesses still surface.
    pub fn apply_sweep(&self) {
        let Some(all) = devkit_core::discover::sweep() else {
            // ps failed — keep the last good snapshot rather than wiping the
            // agent table and storming phantom disappeared/appeared events.
            tracing::warn!("discovery sweep failed; keeping previous snapshot");
            return;
        };
        tracing::trace!(procs = all.len(), "sweep");
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
        // pid→session file from the harness mapping files (pi/codex
        // sessions.json, claude pid files) — needs start times for claude's
        // pid-reuse check, and is persisted by apply_agent_snapshot below.
        devkit_core::session_map::resolve_session_files(&mut procs, &self.home);
        let ctx = devkit_harness::SweepContext {
            processes: &procs,
            now: chrono_now(),
            home: &self.home,
        };
        // Compute outside the lock: `*w = f()` evaluates the write guard first
        // and would hold it for the entire enrich pass.
        let mut enriched = self.enricher.enrich(&ctx);
        // Registry overlay: daemon-registered names/pins win over adapter-
        // derived labels. Tombstones excluded (dead rows don't label live
        // observations).
        if let Ok(overlays) = self.store.registry_overlays() {
            for a in enriched.iter_mut() {
                if let Some((name, pinned)) = overlays.get(&(a.pid as i64)) {
                    a.name = name.clone();
                    a.pinned = Some(*pinned);
                }
            }
        }
        // Keep the previous list: a disappeared pid is absent from the fresh
        // one, so its event payload carries last-known agent info.
        let prev = std::mem::replace(&mut *self.enriched.write().unwrap(), enriched);
        match self.store.apply_agent_snapshot(&procs) {
            Ok((appeared, gone)) => {
                let cur = self.enriched.read().unwrap();
                // Disappeared first: on pid reuse the stale identity must
                // leave before the fresh one arrives or subscribers see them
                // inverted.
                for pid in gone {
                    self.emit("agent.disappeared", lifecycle_payload(pid, &prev));
                }
                for &pid in &appeared {
                    self.emit("agent.appeared", lifecycle_payload(pid, &cur));
                }
                for payload in status_changes(&prev, &cur) {
                    self.emit("agent.status_changed", payload);
                }
                for payload in session_attaches(&prev, &cur, &appeared) {
                    self.emit("agent.session_attached", payload);
                }
            }
            Err(e) => tracing::warn!("agent snapshot apply failed: {e:#}"),
        }
    }
}

/// Payload for agent lifecycle events: the pid plus every enriched row the
/// sweep attributed to it (one proc can map to several sessions; unattributed
/// procs get an empty `agents`).
fn lifecycle_payload(pid: i64, agents: &[EnrichedAgent]) -> Value {
    json!({
        "pid": pid,
        "agents": agents.iter().filter(|a| a.pid as i64 == pid).collect::<Vec<_>>(),
    })
}

/// Payloads for `agent.status_changed`: one per (pid, session) row present in
/// both sweeps whose status differs. Rows on only one side are lifecycle
/// changes, already covered by appeared/disappeared.
fn status_changes(prev: &[EnrichedAgent], cur: &[EnrichedAgent]) -> Vec<Value> {
    cur.iter()
        .filter_map(|a| {
            let p = prev
                .iter()
                .find(|p| p.pid == a.pid && p.session_id == a.session_id)?;
            (p.status != a.status).then(|| {
                json!({
                    "pid": a.pid,
                    "sessionId": a.session_id,
                    "from": p.status,
                    "to": a.status,
                    "agent": a,
                })
            })
        })
        .collect()
}

/// Payloads for `agent.session_attached`: one per session-backed row of a
/// pid seen last sweep that had no row with that session id. Covers a
/// session file landing after the process appeared (#405) and a new session
/// on a live pid; status_changes misses both because the session id moved.
/// Pids in `appeared` are skipped: agent.appeared already carries them.
fn session_attaches(prev: &[EnrichedAgent], cur: &[EnrichedAgent], appeared: &[i64]) -> Vec<Value> {
    cur.iter()
        .filter(|a| a.session_file_path.is_some() && !appeared.contains(&(a.pid as i64)))
        .filter(|a| prev.iter().any(|p| p.pid == a.pid))
        .filter(|a| {
            !prev
                .iter()
                .any(|p| p.pid == a.pid && p.session_id == a.session_id)
        })
        .map(|a| {
            json!({
                "pid": a.pid,
                "sessionId": a.session_id,
                "sessionFilePath": a.session_file_path,
                "agent": a,
            })
        })
        .collect()
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

/// Release identity of this binary: the platform package version that
/// publish-devkitd.yml stamps via `DEVKITD_BUILD_VERSION`. `None` for local
/// cargo builds. The crate `version` alone can't tell package releases
/// apart (#376) — clients compare `buildVersion` to detect a stale daemon.
pub const BUILD_VERSION: Option<&str> = option_env!("DEVKITD_BUILD_VERSION");

/// Shared by `daemon.status` and `devkitd version` so a client can compare
/// the running daemon against the binary it would spawn.
pub fn identity() -> Value {
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "buildVersion": BUILD_VERSION,
    })
}

pub async fn serve(daemon: Arc<Daemon>) -> Result<()> {
    if daemon.socket_path.exists() {
        // Refuse to displace a live daemon: unlinking the socket file leaves
        // the old process sweeping and writing daemon.db invisibly — two
        // daemons, one reachable. Only a dead owner's file is unlinked.
        match std::os::unix::net::UnixStream::connect(&daemon.socket_path) {
            Ok(_) => anyhow::bail!("devkitd already running"),
            Err(_) => std::fs::remove_file(&daemon.socket_path)?,
        }
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
                // Sweeps are synchronous fs/process work; run them on the
                // blocking pool so a long pass never stalls request handlers.
                let d = d.clone();
                if let Err(e) = tokio::task::spawn_blocking(move || d.apply_sweep()).await {
                    // A panicking sweep would otherwise kill discovery
                    // silently — the daemon looks healthy while going stale.
                    tracing::warn!("sweep task failed: {e}");
                }
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
            if let Err(e) = handle_conn(d, stream).await {
                tracing::debug!("connection closed with error: {e:#}");
            }
        });
    }
}

/// Methods cheap enough to run on the async worker — everything else goes
/// to the blocking pool so a slow probe can't stall other connections.
const INLINE_METHODS: &[&str] = &["ping", "daemon.status", "agent.list"];

/// Cap on request bytes per connection. Requests are single-line JSON; a
/// subscription conn sends exactly one. Bounds the line buffer a hostile
/// or buggy client can grow by streaming without a newline.
const MAX_REQUEST_BYTES: u64 = 4 << 20;

async fn handle_conn(daemon: Arc<Daemon>, stream: UnixStream) -> Result<()> {
    use tokio::io::AsyncReadExt;
    let (read, mut write) = stream.into_split();
    let mut lines = BufReader::new(read.take(MAX_REQUEST_BYTES)).lines();
    let mut sub: Option<broadcast::Receiver<Event>> = None;
    // Highest seq delivered on this connection — replay sets the floor and
    // live frames advance it, so nothing is sent twice or skipped.
    let mut last_delivered: u64 = 0;

    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Some(line) = line? else { return Ok(()); };
                let parsed: std::result::Result<Request, _> = serde_json::from_str(&line);
                match parsed {
                    Ok(req) if req.method == "subscribe" => {
                        let after = req.params["afterSeq"].as_u64().unwrap_or(0);
                        // Live UIs pass liveOnly — replaying the persisted
                        // log would only trigger redundant refreshes.
                        let live_only = req.params["liveOnly"].as_bool().unwrap_or(false);
                        // Subscribe BEFORE replaying: events emitted during the
                        // replay land in the receiver's buffer instead of the
                        // old replay→subscribe gap. Replayed seqs become the
                        // delivery floor, so buffered live frames that overlap
                        // the replay are dropped rather than sent twice.
                        let rx = daemon.events.subscribe();
                        if !live_only {
                            match daemon.store.events_after(after, 10_000) {
                                Ok(events) => {
                                    for ev in events {
                                        last_delivered = last_delivered.max(ev.seq);
                                        let s = serde_json::to_string(&json!({"event": ev}))?;
                                        write.write_all(s.as_bytes()).await?;
                                        write.write_all(b"\n").await?;
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!("subscribe replay failed: {e:#}")
                                }
                            }
                        }
                        last_delivered = last_delivered.max(after);
                        sub = Some(rx);
                        let resp = Response::ok(req.id, json!({"subscribed": true}));
                        write.write_all(serde_json::to_string(&resp)?.as_bytes()).await?;
                        write.write_all(b"\n").await?;
                    }
                    Ok(req) => {
                        // Keep synchronous dispatch off the async workers —
                        // the blocking pool absorbs any method that does
                        // real work so connections stay responsive.
                        let d = daemon.clone();
                        let resp = if INLINE_METHODS.contains(&req.method.as_str()) {
                            d.dispatch(req)
                        } else {
                            tokio::task::spawn_blocking(move || d.dispatch(req)).await?
                        };
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
                    Some(rx) => rx.recv().await,
                    None => std::future::pending().await,
                }
            } => {
                match ev {
                    Ok(e) => {
                        if e.seq > last_delivered {
                            last_delivered = e.seq;
                            let s = serde_json::to_string(&json!({"event": e}))?;
                            write.write_all(s.as_bytes()).await?;
                            write.write_all(b"\n").await?;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        // The 1024-event buffer overflowed — frames are gone.
                        // Tell the client so it refetches state instead of
                        // silently missing history. seq=0 keeps it below
                        // last_delivered so it never counts as delivered.
                        tracing::warn!("subscriber lagged {n} events behind");
                        let hint = json!({"event": {
                            "seq": 0,
                            "ts": chrono_now(),
                            "kind": "subscription.lagged",
                            "payload": {"dropped": n},
                        }});
                        write.write_all(serde_json::to_string(&hint)?.as_bytes()).await?;
                        write.write_all(b"\n").await?;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        return Ok(());
                    }
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

    /// A daemon that is not serving, so no discovery loop rewrites its cache.
    fn unserved_daemon() -> (Arc<Daemon>, PathBuf) {
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
        (d, sock)
    }

    async fn test_daemon() -> (Arc<Daemon>, PathBuf) {
        let (d, sock) = unserved_daemon();
        d.apply_sweep(); // warm the cache like main() does before serving
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

        // Persisted directly so subscribe replays it — registry writes no
        // longer emit events of their own.
        d.store.emit("test.base", &json!({})).unwrap();

        // Subscribe from seq 0: the persisted event replays before live frames.
        let mut s = UnixStream::connect(&sock).await.unwrap();
        s.write_all(br#"{"id":2,"method":"subscribe","params":{"afterSeq":0}}"#.as_ref())
            .await
            .unwrap();
        s.write_all(b"\n").await.unwrap();
        let mut lines = BufReader::new(s).lines();
        // Replay may include discovery events (the sweep ticks immediately);
        // read until the subscribe ack, collecting replayed events.
        let mut saw_base = false;
        loop {
            let line: Value =
                serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
            if line["result"]["subscribed"] == true {
                break;
            }
            if line["event"]["kind"] == "test.base" {
                saw_base = true;
            }
        }
        assert!(saw_base);

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
    async fn daemon_status_reports_build_identity_and_pid() {
        let (_d, sock) = test_daemon().await;
        let resp = rpc(&sock, r#"{"id":3,"method":"daemon.status"}"#).await;
        let r = &resp["result"];
        assert_eq!(r["version"], env!("CARGO_PKG_VERSION"));
        // Unstamped local builds report null, never omit the key — clients
        // read a missing key as a pre-#376 daemon.
        assert!(r.as_object().unwrap().contains_key("buildVersion"));
        assert_eq!(r["buildVersion"], json!(BUILD_VERSION));
        assert_eq!(r["pid"], std::process::id());
    }

    #[tokio::test]
    async fn serve_refuses_to_displace_a_live_daemon() {
        let (d, sock) = test_daemon().await;
        let d2 = Arc::new(Daemon::new(&d.home, sock.clone(), d.home.clone()).unwrap());
        let err = serve(d2).await.unwrap_err();
        assert!(err.to_string().contains("already running"));
        // The original daemon still answers on the socket.
        let resp = rpc(&sock, r#"{"id":9,"method":"ping"}"#).await;
        assert_eq!(resp["result"]["pong"], true);
    }

    #[tokio::test]
    async fn subscribe_filters_live_frames_at_or_below_the_replayed_floor() {
        let (d, sock) = test_daemon().await;

        // Persist one event so the replay sets a nonzero delivery floor.
        let replayed_seq = d.store.emit("floor.base", &json!({})).unwrap();

        let mut s = UnixStream::connect(&sock).await.unwrap();
        s.write_all(br#"{"id":1,"method":"subscribe","params":{"afterSeq":0}}"#.as_ref())
            .await
            .unwrap();
        s.write_all(b"\n").await.unwrap();
        let mut lines = BufReader::new(s).lines();
        loop {
            let line: Value =
                serde_json::from_str(&lines.next_line().await.unwrap().unwrap()).unwrap();
            if line["result"]["subscribed"] == true {
                break;
            }
        }

        // A live frame carrying an already-delivered seq — the case the
        // replay→subscribe overlap produces — must be dropped; a fresh seq
        // must pass through.
        let _ = d.events.send(Event {
            seq: replayed_seq,
            ts: 0,
            kind: "floor.stale".into(),
            payload: json!({}),
        });
        let fresh_seq = d.store.emit("floor.fresh", &json!({})).unwrap();
        let _ = d.events.send(Event {
            seq: fresh_seq,
            ts: 0,
            kind: "floor.fresh".into(),
            payload: json!({}),
        });

        let mut saw_stale = false;
        let mut saw_fresh = false;
        for _ in 0..50 {
            let line: Value = serde_json::from_str(
                &tokio::time::timeout(std::time::Duration::from_secs(2), lines.next_line())
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap(),
            )
            .unwrap();
            match line["event"]["kind"].as_str() {
                Some("floor.stale") => saw_stale = true,
                Some("floor.fresh") => {
                    saw_fresh = true;
                    break;
                }
                _ => {}
            }
        }
        assert!(saw_fresh);
        assert!(!saw_stale);
    }

    #[tokio::test]
    async fn agent_list_returns_cached_result() {
        let (_, sock) = test_daemon().await;
        let r = rpc(&sock, r#"{"id":1,"method":"agent.list"}"#).await;
        // Live sweep may surface real claude processes on the dev machine —
        // the contract is a bare array, not a wrapper.
        assert!(r["result"].is_array());
        assert!(r["result"]["ported"].is_null());

        // The cache is what apply_sweep refreshes — write directly and
        // verify the RPC serves exactly that. Unserved: on a serving daemon
        // the 2s discovery loop can overwrite the cache before the request.
        let (d, _) = unserved_daemon();
        *d.enriched.write().unwrap() = vec![EnrichedAgent {
            name: "t".into(),
            agent_type: "claude".into(),
            status: "idle".into(),
            summary: String::new(),
            pid: 1,
            project_path: "/p".into(),
            session_id: "s".into(),
            last_active: "2026-10-09T00:00:00.000Z".into(),
            pinned: None,
            session_file_path: None,
        }];
        let req = serde_json::from_str(r#"{"id":2,"method":"agent.list"}"#).unwrap();
        let r = serde_json::to_value(d.dispatch(req)).unwrap();
        assert_eq!(r["result"].as_array().unwrap().len(), 1);
        assert_eq!(r["result"][0]["name"], "t");
        assert_eq!(r["result"][0]["type"], "claude");
    }

    #[test]
    fn lifecycle_payload_carries_agent_rows_for_the_pid() {
        let row = |pid: u64, sid: &str| EnrichedAgent {
            name: "n".into(),
            agent_type: "claude".into(),
            status: "idle".into(),
            summary: String::new(),
            pid,
            project_path: "/p".into(),
            session_id: sid.into(),
            last_active: "t".into(),
            pinned: None,
            session_file_path: None,
        };
        let list = vec![row(7, "s-1"), row(7, "s-2"), row(9, "other")];

        // Multi-session procs surface every attributed row.
        let p = lifecycle_payload(7, &list);
        assert_eq!(p["pid"], json!(7));
        assert_eq!(p["agents"].as_array().unwrap().len(), 2);
        assert_eq!(p["agents"][0]["sessionId"], "s-1");

        // Unattributed procs still emit — with an empty agent list.
        assert_eq!(lifecycle_payload(5, &list)["agents"], json!([]));
    }

    #[test]
    fn status_changes_reports_rows_whose_status_moved() {
        let row = |pid: u64, sid: &str, status: &str| EnrichedAgent {
            name: "n".into(),
            agent_type: "claude".into(),
            status: status.into(),
            summary: String::new(),
            pid,
            project_path: "/p".into(),
            session_id: sid.into(),
            last_active: "t".into(),
            pinned: None,
            session_file_path: None,
        };
        let prev = vec![
            row(7, "s-1", "running"),
            row(7, "s-2", "running"),
            row(8, "s", "idle"),
            row(9, "gone", "running"),
        ];
        let cur = vec![
            row(7, "s-1", "waiting"),
            row(7, "s-2", "running"),
            row(8, "s", "idle"),
            row(10, "new", "waiting"),
        ];

        // Sessions of one pid are matched independently; unchanged rows and
        // rows present on only one side (lifecycle events) are skipped.
        let changes = status_changes(&prev, &cur);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0]["pid"], json!(7));
        assert_eq!(changes[0]["sessionId"], "s-1");
        assert_eq!(changes[0]["from"], "running");
        assert_eq!(changes[0]["to"], "waiting");
        assert_eq!(changes[0]["agent"]["status"], "waiting");

        assert!(status_changes(&cur, &cur).is_empty());
    }

    #[test]
    fn session_attaches_reports_new_session_rows_of_known_pids() {
        let row = |pid: u64, sid: &str, file: Option<&str>| EnrichedAgent {
            name: "n".into(),
            agent_type: "codex".into(),
            status: "waiting".into(),
            summary: String::new(),
            pid,
            project_path: "/p".into(),
            session_id: sid.into(),
            last_active: "t".into(),
            pinned: None,
            session_file_path: file.map(Into::into),
        };
        let prev = vec![
            row(7, "pid-7", None),
            row(8, "s-8", Some("/s/8.jsonl")),
            row(9, "s-9", Some("/s/9.jsonl")),
            row(11, "pid-11", None),
        ];
        let cur = vec![
            // Session file landed after the process appeared.
            row(7, "s-7", Some("/s/7.jsonl")),
            // Unchanged session.
            row(8, "s-8", Some("/s/8.jsonl")),
            // New session on a live pid (e.g. /clear).
            row(9, "s-9b", Some("/s/9b.jsonl")),
            // Brand-new pid: covered by agent.appeared.
            row(10, "s-10", Some("/s/10.jsonl")),
            // Reused pid: covered by agent.appeared.
            row(11, "s-11", Some("/s/11.jsonl")),
        ];

        let attached = session_attaches(&prev, &cur, &[10, 11]);
        let pids: Vec<_> = attached.iter().map(|a| a["pid"].clone()).collect();
        assert_eq!(pids, vec![json!(7), json!(9)]);
        assert_eq!(attached[0]["sessionId"], "s-7");
        assert_eq!(attached[0]["sessionFilePath"], "/s/7.jsonl");
        assert_eq!(attached[0]["agent"]["sessionFilePath"], "/s/7.jsonl");

        // Losing a session file is not an attach.
        assert!(session_attaches(&cur, &prev, &[])
            .iter()
            .all(|a| a["pid"] != json!(7)));
        assert!(session_attaches(&cur, &cur, &[]).is_empty());
    }

    #[tokio::test]
    async fn agent_lookup_and_unregister_round_trip_over_socket() {
        let (d, sock) = test_daemon().await;
        d.store
            .register_start(
                i32::MAX as i64,
                "kill-me",
                "claude",
                "/repo",
                "tmux",
                &json!({"session": "kill-me"}),
            )
            .unwrap();

        let r = rpc(
            &sock,
            r#"{"id":1,"method":"agent.lookup","params":{"name":"kill-me"}}"#,
        )
        .await;
        assert_eq!(r["result"]["runtimeRef"]["session"], "kill-me");
        assert_eq!(r["result"]["cwd"], "/repo");

        let r = rpc(
            &sock,
            r#"{"id":2,"method":"agent.unregister","params":{"name":"kill-me"}}"#,
        )
        .await;
        assert_eq!(r["result"]["name"], "kill-me");

        let r = rpc(
            &sock,
            r#"{"id":3,"method":"agent.lookup","params":{"name":"kill-me"}}"#,
        )
        .await;
        assert_eq!(r["code"], "not_found");
        assert!(r["error"].as_str().unwrap().contains("kill-me"));

        let r = rpc(&sock, r#"{"id":4,"method":"agent.unregister","params":{}}"#).await;
        assert_eq!(r["code"], "invalid_params");
    }

    #[tokio::test]
    async fn agent_rename_round_trips_over_socket() {
        let (d, sock) = test_daemon().await;
        // Dead herdr registration → registry-only rename, no runtime binary.
        d.store
            .register_start(
                i32::MAX as i64,
                "rn-old",
                "codex",
                "/repo",
                "herdr",
                &json!({"paneId": "w1:p1"}),
            )
            .unwrap();

        let r = rpc(
            &sock,
            r#"{"id":1,"method":"agent.rename","params":{"from":"rn-old","to":"rn-new"}}"#,
        )
        .await;
        assert_eq!(r["result"]["to"], "rn-new");
        assert_eq!(r["result"]["runtimeRenamed"], false);
        assert!(d.store.lookup_name("rn-new").unwrap().is_some());

        let r = rpc(
            &sock,
            r#"{"id":2,"method":"agent.rename","params":{"from":"rn-old","to":"x2"}}"#,
        )
        .await;
        assert_eq!(r["code"], "not_found");

        let r = rpc(
            &sock,
            r#"{"id":3,"method":"agent.rename","params":{"from":"a"}}"#,
        )
        .await;
        assert_eq!(r["code"], "invalid_params");
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
