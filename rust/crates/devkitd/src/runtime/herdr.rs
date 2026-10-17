//! herdr runtime — port of `HerdrAgentRuntime` + `HerdrCliClient` +
//! `HerdrResponseParsers`. herdr is a CLI-orchestrated pane manager; every
//! call is `herdr <args>` with JSON on stdout and `{"error":{code,message}}`
//! for failures.

use super::{AgentRuntime, Availability, StartError, StartInput, StartOutput};
use serde_json::{json, Value};
use std::process::Command;
use std::time::{Duration, Instant};

const BUSY_RETRY: Duration = Duration::from_secs(5);
const BUSY_RETRY_INTERVAL: Duration = Duration::from_millis(100);
const PROCESS_INFO_POLL: Duration = Duration::from_secs(3);
const PROCESS_INFO_POLL_INTERVAL: Duration = Duration::from_millis(100);

pub struct HerdrRuntime {
    herdr: String,
}

impl Default for HerdrRuntime {
    fn default() -> Self {
        Self {
            herdr: "herdr".into(),
        }
    }
}

impl HerdrRuntime {
    #[cfg(test)]
    pub fn with_bin(herdr: &str) -> Self {
        Self {
            herdr: herdr.into(),
        }
    }

    fn run(&self, args: &[&str]) -> Result<String, HerdrCall> {
        let out = Command::new(&self.herdr).args(args).output();
        match out {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(HerdrCall::NotFound),
            Err(e) => Err(HerdrCall::Spawn(e.to_string())),
            Ok(o) if o.status.success() => Ok(String::from_utf8_lossy(&o.stdout).to_string()),
            Ok(o) => Err(HerdrCall::Failed(
                String::from_utf8_lossy(&o.stderr).trim().to_string(),
            )),
        }
    }

    /// JSON call: parse stdout, surface `{"error":{code,message}}` payloads.
    fn run_json(&self, args: &[&str]) -> Result<Value, HerdrCall> {
        let stdout = self.run(args)?;
        let v: Value = serde_json::from_str(&stdout)
            .map_err(|e| HerdrCall::Failed(format!("Herdr returned invalid JSON: {e}")))?;
        if let Some(err) = v.get("error") {
            return Err(HerdrCall::Rpc {
                code: err["code"].as_str().map(|s| s.to_string()),
                message: err["message"]
                    .as_str()
                    .unwrap_or("Herdr command failed.")
                    .to_string(),
            });
        }
        Ok(v)
    }

    fn workspace_create(
        &self,
        cwd: &str,
        label: &str,
    ) -> Result<(Option<String>, String), HerdrCall> {
        let v = self.run_json(&["workspace", "create", "--cwd", cwd, "--label", label])?;
        let workspace_id = v["result"]["workspace"]["workspace_id"]
            .as_str()
            .map(|s| s.to_string());
        let pane_id = v["result"]["root_pane"]["pane_id"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| {
                HerdrCall::Failed(
                    "Herdr workspace create response did not include root pane id.".into(),
                )
            })?;
        Ok((workspace_id, pane_id))
    }

    /// `agent start` with the `agent_pane_busy` retry loop — ports
    /// `runAgentStartJson` (5s budget, 100ms interval).
    fn agent_start(&self, input: &StartInput, pane_id: &str) -> Result<Value, HerdrCall> {
        let timeout = input.timeout_ms.to_string();
        let mut args = vec![
            "agent",
            "start",
            input.name,
            "--kind",
            input.kind,
            "--pane",
            pane_id,
            "--timeout",
            timeout.as_str(),
        ];
        if !input.args.is_empty() {
            args.push("--");
            for a in input.args {
                args.push(a.as_str());
            }
        }
        let deadline = Instant::now() + BUSY_RETRY;
        loop {
            match self.run_json(&args) {
                Err(HerdrCall::Rpc { code, message })
                    if code.as_deref() == Some("agent_pane_busy") =>
                {
                    if Instant::now() >= deadline {
                        return Err(HerdrCall::Rpc {
                            code: Some("agent_pane_busy".into()),
                            message: if message.is_empty() {
                                "Herdr agent start failed because the target pane stayed busy."
                                    .into()
                            } else {
                                message
                            },
                        });
                    }
                    std::thread::sleep(BUSY_RETRY_INTERVAL);
                }
                other => return other,
            }
        }
    }

