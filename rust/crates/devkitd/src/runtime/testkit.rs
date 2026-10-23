//! Shared fake-CLI fixtures for runtime/agent_start tests: executable
//! shell scripts in a temp dir that append argv to a log file and read
//! canned responses from sibling state files.

use super::{HerdrRuntime, TmuxRuntime};
use std::path::PathBuf;

/// Temp dir holding fake CLI binaries driven by sibling state files.
pub struct FixtureDir(pub PathBuf);

impl FixtureDir {
    pub fn new(tag: &str) -> Self {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "devkitd-fix-{}-{}-{}",
            std::process::id(),
            tag,
            N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        FixtureDir(dir)
    }

    /// Write an executable script into the dir (chmod 755 on unix).
    pub fn script(&self, name: &str, content: &str) -> PathBuf {
        let p = self.0.join(name);
        std::fs::write(&p, content).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        p
    }

    /// Write a plain state file a fixture script reads.
    pub fn set(&self, name: &str, content: &str) {
        std::fs::write(self.0.join(name), content).unwrap();
    }

    /// Read a script's argv log — empty string until it records a call.
    pub fn log(&self, name: &str) -> String {
        std::fs::read_to_string(self.0.join(name)).unwrap_or_default()
    }

    /// Absolute path of a file in the dir (binary injection into runtimes).
    pub fn bin(&self, name: &str) -> String {
        self.0.join(name).to_str().unwrap().to_string()
    }

    /// tmux runtime backed by fixture tmux/pgrep/ps scripts.
    pub fn tmux(&self) -> TmuxRuntime {
        self.script("tmux", TMUX_SCRIPT);
        self.script("pgrep", PGREP_SCRIPT);
        self.script("ps", PS_SCRIPT);
        TmuxRuntime::with_bins(&self.bin("tmux"), &self.bin("pgrep"), &self.bin("ps"))
    }

    /// herdr runtime backed by a fixture herdr script.
    pub fn herdr(&self) -> HerdrRuntime {
        self.script("herdr", HERDR_SCRIPT);
        HerdrRuntime::with_bin(&self.bin("herdr"))
    }
}

/// Fake tmux: `-V`, `has-session`, `new-session`, `send-keys`, `list-panes`
/// (reads `pane_pid`), `kill-session`. Sessions tracked as `session-<name>`
/// marker files; every invocation logs argv to `tmux-calls.log`.
const TMUX_SCRIPT: &str = r#"#!/bin/sh
DIR="$(dirname "$0")"
echo "$@" >> "$DIR/tmux-calls.log"
case "$1" in
  -V) echo "tmux 3.4";;
  has-session) [ -f "$DIR/session-$3" ];;
  new-session)
    shift; while [ $# -gt 0 ]; do
      case "$1" in -s) touch "$DIR/session-$2"; shift 2;; *) shift;; esac
    done;;
  send-keys) :;;
  list-panes) cat "$DIR/pane_pid" 2>/dev/null;;
  kill-session) rm -f "$DIR/session-$3";;
esac
exit 0
"#;

/// Fake pgrep: `-P <pid>` reads `children-<pid>` (one pid per line).
const PGREP_SCRIPT: &str =
    "#!/bin/sh\nDIR=\"$(dirname \"$0\")\"\ncat \"$DIR/children-$2\" 2>/dev/null\nexit 0\n";

/// Fake ps: `-p <pid> -o command=` reads `cmd-<pid>`.
const PS_SCRIPT: &str =
    "#!/bin/sh\nDIR=\"$(dirname \"$0\")\"\ncat \"$DIR/cmd-$2\" 2>/dev/null\nexit 0\n";

/// Fake herdr: `--version`, `api snapshot`, `workspace create`,
/// `agent start`, `pane process-info`. JSON bodies come from sibling
/// files; `busy-limit`/`busy-count` drive the agent_pane_busy loop.
const HERDR_SCRIPT: &str = r#"#!/bin/sh
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
"#;
