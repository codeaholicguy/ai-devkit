---
phase: design
title: devkitd-agent-start design
description: agent.start RPC on devkitd — Rust tmux/herdr runtimes, harness start profiles, merged registry columns in daemon.db agents table, dual-write bridge to legacy agents.db, CLI daemon-first routing with TS fallback
---

# Design — devkitd-agent-start

## Architecture overview

```mermaid
graph TD
    subgraph "TS (unchanged callers)"
        CLI[agent start cmd] -->|daemon reachable| DC[daemon-client<br/>DaemonClient.startAgent]
        CLI -->|connect fail /<br/>unknown method| TS[ManagedAgentRuntime.startAgent<br/>legacy fallback]
        TUI[console StartAgentPane] -->|spawns CLI| CLI
    end
    subgraph "rust/"
        D[crates/devkitd<br/>server.rs dispatch] --> AS[agent_start.rs<br/>orchestration + mutex]
        AS --> RT[runtime/mod.rs<br/>trait AgentRuntime]
        RT --> TM[runtime/tmux.rs]
        RT --> HD[runtime/herdr.rs]
        AS --> SP[devkit-harness<br/>start_profiles.rs]
        AS --> ST[devkit-core store.rs<br/>agents table + registry cols]
        AS --> EV[emit agent.started]
        SW[sweep loop] --> ST
    end
    DC -.unix socket ~/.ai-devkit/daemon.sock.-> D
    AS -->|dual-write| LDB[~/.ai-devkit/agents.db<br/>legacy registry]
    ST -->|boot delta import| LDB
```

`agent.start` runs on the blocking pool (not `INLINE_METHODS`) — it can take
up to `timeoutMs` plus herdr retries.

## Wire contract

```json
→ {"id":1,"method":"agent.start","params":{
     "type":"claude",          // required: StartableAgentType
     "name":"my-agent",        // optional: server generates {basename}-{ts36}
     "cwd":"/repo",            // required
     "runtime":"tmux",         // optional: "tmux"|"herdr", default "tmux"
     "args":["--flag"],        // optional: appended after "--" (herdr)
     "timeoutMs":15000,        // optional: pid-resolution deadline
     "pollIntervalMs":500      // optional
   }}

← {"id":1,"result":{
     "name":"my-agent","type":"claude","pid":12345,
     "runtime":"tmux","runtimeRef":{"session":"my-agent"},
     "cwd":"/repo","startedAt":"2026-10-17T07:44:00.000Z",
     "warnings":["tmux session \"x\" already exists ... will be replaced."]}}

← {"id":1,"error":"Agent \"x\" is already running (PID 42).","code":"name_in_use",
    "details":{"pid":42}}
```

`Response` gains two optional fields (both skipped when absent — old clients
unaffected):

```rust
pub code: Option<String>,
pub details: Option<Value>,   // pid, command, timeoutMs, provider, reason...
```

New ts-rs-exported types in `proto.rs`: `AgentStartParams`,
`AgentStartResult`. `runtimeRef` crosses as `serde_json::Value`/`unknown`.

### Error codes

| code | details | CLI rendering |
|---|---|---|
| `invalid_params` | `field`, `message` | same text as current validation |
| `harness_not_startable` | `type` | unsupported-type error |
| `name_in_use` | `pid` | `Agent "n" is already running (PID p)` |
| `runtime_unavailable` | `provider`, `reason`, `detail` | tmux install instructions / herdr message |
| `pid_poll_timeout` | `command`, `timeoutMs` | pid-poll timeout message |
| `internal` | — | generic throw |

## daemon.db schema — merged `agents` table

Extend the existing snapshot table (no new table; `Store::open` migration
pattern via `PRAGMA table_info`, matching the `start_time_ms` precedent):

```sql
ALTER TABLE agents ADD COLUMN name TEXT;
ALTER TABLE agents ADD COLUMN agent_type TEXT;
ALTER TABLE agents ADD COLUMN runtime TEXT;
ALTER TABLE agents ADD COLUMN runtime_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN registered_at INTEGER;
CREATE UNIQUE INDEX idx_agents_name ON agents(name) WHERE name IS NOT NULL;
```

`session_file` (existing, sweep-filled) serves `sessionFilePath`. Declared
`agent_type` (what the user passed) is stored separately from the
adapter-derived type to keep them honest when they disagree.

### Snapshot rules (the load-bearing change)

`apply_agent_snapshot` currently keys identity on `(pid, start_time_ms)` and
deletes every row whose identity vanishes. With registry columns:

