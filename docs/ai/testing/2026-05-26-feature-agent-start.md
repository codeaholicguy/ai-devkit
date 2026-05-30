---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- Unit coverage of the two new modules (`AgentRegistry`, `TmuxManager`) with mocked process/filesystem I/O.
- Integration coverage of `agent start` end-to-end via the existing CLI command test (`packages/cli/src/__tests__/commands/agent.test.ts`), which mocks `@ai-devkit/agent-manager`.
- Manual smoke test for the real tmux + agent-binary path (out of scope for CI).

## Unit Tests

### `AgentRegistry` — `packages/agent-manager/src/__tests__/utils/AgentRegistry.test.ts` (15 tests)

- `register`: creates file + parent dir, appends new entries, upserts in place by `name`, leaves no `.tmp` after success
- `lookup`: returns `null` for missing, returns entry for match
- `list`: empty array when file missing, when malformed JSON, when `entries` is not an array
- `isAlive`: true for `process.pid`, false for unused PID `999999`
- `prune`: removes dead-PID entries, no-op when all alive, no-op when file missing
- `default()`: returns a stable singleton

### `TmuxManager` — `packages/agent-manager/src/__tests__/terminal/TmuxManager.test.ts` (14 tests)

`child_process.execFile` is mocked via a per-call handler that branches on `(cmd, args)`.

- `isAvailable`: true on `tmux -V` success, false on ENOENT
- `sessionExists`: true on `has-session` success, false on failure
- `createSession` / `sendKeys`: exact `execFile` argv assertions (`-d -s <name> -c <cwd>`, trailing `Enter`)
- `killSession`: swallows "can't find session"
- `findAgentPid`:
  - Returns `null` when pane lookup fails
  - Returns `null` when no descendant matches
  - Returns the matching child when found
  - **Deepest-match rule**: wrapper case — picks descendant over parent when both match
  - **Subprocess filter**: MCP child case — picks matching parent, ignores non-matching child
  - **Gemini Node-script shape**: token-scan matcher handles `node /path/to/gemini`
  - Multiple children at the same level: picks the matching sibling

## Integration Tests

`packages/cli/src/__tests__/commands/agent.test.ts` mocks the new `AgentRegistry`, `TmuxManager`, and `AGENTS` exports so the existing `agent list` / `send` / `open` tests continue to pass with the new imports in `agent.ts`. There are no dedicated `agent start` integration tests in CI — the behavior is covered by the unit tests above plus manual smoke. A future iteration could add commander-driven `start` tests against the mocked surface; not blocking for v1.

## End-to-End Tests

Manual smoke (not in CI):

- `agent start --type claude --name test-claude` in a real shell with tmux and the claude CLI installed
- Confirm `~/.ai-devkit/agents.json` contains the entry with the agent PID (not the wrapper)
- `agent list` shows `test-claude`
- `agent send --id test-claude "hello"` reaches the agent
- `tmux kill-session -t test-claude`; rerun `agent start` — replacement path works

## Test Data

- `AgentRegistry`: real filesystem under `fs.mkdtempSync(...)`, removed in `afterEach`. No fixtures.
- `TmuxManager`: pure mocked `execFile` — no fixtures.

## Test Reporting & Coverage

- `npm test` runs the full Nx pipeline (4 projects). 650 tests total (621 CLI + 29 new agent-manager).
- `cd packages/agent-manager && npm run test:coverage` for v8 coverage; package threshold is 70/70/70/70.
- New files comfortably exceed the package threshold; all happy-path and named edge cases above are covered.

## Manual Testing

- macOS + Linux: confirm `pgrep -P <pid>` resolves children inside the tmux pane environment.
- Verify agent binaries (`claude`, `codex`, `gemini`, `opencode`) are reachable inside `tmux new-session -d -c <cwd>` (PATH inheritance).

## Performance Testing

Not applicable. Registry I/O is a small JSON file; PID poll is bounded at 5s.

## Bug Tracking

Standard GitHub issues. Regressions in `agent start` should add a new mocked-execFile case to `TmuxManager.test.ts` reproducing the bug.
