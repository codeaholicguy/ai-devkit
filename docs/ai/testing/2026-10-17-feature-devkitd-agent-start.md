---
phase: testing
title: devkitd-agent-start test coverage
description: Rust unit + socket e2e for agent.start, tmux/herdr via fake-CLI fixtures, snapshot-rule tests, daemon-client and CLI fallback tests
---

# Testing — devkitd-agent-start

## Test Coverage Goals

- 100% coverage on new Rust modules (`start_profiles`, `runtime/*`,
  `agent_start` handler) and new `store.rs` registry paths.
- Socket-level e2e mirroring existing `server.rs` tests (temp dir, real
  unix socket).
- External tools (`tmux`, `herdr`, `pgrep`, `ps`) faked with PATH-injected
  shell-script fixtures — no real tmux/herdr required in CI.
- CLI behavior identical on daemon path and fallback path.

## Unit Tests

### `devkit-harness::start_profiles` + `MatchSpec`

- [x] Port every case from `runtimeProfiles.test.ts`: argv0 match rejects
  similar argument text; discovery aliases resolve; versioned launcher
  (muse) profiles.
- [x] Spaced-directory cases: argv0 under `My Apps/`, distribution-name
  match, argument-containing-spaces not treated as executable, "agent word
  inside executable directory" non-match. Uses a tmpdir fixture for
  `isFile` probing.
- [x] All 11 `StartableAgentType`s have profiles; unknown type → `None`
  → `harness_not_startable`.
- [x] kiro profile: `command == "kiro-cli"`, `runtime_kind == "kiro"`.

### `devkit-core::store` — registry columns + snapshot rules

- [x] `register_start` upsert: new row gets name/type/runtime/ref;
  conflict on pid preserves sweep columns, updates registry columns.
- [x] Registered-before-swept: row with `start_time_ms NULL` + name, then
  sweep sees `(pid, real_st)` → row updated, not deleted; `appeared`
  contains pid; `gone` does not.
- [x] Pid reuse: named row with old `start_time_ms`, sweep sees same pid
  new `start_time_ms` → row deleted+reinserted, name cleared;
  disappeared+appeared both emitted.
- [x] Tombstone: named row's pid absent from sweep → row survives, not in
  `gone`… wait — it IS gone (disappeared event must fire) but row kept.
  Assert: `agent.disappeared` fires once, row survives with name.
- [x] Tombstone pid reuse: dead named row, new proc takes pid → name
  freed, no inheritance.
- [x] Name UNIQUE index: second `register_start` same name → constraint
  error → `name_in_use`.
- [x] `prune_dead`: named rows whose pids absent from live snapshot are
  reclaimed by `name_is_live` check.
- [x] Delta import: legacy `agents.db` rows appear as tombstones; existing
  daemon rows win.

### `devkitd::runtime::tmux`

- [x] Fake `tmux` script: `-V` ok → available; missing → `binary-missing`.
- [x] Start sequence argv exact: `new-session -d -s N -c C`,
  `send-keys -t N <command> Enter`.
- [x] Existing session → `kill-session` before create; warning surfaced.
- [x] Pid polling: fake `list-panes`/`pgrep`/`ps` returning matching
  command → pid returned; stability rule needs 5 identical polls (fake
  returns alternating pids → keeps polling).
- [x] Timeout → `kill-session` issued → `pid_poll_timeout`.
- [x] Descendant match at depth >1 (pane→shell→node→claude chain).

### `devkitd::runtime::herdr`

- [x] Availability: `--version` ok + `api snapshot` ok → available; ENOENT
  → `binary-missing`; snapshot failure → `backend-unreachable`.
- [x] `workspace create` JSON → `workspace_id` + `root_pane.pane_id`;
  missing pane id → error.
- [x] `agent start` argv: `--kind`, `--pane`, `--timeout`, `-- args`.
- [x] `agent_pane_busy` JSON error → retried within 5s/100ms budget;
  persistent busy → `runtime_unavailable`-class error.
- [x] `pane process-info`: `foreground_processes[0].pid` preferred;
  fallback `shell_pid`; poll till deadline.
- [x] runtimeRef shape: `{session:"default", workspaceId, tabId, paneId,
  agentName}`.

### `devkitd::agent_start` handler + `server.rs` dispatch

- [x] Validation: bad name regex, missing cwd, unknown type, unknown
  runtime → `invalid_params`/`harness_not_startable`.
- [x] `name_in_use` with live pid → error carries `pid` in `details`.
- [x] Dead named row → pruned, start proceeds (liveness-aware name check).
- [x] `agent.started` emitted with entry payload; replayable via
  `subscribe afterSeq`.
- [x] Concurrent same-name starts serialized by `start_mutex` → exactly
  one succeeds.
- [x] Post-start `agent.list` shows registered name (enriched overlay).
- [x] `Response.code`/`details` serialize; old `error` string intact.
- [x] Dual-write: legacy db fixture receives row; missing legacy file →
  skip silently.
- [x] Client disconnect mid-start → start completes, row registered.

### `daemon-client` TS

- [x] `startAgent` params/result wire roundtrip over real socket
  (`DEVKITD_BIN` override; build `cargo build -p devkitd` first — see
  stale-binary memory note).
- [x] Error code → `DaemonRpcError` with `code`/`details`.
- [x] `unknown method` from old daemon → distinguishable for fallback.

### `cli` TS

- [x] `agent start` with daemon up → result printed, warnings forwarded,
  exit 0 (mock DaemonClient).
- [x] Daemon down / `unknown method` → TS `startAgent` invoked (spy).
- [x] Each error code maps to the same `ui.error` text as today's typed
  errors; exit code 1 preserved.
- [x] `--mode durable` never touches the daemon path.
- [x] Existing `agent.test.ts` suite stays green (fallback path).

## Integration / E2E

- [x] Temp HOME: daemon serve → `agent.start` → `agent.list` shows name;
  `subscribe` sees `agent.started` then `agent.appeared`.
- [x] Real `tmux` smoke (manual/CI-optional, macOS+Linux): actual session,
  actual `claude`-shim binary, attach hint correct.
- [x] Kill spawned proc → `agent.disappeared` + tombstone; start same name
  again → succeeds (name freed by prune).

## Mocks / fixtures

- `rust/crates/devkitd/tests/fixtures/`: fake `tmux`, `herdr`, `pgrep`,
  `ps` shell scripts driven by env-provided state files.
- Legacy `agents.db` fixture at schema v5 with representative rows.
- Reuse existing `server.rs` tempdir-socket test harness.

## Coverage target

New Rust code ≥ 90% line coverage; all error codes exercised; both
runtimes covered by fake-CLI tests; CLI fallback covered by vitest.