1. **Registered-before-swept**: register inserts a row with
   `start_time_ms = NULL` before the 2s sweep sees the process. When the
   sweep delivers `(pid, real_st)` for a stored `(pid, NULL)` row → the
   ON CONFLICT upsert adopts `start_time_ms`; the row is *not* in `gone`
   (see below) and `appeared` fires normally.
2. **Pid reuse**: stored `start_time_ms` non-NULL and differs → DELETE the
   row entirely (name, pin, runtime_ref) then re-insert. A recycled pid
   never inherits a dead agent's identity.
3. **True disappearance**: pid absent from the sweep —
   `name IS NULL` → DELETE (unchanged);
   `name IS NOT NULL` → tombstone: keep the row (stale `last_seen`, retained
   `runtime_ref`) so `kill`/`send` on a dead agent still resolves and an
   orphaned pane stays closable by name. Freed by prune at next
   `agent.start` name check or future `agent.stop`.

`gone`/`appeared` computation changes: `gone` yields a pid only when the
stored `start_time_ms` is non-NULL (NULL-st rows were never live). Tombstone
rows count as `known` only for `gone` purposes — a named row's pid
reappearing with a *new* `start_time_ms` is identity-change (rule 2), not
adoption.

### Registry write path

`register_start` (single transaction):

```sql
INSERT INTO agents (pid, name, agent_type, runtime, runtime_ref,
                    registered_at, first_seen, last_seen)
VALUES (?,?,?,?,?,?,?,?)
ON CONFLICT(pid) DO UPDATE SET
  name=excluded.name, agent_type=excluded.agent_type,
  runtime=excluded.runtime, runtime_ref=excluded.runtime_ref,
  registered_at=excluded.registered_at, last_seen=excluded.last_seen
-- start_time_ms untouched: NULL until first sweep adopts real value
```

Name uniqueness is enforced by `idx_agents_name` *and* pre-checked under a
`start_mutex` on `Daemon` — the mutex also serializes concurrent starts so
two racing `agent.start` calls can't both pass the name check.

Prune semantics move from "row exists" to "live": `name_in_use` fires only
when the named row's pid is present in the last sweep snapshot (live). Dead
named rows are reclaimed during the check — matching TS `prune()` behavior
but liveness-aware.

## Rust components

### `devkit-harness::start_profiles`

```rust
pub struct StartProfile {
    pub command: &'static str,       // e.g. "kiro-cli" for kiro
    pub runtime_kind: &'static str,  // passed to herdr --kind
    pub matcher: MatchSpec,
}

pub enum MatchSpec {
    Argv0(&'static str),                  // matchArgv0
    Argv0Contains(&'static str),          // matchArgv0Name
    AnyBasename(&'static [&'static str]), // matchAnyBasename
}
```

Eleven entries mirroring `HARNESS_RUNTIME_PROFILES`. `MatchSpec::matches`
ports `tokensOf`/`basenameOf`/`mayContinueArgv0` **and `executablePath`'s
filesystem probing** (`isFile` on progressive prefixes — handles absolute
paths under space-containing dirs). TS unit-test cases for the matchers are
ported verbatim.

### `devkitd::runtime` module

```rust
pub trait AgentRuntime {
    fn is_available(&self) -> Availability;      // {ok, reason, detail}
    fn start(&self, input: StartInput) -> Result<StartOutput, StartError>;
    // {pid, runtime_ref: Value}
}
```

- **`TmuxRuntime`** — ports `TmuxManager`: `tmux -V` availability,
  `has-session`, `new-session -d -s <name> -c <cwd>`,
  `send-keys -t <name> <command> Enter`, `list-panes -t <name> -F
  #{pane_pid}`, `kill-session`; descendant scan via `pgrep -P` BFS +
  `ps -o command= -p <pid>`; `poll_for_pid` with interval/timeout and the
  **5-consecutive-identical-pid stability rule** (`REQUIRED_STABLE_PID_POLLS`).
  On timeout: kill session, `pid_poll_timeout`.
- **`HerdrRuntime`** — ports `HerdrCliClient` + `HerdrResponseParsers`:
  `herdr --version` and `herdr api snapshot` availability (`binary-missing`
  vs `backend-unreachable`); `workspace create --cwd <cwd> --label <name>` →
  `result.workspace.workspace_id` + `result.root_pane.pane_id`; `agent start
  <name> --kind <runtime_kind> --pane <pane_id> --timeout <ms>` with
  `agent_pane_busy` retry (5s budget, 100ms interval); `pane process-info
  --pane <id>` poll (3s, 100ms) → first `foreground_processes[].pid` else
  `shell_pid`; runtime_ref `{session:"default", workspaceId?, tabId?, paneId,
  agentName}`. JSON `error` blocks map to `HerdrRuntimeError(code)` →
  `runtime_unavailable`/`internal`.