    /// `pane process-info` poll: foreground pid preferred, shell pid as
    /// fallback — ports `readStartedAgentPid` (3s budget, 100ms interval).
    fn read_started_pid(&self, pane_id: &str) -> Option<i64> {
        let deadline = Instant::now() + PROCESS_INFO_POLL;
        let mut fallback = None;
        loop {
            if let Ok(v) = self.run_json(&["pane", "process-info", "--pane", pane_id]) {
                let info = &v["result"]["process_info"];
                if let Some(p) = info["foreground_processes"]
                    .as_array()
                    .and_then(|ps| ps.iter().find_map(|p| p["pid"].as_i64()))
                {
                    return Some(p);
                }
                fallback = fallback.or_else(|| info["shell_pid"].as_i64());
            }
            if Instant::now() >= deadline {
                return fallback;
            }
            std::thread::sleep(PROCESS_INFO_POLL_INTERVAL);
        }
    }
}

enum HerdrCall {
    NotFound,
    Spawn(String),
    Failed(String),
    Rpc {
        code: Option<String>,
        message: String,
    },
}

impl From<HerdrCall> for StartError {
    fn from(e: HerdrCall) -> Self {
        match e {
            HerdrCall::NotFound => StartError::Unavailable {
                reason: "binary-missing".into(),
                detail: "herdr command was not found in PATH.".into(),
            },
            HerdrCall::Spawn(m) | HerdrCall::Failed(m) => StartError::Failed {
                code: None,
                message: m,
            },
            HerdrCall::Rpc { code, message } => StartError::Failed { code, message },
        }
    }
}

impl AgentRuntime for HerdrRuntime {
    fn provider(&self) -> &'static str {
        "herdr"
    }

    fn is_available(&self) -> Availability {
        match self.run(&["--version"]) {
            Err(HerdrCall::NotFound) => {
                return Availability::missing("herdr command was not found in PATH.")
            }
            Err(e) => {
                return Availability::unreachable(match e {
                    HerdrCall::Rpc { message, .. } => message,
                    HerdrCall::Failed(m) | HerdrCall::Spawn(m) => m,
                    HerdrCall::NotFound => unreachable!(),
                })
            }
            Ok(_) => {}
        }
        match self.run(&["api", "snapshot"]) {
            Ok(_) => Availability::ok(),
            Err(e) => Availability::unreachable(match e {
                HerdrCall::Rpc { message, .. } => message,
                HerdrCall::Failed(m) | HerdrCall::Spawn(m) => m,
                HerdrCall::NotFound => "herdr command was not found in PATH.".into(),
            }),
        }
    }

    fn start(&self, input: &StartInput) -> Result<StartOutput, StartError> {
        let (workspace_id, pane_id) = self.workspace_create(input.cwd, input.name)?;
        let agent_resp = self.agent_start(input, &pane_id)?;

        let agent = &agent_resp["result"]["agent"];
        let pane_id = agent["pane_id"].as_str().unwrap_or(&pane_id).to_string();
        let agent_name = agent["name"].as_str().unwrap_or(input.name).to_string();
        let tab_id = agent["tab_id"].as_str().map(|s| s.to_string());

        let pid = self
            .read_started_pid(&pane_id)
            .ok_or_else(|| StartError::Failed {
                code: None,
                message: "Herdr pane process-info response did not include process pid.".into(),
            })?;

        let mut runtime_ref = json!({
            "session": "default",
            "paneId": pane_id,
            "agentName": agent_name,
        });
        if let Some(w) = workspace_id {
            runtime_ref["workspaceId"] = json!(w);
        }
        if let Some(t) = tab_id {
            runtime_ref["tabId"] = json!(t);
        }
        Ok(StartOutput { pid, runtime_ref })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use devkit_harness::start_profiles::MatchSpec;
    use std::path::PathBuf;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new(tag: &str) -> Self {
            static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let dir = std::env::temp_dir().join(format!(
                "herdr-fix-{}-{}-{}",
                std::process::id(),
                tag,
                N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            let f = Fixture(dir);
            f.write(
                "herdr",
                r#"#!/bin/sh
DIR="$(dirname "$0")"
echo "$@" >> "$DIR/herdr-calls.log"
case "$1 $2" in
  "--version ") echo "herdr 1.0";;
  "api snapshot") cat "$DIR/snapshot.json" 2>/dev/null || echo "{}";;
  "workspace create") cat "$DIR/workspace.json";;
  "agent start")
    C=$(cat "$DIR/busy-count" 2>/dev/null || echo 0)
    echo $((C+1)) > "$DIR/busy-count"
    LIMIT=$(cat "$DIR/busy-limit" 2>/dev/null || echo 0)
    if [ "$C" -lt "$LIMIT" ]; then
      echo '{"error":{"code":"agent_pane_busy","message":"pane busy"}}'
    else
      cat "$DIR/agent_start.json"
    fi;;
  "pane process-info") cat "$DIR/process_info.json";;
