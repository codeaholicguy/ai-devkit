//! Daemon-owned child supervision. Socket lifetime never owns a run.
use anyhow::{ensure, Context, Result};
use devkit_core::{durable_process::identity, store::Store};
use devkit_harness::start_profiles::start_profile;
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    io::{Read, Write},
    os::unix::process::CommandExt,
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub struct DurableSupervisor {
    store: Arc<Store>,
    // Also serializes acquire/spawn/attach with sweep and stop. Tokens here
    // belong to this daemon; only their waiters may finalize them.
    children: Arc<Mutex<HashSet<String>>>,
    data_dir: std::path::PathBuf,
}
impl DurableSupervisor {
    pub fn new(store: Arc<Store>, data_dir: &std::path::Path) -> Self {
        Self {
            store,
            children: Arc::new(Mutex::new(HashSet::new())),
            data_dir: data_dir.into(),
        }
    }
    pub fn ready(&self) -> Result<()> {
        // Fence BEFORE importing/creating daemon state. A failed transfer
        // still denies local fallback, preserving the recovery source.
        let fence = self.data_dir.join("durable-owner-v1.json");
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&fence)
        {
            Ok(mut f) => {
                f.write_all(b"{\"owner\":\"devkitd\",\"version\":1}\n")?;
                f.sync_all()?;
                std::fs::File::open(&self.data_dir)?.sync_all()?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.into()),
        }
        self.store
            .durable_import_legacy(&self.data_dir.join("agents.db"))?;
        Ok(())
    }
    pub fn dispatch(&self, method: &str, p: &Value) -> Result<Value> {
        self.ready()
            .context("migration_failed: durable ownership transfer unavailable")?;
        self.reconcile()?;
        let field = |key: &str| {
            p[key]
                .as_str()
                .with_context(|| format!("invalid_params: missing {key}"))
        };
        match method {
            "durable.capabilities" => Ok(json!({"version":1,"owner":"devkitd"})),
            "durable.create" => self.store.durable_create(
                field("name")?,
                match p.get("provider") {
                    None => "claude",
                    Some(Value::String(provider)) => provider,
                    Some(_) => anyhow::bail!("invalid_params: provider must be a string"),
                },
                field("cwd")?,
            ),
            "durable.list" => Ok(json!(self.store.durable_list()?)),
            "durable.show" => {
                let a = self.store.durable_resolve(field("reference")?)?;
                if let Some(token) = p["runId"].as_str() {
                    let id = a["id"]
                        .as_str()
                        .context("not_found: run lookup requires one resolved durable agent")?;
                    let run = self.store.durable_run(id, token)?;
                    Ok(json!({"agent":a,"run":run}))
                } else {
                    Ok(a)
                }
            }
            "durable.run" | "durable.send" => {
                self.launch(field("id")?, field("prompt")?.to_owned())
            }
            "durable.stop" => self.stop(field("id")?, p["runId"].as_str()),
            _ => anyhow::bail!("unknown_method: unknown method: {method}"),
        }
    }
    fn launch(&self, id: &str, prompt: String) -> Result<Value> {
        ensure!(
            prompt.len() <= 1024 * 1024,
            "invalid_params: prompt exceeds safety limit"
        );
        let mut children = self.children.lock().unwrap();
        let a = self.store.durable_acquire(id)?;
        let token = a["activeRun"]["token"].as_str().unwrap().to_string();
        let profile = start_profile(a["provider"].as_str().unwrap()).unwrap();
        let sid = a["providerSessionId"].as_str();
        let args = profile.durable_args(sid, a["sessionHealth"] == "uninitialized")?;
        let mut parser = profile.durable_parser(sid)?;
        let mut child = match Command::new(profile.command)
            .args(args)
            .current_dir(a["cwd"].as_str().unwrap())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .process_group(0)
            .spawn()
        {
            Ok(child) => child,
            Err(e) => {
                self.store.durable_complete(
                    id,
                    &token,
                    "failed",
                    None,
                    &format!("Failed to spawn {}: {e}", profile.command),
                    "unknown",
                )?;
                return Err(anyhow::anyhow!("spawn_failed: {e}"));
            }
        };
        let pid = child.id() as i64;
        let proc_identity = identity(pid)
            .and_then(|i| i.context("provider process disappeared before identity observation"));
        let started = match proc_identity.and_then(|(_, s)| {
            self.store.durable_record_process(id, &token, pid, &s)?;
            Ok(s)
        }) {
            Ok(s) => s,
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                self.store.durable_complete(
                    id,
                    &token,
                    "failed",
                    None,
                    &e.to_string(),
                    "unknown",
                )?;
                return Err(e);
            }
        };
        children.insert(token.clone());
        let mut stdin = child.stdin.take().unwrap();
        let mut stdout = child.stdout.take().unwrap();
        let store = self.store.clone();
        let owned = self.children.clone();
        let id = id.to_string();
        let run_id = token.clone();
        // Feed stdin concurrently: providers may emit output before consuming
        // a large prompt. Both pipes must keep making progress.
        std::thread::spawn(move || {
            let _ = stdin.write_all(prompt.as_bytes());
        });
        std::thread::spawn(move || {
            let outcome = (|| -> Result<String> {
                let mut buf = [0u8; 8192];
                let mut bound = false;
                loop {
                    let n = stdout.read(&mut buf)?;
                    if n == 0 {
                        break;
                    }
                    let accepted = parser.accept(&buf[..n]);
                    if profile.command == "codex" && !bound {
                        if let Some(sid) = parser.session_id() {
                            store.durable_bind(&id, &run_id, sid)?;
                            bound = true;
                        }
                    }
                    accepted?;
                }
                Ok(String::new())
            })();
            if outcome.is_err() {
                // This is still our unreaped child; its pid cannot be reused.
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
            }
            let exit = child.wait();
            let code = exit.as_ref().ok().and_then(|s| s.code());
            let signaled = exit.as_ref().is_ok_and(|s| {
                use std::os::unix::process::ExitStatusExt;
                s.signal().is_some()
            });
            let protocol_failed = outcome.is_err();
            let parsed = outcome.and_then(|_| parser.finish(code));
            let (status, summary, health) = match parsed {
                Ok(r) => ("succeeded", r.text, "healthy"),
                Err(e) => {
                    let msg = format!("{e:#}");
                    let health = if msg.contains("session_mismatch") {
                        "mismatch"
                    } else {
                        "unknown"
                    };
                    (
                        if signaled && !protocol_failed {
                            "interrupted"
                        } else {
                            "failed"
                        },
                        msg,
                        health,
                    )
                }
            };
            if let Err(e) = store.durable_complete(&id, &run_id, status, code, &summary, health) {
                tracing::warn!("durable completion failed: {e:#}");
            }
            owned.lock().unwrap().remove(&run_id);
            let _ = started;
        });
        Ok(json!({"agent":a,"runId":token}))
    }
    pub fn reconcile(&self) -> Result<()> {
        let children = self.children.lock().unwrap();
        for a in self.store.durable_list()? {
            let r = &a["activeRun"];
            let Some(token) = r["token"].as_str() else {
                continue;
            };
            if children.contains(token) {
                continue;
            }
            let live =
                |p: &Value| -> Result<bool> {
                    let Some(pid) = p["pid"].as_i64() else {
                        return Ok(false);
                    };
                    Ok(identity(pid)?
                        .is_some_and(|(_, s)| Some(s.as_str()) == p["startedAt"].as_str()))
                };
            // An observation error propagates; no destructive reconciliation.
            if live(&r["provider"])?
                || (r["owner"]["pid"].as_i64() != Some(std::process::id() as i64)
                    && live(&r["owner"])?)
            {
                continue;
            }
            self.store.durable_complete(
                a["id"].as_str().unwrap(),
                token,
                "interrupted",
                None,
                "Previous print run was interrupted.",
                "unknown",
            )?;
        }
        Ok(())
    }
    fn stop(&self, id: &str, expected: Option<&str>) -> Result<Value> {
        let owned = self.children.lock().unwrap();
        let a = self.store.durable_resolve(id)?;
        ensure!(a["id"] == id, "not_found: durable agent not found");
        let r = &a["activeRun"];
        let Some(token) = r["token"].as_str() else {
            return Ok(a);
        };
        if let Some(expected) = expected {
            ensure!(expected == token, "ownership_changed: active run changed");
        }
        self.store.durable_request_stop(id, token)?;
        let process = &r["provider"];
        let pid = process["pid"]
            .as_i64()
            .context("busy: provider has not attached yet")?;
        let matches = || -> Result<bool> {
            Ok(identity(pid)?
                .is_some_and(|(_, s)| Some(s.as_str()) == process["startedAt"].as_str()))
        };
        if matches()? {
            // Legacy TS runners did not create private process groups.
            // Never signal their inherited group (which may include the CLI).
            let target = if unsafe { libc::getpgid(pid as i32) } == pid as i32 {
                -(pid as i32)
            } else {
                pid as i32
            };
            unsafe {
                libc::kill(target, libc::SIGTERM);
            }
            let deadline = Instant::now() + Duration::from_secs(2);
            while matches()? && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(20));
            }
            if matches()? {
                unsafe {
                    libc::kill(target, libc::SIGKILL);
                }
            }
        }
        // Our waiter owns actual exit collection. Adopted runs have no waiter.
        if !owned.contains(token) && !matches()? {
            self.store.durable_complete(
                id,
                token,
                "interrupted",
                None,
                "Print run stopped.",
                "unknown",
            )?;
        }
        self.store.durable_resolve(id)
    }
}
