---
phase: testing
title: Testing Strategy
description: Test plan for daemon status-change events and `agent wait`
---

# Testing Strategy

## Test Coverage Goals

- 100% of new code paths in `agent-wait.service.ts`, `wait.command.ts`, and the Rust `status_changes` diff.
- Integration: the command wired through commander with mocked manager/daemon (same harness as `tests/commands/agent.test.ts`).
- Smoke: real `devkitd` + fake agent to observe an end-to-end `status_changed` → `agent wait` return.

## Unit Tests

### Rust `status_changes` (devkitd/src/server.rs tests)

- [x] Same `(pid, sessionId)` with different status → one change with from/to and agent payload
- [x] Unchanged status → no change
- [x] Row only in prev or only in cur → no status change (lifecycle handles it)
- [x] Same pid, different sessions → matched independently

### `parseWaitUntil`

- [x] Default when undefined → waiting, idle, exited
- [x] Comma list with spaces / mixed case accepted
- [x] Unknown token → error listing allowed values
- [x] Empty list → error

### `diffAgentChanges`

- [x] running → waiting with waiting in until → change
- [x] running → running → none
- [x] Already waiting at baseline, still waiting → none (edge-triggered)
- [x] waiting → idle with only waiting in until → none
- [x] Missing agent with exited in until → `to: "exited"`; without → none
- [x] New agent with appeared + unfiltered → `from: null, to: "appeared"`; filtered → none

### `waitForAgentChanges`

- [x] Wake event leading to transition returns `triggered` with changes
- [x] Changes within settle window are merged; later change for the same key wins
- [x] Settle window never extends past the deadline
- [x] No change before deadline → `timeout` with empty changes
- [x] Re-check fires every 30s with no events (covers no-daemon / lost subscription / older daemon)
- [x] Wakes during an in-flight check coalesce into one follow-up check
- [x] Watched-key filter ignores unrelated agents
- [x] Source closed on both outcomes

## Integration Tests

- [x] `agent wait --json` prints triggered result and exits 0
- [x] Timeout prints text message and exits 0
- [x] `--id` resolving to nothing / ambiguous → error, no wait
- [x] `--group` unknown → error; members resolved to watched keys
- [x] `--id` with `--group` → error
- [x] Invalid `--timeout` / `--until` → error
- [x] No daemon (`ensureDaemon` → null) uses local list and polling

## End-to-End Tests

- [x] Smoke (manual, sandboxed): real daemon + fake agent; flip session to waiting; `agent wait --json` returns within a few seconds with the transition
- [x] Regression: `agent list`, `agent send`, console still work (existing suites pass)

## Test Data

- AgentInfo fixtures built inline (name, type, pid, status, sessionId)
- Fake `AgentWaitSource` with scripted `list()` results and a manual `wake()` trigger; vitest fake timers for settle/deadline/poll

## Test Reporting & Coverage

- `npx vitest run` in `packages/cli` with coverage for touched files
- `cargo test -p devkitd`
