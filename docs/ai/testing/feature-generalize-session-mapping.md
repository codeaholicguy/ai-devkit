---
phase: testing
title: Generalize Process-to-Session Mapping — Testing
description: Test inventory and coverage for shared utilities and adapter refactoring
---

# Testing Strategy

## Test Coverage Goals

- 100% of new/changed code in shared utilities
- Adapter tests mock shared utils at module level (`jest.mock`)
- File I/O tests use real temp directories (`fs.mkdtempSync`)

## Test Suites (145 agent-manager + 348 CLI = 493 total)

### agent-manager: 145 tests, 7 suites

#### `utils/process.test.ts` (14 tests)

- **listAgentProcesses**: Parse ps aux output, post-filter by executable name, filter non-matching, empty output, command failure, empty pattern rejection, shell injection rejection, valid patterns with dashes/underscores
- **batchGetProcessCwds**: Parse lsof output, empty pids, partial results, total failure
- **batchGetProcessStartTimes**: Parse ps lstart output, empty pids, unparseable dates, failure
- **enrichProcesses**: Populate cwd + startTime, empty input, partial failures

#### `utils/session.test.ts` (9 tests)

- **batchGetSessionFileBirthtimes**: Parse stat output, empty dirs, command failure, invalid epochs, non-jsonl files, empty output, UUID session IDs, resolvedCwd left empty, multiple directories single call

#### `utils/matching.test.ts` (17 tests)

- **matchProcessesToSessions**: Empty processes, empty sessions, single match closest, 1:1 constraint, disambiguation by birthtime, exclude without startTime, exclude without cwd, CWD mismatch, delta exceeds tolerance, exact 3-min boundary, more sessions than processes, more processes than sessions, empty resolvedCwd, greedy ordering preference
- **generateAgentName**: Standard path, root path, empty cwd, nested paths

#### `adapters/ClaudeCodeAdapter.test.ts` (41 tests)

- **canHandle**: claude, full path, case-insensitive, non-claude, "claude" in path args
- **detectAgents**: No processes, no sessions (process-only fallback), matched sessions, unmatched processes fallback, empty cwd fallback
- **discoverSessions**: Non-existent projects dir, scan matching CWDs, non-existent encoded dir, dedup same CWD, skip empty cwd
- **determineStatus**: unknown, waiting (assistant), waiting (interrupted user), running (user/progress/thinking), idle (system), unknown (unrecognized), no age override
- **extractUserMessageText**: Plain string, array blocks, empty/null, command-message tags, command without args, skill ARGUMENTS, skill without ARGUMENTS, noise messages
- **readSession**: Full parse, interruption detection, empty file, non-existent, metadata entry skip, snapshot.timestamp, lastUserMessage, lastCwd as projectPath, malformed JSON

#### `adapters/CodexAdapter.test.ts` (27 tests)

- **canHandle**: codex, full path case-insensitive, non-codex, "codex" in path args
- **detectAgents**: No processes, no sessions, matched sessions, unmatched fallback
- **discoverSessions**: Non-existent dir, scan date dirs, ±1 day window, session without session_meta
- **determineStatus**: waiting (agent_message/task_complete/turn_aborted), running, idle (threshold)
- **parseSession**: Full parse, cached content, non-existent file, no session_meta, no id, summary extraction, malformed JSON, default summary, empty content, truncation

#### `AgentManager.test.ts` (13 tests)

- **registerAdapter**: Register, duplicate error, multiple types
- **unregisterAdapter**: Remove, non-existent
- **getAdapters**: Empty, all registered
- **listAgents**: Empty, single adapter, multiple adapters, status sort, adapter error handling, all fail
- **clear**: Remove all
- **resolveAgent**: Empty input, exact match, partial match, ambiguous, no match, prefer exact

#### `terminal/TtyWriter.test.ts` (24 tests)

- Terminal output formatting tests (unchanged by this feature)

### CLI: 348 tests, 24 suites

- All existing CLI tests pass after removing dead utility files (`util/process.ts`, `util/file.ts`)

## Running Tests

```bash
cd packages/agent-manager
npx jest           # all tests
npx jest --coverage  # with coverage report
```
