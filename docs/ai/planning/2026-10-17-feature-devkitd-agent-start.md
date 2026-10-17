---
phase: planning
title: Plan — devkitd-agent-start
description: Task breakdown for agent.start RPC — proto, schema, Rust runtimes, orchestration, daemon-client, CLI routing
---

# Plan — devkitd-agent-start

## Milestones

- [x] M1: Wire contract + schema (proto code/details, agents-table registry
  columns, snapshot rules)
- [x] M2: Rust runtime layer (start profiles + matchers, tmux, herdr)
- [x] M3: `agent.start` handler + registry overlay + events + bridge
  (dual-write, boot import)
- [x] M4: TS client + CLI routing/fallback
- [ ] M5: Full verification + docs

## Task Breakdown

### M1 — wire contract + schema

- [x] T1.1: `proto.rs` — add `code: Option<String>` +
  `details: Option<Value>` to `Response` (skip_serializing_if None); add
  `AgentStartParams`/`AgentStartResult` structs with ts-rs exports;
  `Response::err` variants keep `code=None` unless provided. Verify:
  `cargo test -p devkit-core` regenerates `gen/*.ts`.
- [x] T1.2: `store.rs` — extend `agents` migration block: add `name`,
  `agent_type`, `runtime`, `runtime_ref`, `pinned`, `registered_at`
  columns (PRAGMA table_info loop like `start_time_ms`); create partial
  unique index `idx_agents_name`. Verify: fresh + existing-db open both
  succeed (unit test).
- [x] T1.3: `store.rs` — new snapshot rules in `apply_agent_snapshot`:
  NULL-`start_time_ms` rows excluded from `gone` (adopted by upsert);
  non-NULL identity change → full delete; absent pid with `name` →
  tombstone keep; absent pid without name → delete. Plus
  `register_start` upsert, `lookup_name`, `live_names` (names whose pids
  are in last snapshot), `prune_dead`. Verify: unit tests per testing doc
  (registered-before-swept, pid reuse, tombstone, unique name).
- [x] T1.4: `store.rs` — legacy bridge: `import_legacy_agents(path)` run
  on `Store::open` (delta merge, tombstone insert for rows whose
  (type,pid) not registered and pid not live); `dual_write_legacy(row)`
  used by register when `~/.ai-devkit/agents.db` exists at schema v5.
  Verify: fixture-db unit tests.

### M2 — Rust runtime layer

- [x] T2.1: `devkit-harness/src/start_profiles.rs` — `MatchSpec` enum +
  `matches()` porting `tokensOf`/`basenameOf`/`mayContinueArgv0`/
  `executablePath` (incl. `isFile` probing); `StartProfile` table for all
  11 types; `start_profile(type) -> Option<StartProfile>`. Verify: ported
  matcher tests incl. spaced-dir tmpdir cases green.
- [x] T2.2: `devkitd/src/runtime/mod.rs` — `AgentRuntime` trait,
  `Availability`, `StartInput`, `StartOutput`, `StartError`; command-runner
  seam (argv0/PATH injectable).
- [x] T2.3: `runtime/tmux.rs` — `TmuxRuntime`: `-V` availability;
  session_exists/create/send_keys/list_pane_pids/kill_session;
  `pgrep -P` BFS + `ps -o command=`; `poll_for_pid` (interval, timeout,
  5-stable rule); timeout → kill_session + `pid_poll_timeout`. Verify:
  fake-tmux script tests.
- [x] T2.4: `runtime/herdr.rs` — `HerdrRuntime`: `--version` +
  `api snapshot` availability; `workspace create` parse; `agent start`
  with `agent_pane_busy` retry (5s/100ms); `pane process-info` poll
  (3s/100ms, foreground-first then shell_pid); runtimeRef build. Verify:
  fake-herdr JSON script tests incl. busy-retry.

### M3 — handler + registry integration

- [x] T3.1: `devkitd/src/agent_start.rs` — orchestration: validate
  (name regex `/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/` ported without regex
  crate, cwd isdir, type→profile, runtime known), default-name
  generation `{basename-sanitized}-{ts36}`, availability, `start_mutex`
  → live-name check → orphan-session warning → `runtime.start` →
  `register_start` + dual-write → `emit("agent.started")` →
  `apply_sweep()` → result + warnings.
- [x] T3.2: `server.rs` — `Daemon.start_mutex`; `"agent.start"` arm in
  `dispatch` (NOT in `INLINE_METHODS`); error→code mapping
  (`name_in_use`, `runtime_unavailable`, `pid_poll_timeout`,
  `harness_not_startable`, `invalid_params`, `internal`).
- [x] T3.3: Enriched overlay in `apply_sweep` — after `enrich`, rows with
  `name` override `EnrichedAgent.name` and `pinned`.
- [x] T3.4: `Store::open` boot import wiring + `agent.list` returns
  overlayed names. Verify: e2e socket test — start → list shows name;
  subscribe sees `agent.started` + `agent.appeared`.

### M4 — TS client + CLI

- [x] T4.1: `daemon-client` — `DaemonClient.startAgent(params)`;
  `DaemonRpcError` exposing `code`/`details`; per-request timeout
  override for long-running methods. Verify: vitest socket roundtrip
  (build devkitd first — `DEVKITD_BIN`).
- [x] T4.2: `cli start.command.ts` — daemon-first routing via
  `tryConnect`/`ensureDaemon`; `params.runtime` from `ConfigManager`;
  `warnings` → `ui.warning`; error codes → existing message texts; on
  connect-fail/`unknown method` → existing `startAgent` unchanged;
  `--mode durable` bypasses daemon path entirely.
- [ ] T4.3: Verify `nx test` for `daemon-client` + `cli` packages;
  `agent.test.ts` untouched and green.

### M5 — verification + docs

- [ ] T5.1: `cargo fmt --check`, `cargo clippy -- -D warnings`,
  `cargo test --workspace` green.
- [ ] T5.2: `nx run-many -t build,test,lint` green.
- [ ] T5.3: Manual smoke on macOS: real `tmux`, shim binary, `agent
  start` via daemon; attach hint; `agent list` name; `agent kill`
  cleanup (proves dual-write worked).
- [ ] T5.4: Implementation doc + changelog entry.

## Sequencing notes & risks

- T1.3 must land before T3.1 (handler depends on registry primitives).
- T2.x are parallel-safe; T2.1 gates both.
- Risk: `executablePath` filesystem probing — port semantics exactly;
  spaced-dir tests exist to catch drift.
- Risk: stale-binary trap in daemon-client tests — always
  `cargo build -p devkitd` before vitest (memory note: tests auto-select
  `rust/target/{release,debug}`).
- Risk: `agent.appeared` + `agent.started` both firing — accepted;
  subscribers dedupe by pid.
- Follow-up (not this feature): `agent.stop`/`rename`/`send`/`open` RPCs
  let the legacy dual-write be removed; `Response.details` reusable for
  them.
