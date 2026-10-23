---
phase: implementation
title: Implementation — devkitd-agent-start
description: What shipped — agent.start RPC in devkitd, merged registry columns in daemon.db agents table, Rust tmux/herdr runtimes, harness start profiles, dual-write legacy bridge, daemon-first CLI routing
---

# Implementation — devkitd-agent-start

## What changed

### devkit-core (`rust/crates/devkit-core`)

- `proto.rs` — `Response` gains `code`/`details` (both skipped when absent);
  new `err_coded` constructor; `AgentStartParams`/`AgentStartResult` structs
  exported via ts-rs to `packages/daemon-client/src/gen/`.
- `store.rs` + `store/registry.rs` — `agents` table extended with nullable registry columns; store.rs holds connection/schema/event log/snapshot, store/registry.rs holds the registration lifecycle + legacy agents.db bridge
  (`name`, `agent_type`, `runtime`, `runtime_ref`, `pinned`,
  `registered_at`, `gone_at`) + partial unique index on `name`.
  `apply_agent_snapshot` rewritten around the three rules: registered-
  before-swept adoption (NULL `start_time_ms`), pid-reuse full delete,
  named-tombstone retention (`gone_at` dedupes `agent.disappeared`).
  Upsert uses `COALESCE(start_time_ms)` so flaky start-time reads never
  clear identity. New API: `register_start`, `lookup_name`, `live_name`,
  `unregister`, `prune_dead`, `registry_overlays`, `set_legacy_db`,
  `import_legacy_agents`, `iso8601_utc`. Legacy bridge: delta import on
  boot (attach-by-pid to live rows, dead-by-default tombstones otherwise)
  + dual-write on `register_start`.

### devkit-harness (`rust/crates/devkit-harness`)

- `start_profiles.rs` — `MatchSpec` (`Argv0` | `Argv0Contains` |
  `AnyBasename`) porting the TS matcher closures including
  `executablePath`'s filesystem probing for space-containing argv0;
  `StartProfile` table covering all 11 `StartableAgentType`s (kiro
  launches `kiro-cli`).

### devkitd (`rust/crates/devkitd`)

- `runtime/mod.rs` — `AgentRuntime` trait, `Availability`, `StartInput`,
  `StartOutput`, `StartError`.
- `runtime/tmux.rs` — `TmuxRuntime` (tmux session mgmt, `pgrep -P` BFS,
  `ps -o command=`, 5-stable-poll PID resolution, timeout → kill-session).
- `runtime/herdr.rs` — `HerdrRuntime` (`--version`/`api snapshot`
  availability, workspace create, agent start with `agent_pane_busy`
  retry, process-info poll → foreground/shell pid).
- `rpc/agent/start.rs` — orchestration: validate → availability →
  `start_mutex` → prune/liveness name check → orphan-session warning →
  spawn → register (+dual-write) → `agent.started` event → `apply_sweep`.
- `server.rs` — `Daemon.start_mutex`, `emit` → `pub(crate)`, `"agent.start"`
  dispatch arm (blocking pool, not INLINE_METHODS), registry overlay in
  `apply_sweep` (registered `name`/`pinned` win over adapter labels),
  `Daemon::new` wires legacy-db bridge.
- `main.rs` — `mod runtime`, `mod rpc`.

### TS (`packages/daemon-client`, `packages/cli`)

- `client.ts` — `DaemonRpcError {code, details}`; `request()` per-call
  timeout; `DaemonClient.startAgent()` (timeout = poll timeout + 15s).
- `start.command.ts` — `tryDaemonStart`: `ensureDaemon()` →
  `daemon.startAgent` → coded errors render identical messages/exit
  codes; `unknown method` or unreachable → existing TS `startAgent`
  unchanged. Transport failure mid-request reports rather than retries
  (the daemon may have completed the start).
- `agent.test.ts` — daemon-client module mock + 6 daemon-routed tests.
- `integration.test.ts` — isolated-HOME real-socket test asserting coded
  errors round-trip.

## Deviations from design

- `gone_at` column added beyond the doc'd set — needed to stop repeated
  `agent.disappeared` for tombstones and to make `live_name` meaningful.
- `start_mutex` held across spawn+register only (as designed), but the
  name check uses `kill(pid,0)` liveness rather than snapshot membership —
  pending rows (registered, never swept) are judged by real liveness.
- `process.exit` in the CLI error path needs an explicit `return` after
  it — `process.exit` is mocked in vitest so execution would fall through
  into the fallback spawn.
- `import_legacy_agents` attaches names to live rows by pid only
  (documented narrow pid-reuse window) rather than a start-time match —
  `started_at` ISO parsing was traded for the simpler attach.

## Edge cases handled

- Registered-before-swept rows (start beats the 2s sweep): adopted, not
  deleted; `agent.started` + `agent.appeared` both fire (documented).
- pid reuse can't inherit a dead agent's name (identity change → full
  row delete).
- Client disconnect mid-start: daemon completes; agent registered.
- Stale devkitd on socket: `unknown method` → TS fallback.
- Daemon env `PATH` may lack tmux/herdr → `runtime_unavailable` surfaces
  the same install hint as today.

## Test evidence

- `cargo test --workspace`: 133 tests green (30 devkit-core, 80
  devkit-harness, 23 devkitd).
- `cargo clippy --workspace --all-targets -- -D warnings`: clean.
- `packages/cli` agent.test.ts: 106 tests (6 new daemon-routed).
- `packages/daemon-client` integration: real-socket coded-error
  round-trip.

## Follow-ups (not this feature)

- `agent.stop`/`rename`/`send`/`open`/`pin` RPCs → then remove
  dual-write + import.
- `agent.started` payload could carry the enriched row once consumers
  need it.
- tmux PATH refresh for systemd-installed daemons.