- All external commands via `std::process::Command` with injected argv-0 /
  `PATH` for tests (same seams as TS's injectable `runner`/`tmux` deps).

### `devkitd::agent_start` handler

`validate → resolve profile → availability → [start_mutex] prune +
name-check → orphan-session warn → runtime.start → register (+ dual-write)
→ emit agent.started → apply_sweep() → return entry+warnings`.

Running `apply_sweep()` right after register reconciles the snapshot,
adopts `start_time_ms`, refreshes `enriched`, and emits `agent.appeared` —
both events fire for one start (`agent.started` = declared, `.appeared` =
observed). Subscribers dedupe by pid; documented behavior.

### Enriched overlay

After `enricher.enrich()`, overlay registry fields for pids with `name`
non-NULL: `EnrichedAgent.name = row.name` (registered name wins — this is
the #398 fix), `pinned = row.pinned`. No new `EnrichedAgent` fields;
consumers needing `runtime_ref` use the legacy DB (dual-write) until
`agent.lookup` lands in a later feature.

## Legacy agents.db bridge

- **Dual-write**: after registering in daemon.db, if
  `~/.ai-devkit/agents.db` exists with an `agents` table at schema v5,
  upsert the same row (`type,pid,name,tmux_session,cwd,started_at,
  session_id,session_file_path,updated_at,pinned,runtime,runtime_ref`).
  Absent or older-schema file → skip silently. Keeps `send`/`kill`/`rename`/
  `open`/channel consumers working unchanged.
- **Delta import on boot**: `Store::open` — for every legacy row whose
  `(type,pid)` isn't registered and whose pid isn't in the live snapshot,
  insert a tombstone (`start_time_ms NULL`, `registered_at` from
  `started_at`). Every boot, not one-shot: heals entries written by the TS
  fallback path while the daemon was down. Legacy file wins nothing on
  conflict — daemon row is authoritative.

## TS changes

- `packages/daemon-client`: `DaemonClient.startAgent(params)` →
  `AgentStartResult`; errors thrown as `DaemonRpcError {code, details,
  message}`; `subscribe` unaffected. `requestTimeoutMs` for `agent.start`
  raised to `timeoutMs + margin` per-call.
- `packages/cli/src/commands/agent/start.command.ts`: after existing
  client-side validation, `DaemonClient` via `tryConnect`/`ensureDaemon` →
  `agent.start` → on `code:"unknown_method"` (old devkitd) or connect
  failure → existing `startAgent` path unchanged. Result `warnings` →
  `ui.warning`; error codes map to the exact `reportAgentStartError`
  messages (tmux instructions resolved client-side).
- Name generation stays client-side; server-side `{basename}-{ts36}`
  generation exists only for socket-direct callers omitting `name`.
- Regenerate `gen/*.ts` via `cargo test -p devkit-core` (ts-rs).

## Alternatives considered

- **Separate `registry` table** — rejected per user direction; merged row
  gives free overlay but costs the three snapshot rules above.
- **Daemon shells out to TS helper** — rejected: npm-version coupling +
  node startup per start; worst of both worlds.
- **No dual-write, migrate all consumers now** — rejected: sync
  `AgentRegistry.lookup` call sites would all need async socket reads;
  balloons scope.
- **Suppress `agent.appeared` for daemon-started pids** — rejected: extra
  dedupe state for cosmetic purity; kinds differ so subscribers can
  distinguish.

## Security / performance

- Socket stays 0600 same-uid (SO_PEERCRED on Linux); `agent.start` spawns
  processes — same trust level as the CLI, no new privilege boundary.
- `args` are passed to `herdr` argv, never a shell; tmux `send-keys` sends
  the harness `command` only (fixed per profile) — caller `args` go nowhere
  near tmux.
- Start is O(pane-pid descendants) polling + ≤3 blocking calls; blocking
  pool absorbs it; `start_mutex` is held across spawn — serial starts are
  intentional (name uniqueness is global).
- `daemon.db` WAL + `synchronous=NORMAL` unchanged; registry columns add a
  few bytes/row.

## Resolved decisions

- Merged `agents` table (not separate `registry`); tombstones for named
  dead rows; pid-reuse deletes registration.
- `Response.code` + `details` added; `error` string preserved for old
  clients.
- Runtime passed in `params.runtime` (CLI reads `ConfigManager`); daemon
  defaults `tmux`.
- Both `agent.started` and `agent.appeared` fire for one start.
- Client disconnect mid-start → daemon completes (no cancel RPC in v1).