esac
exit 0
"#,
            );
            f
        }
        fn write(&self, name: &str, content: &str) -> PathBuf {
            let p = self.0.join(name);
            std::fs::write(&p, content).unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
            }
            p
        }
        fn set(&self, name: &str, content: &str) {
            std::fs::write(self.0.join(name), content).unwrap();
        }
        fn calls(&self) -> String {
            std::fs::read_to_string(self.0.join("herdr-calls.log")).unwrap_or_default()
        }
        fn runtime(&self) -> HerdrRuntime {
            HerdrRuntime::with_bin(self.0.join("herdr").to_str().unwrap())
        }
        fn happy(&self) -> &Self {
            self.set(
                "workspace.json",
                r#"{"result":{"workspace":{"workspace_id":"w1"},"root_pane":{"pane_id":"p-root"}}}"#,
            );
            self.set(
                "agent_start.json",
                r#"{"result":{"agent":{"pane_id":"p-1","name":"agent-a","tab_id":"t-1"}}}"#,
            );
            self.set(
                "process_info.json",
                r#"{"result":{"process_info":{"foreground_processes":[{"pid":4242}],"shell_pid":4000}}}"#,
            );
            self
        }
    }

    fn input<'a>(name: &'a str, args: &'a [String]) -> StartInput<'a> {
        static M: MatchSpec = MatchSpec::Argv0("claude");
        StartInput {
            name,
            cwd: "/repo",
            kind: "claude",
            command: "claude",
            args,
            matcher: Some(&M),
            timeout_ms: 1000,
            poll_interval_ms: 1,
        }
    }

    #[test]
    fn unavailable_when_binary_missing() {
        let f = Fixture::new("missing");
        let rt = HerdrRuntime::with_bin(f.0.join("nope").to_str().unwrap());
        let a = rt.is_available();
        assert!(!a.ok);
        assert_eq!(a.reason.as_deref(), Some("binary-missing"));
    }

    #[test]
    fn unavailable_when_backend_unreachable() {
        let f = Fixture::new("backend");
        f.write(
            "herdr-bad",
            "#!/bin/sh\n[ \"$1\" = \"--version\" ] && echo ok && exit 0\nexit 1\n",
        );
        let rt = HerdrRuntime::with_bin(f.0.join("herdr-bad").to_str().unwrap());
        let a = rt.is_available();
        assert!(!a.ok);
        assert_eq!(a.reason.as_deref(), Some("backend-unreachable"));
    }

    #[test]
    fn start_creates_workspace_starts_agent_reads_pid() {
        let f = {
            let f = Fixture::new("happy");
            f.happy();
            f
        };
        let out = f.runtime().start(&input("agent-a", &[])).unwrap();
        assert_eq!(out.pid, 4242); // foreground pid preferred over shell_pid
        let r = &out.runtime_ref;
        assert_eq!(r["paneId"], "p-1");
        assert_eq!(r["workspaceId"], "w1");
        assert_eq!(r["tabId"], "t-1");
        assert_eq!(r["agentName"], "agent-a");
        assert_eq!(r["session"], "default");
        let calls = f.calls();
        assert!(calls.contains("workspace create --cwd /repo --label agent-a"));
        assert!(calls.contains("agent start agent-a --kind claude --pane p-root --timeout 1000"));
        assert!(calls.contains("pane process-info --pane p-1"));
    }

    #[test]
    fn extra_args_forwarded_after_double_dash() {
        let f = {
            let f = Fixture::new("args");
            f.happy();
            f
        };
        let args = vec!["--flag".to_string(), "v".to_string()];
        f.runtime().start(&input("agent-a", &args)).unwrap();
        assert!(f.calls().contains("-- --flag v"));
    }

    #[test]
    fn busy_retry_recovers_then_errors() {
        let f = {
            let f = Fixture::new("busy");
            f.happy();
            f
        };
        f.set("busy-limit", "2");
        let out = f.runtime().start(&input("agent-a", &[])).unwrap();
        assert_eq!(out.pid, 4242);
    }

    #[test]
    fn shell_pid_used_when_no_foreground() {
        let f = Fixture::new("shellpid");
        f.happy();
        f.set(
            "process_info.json",
            r#"{"result":{"process_info":{"foreground_processes":[],"shell_pid":4321}}}"#,
        );
        let out = f.runtime().start(&input("agent-a", &[])).unwrap();
        assert_eq!(out.pid, 4321);
    }
}
