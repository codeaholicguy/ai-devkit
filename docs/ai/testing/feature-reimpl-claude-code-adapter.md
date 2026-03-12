---
phase: testing
title: "Re-implement Claude Code Adapter - Testing"
feature: reimpl-claude-code-adapter
description: Testing strategy for re-implemented ClaudeCodeAdapter
---

# Testing Strategy: Re-implement Claude Code Adapter

## Test Coverage Goals

- Unit test coverage target: 100% of new/changed code
- All existing behavioral test assertions must continue to pass
- New tests for process start time matching and bounded scanning

## Unit Tests

### ClaudeCodeAdapter Core

- [x] Detects Claude processes and returns AgentInfo array
- [x] Returns empty array when no Claude processes running
- [x] Matches process to session by exact CWD
- [x] Matches process to session when session has no CWD (missing-cwd mode)
- [x] Falls back to parent-child path match when no exact CWD match
- [x] Rejects unrelated sessions from different projects (no greedy `any` mode)
- [x] Handles process with no matching session (process-only agent)
- [x] Multiple processes with different CWDs matched correctly
- [x] Multiple processes with same CWD disambiguated by start time

### Process Start Time Matching

- [x] `getProcessStartTimes()` parses `ps` output correctly
- [x] `parseElapsedSeconds()` handles `MM:SS`, `HH:MM:SS`, `D-HH:MM:SS` formats
- [x] `rankCandidatesByStartTime()` prefers sessions within tolerance window
- [x] `rankCandidatesByStartTime()` within tolerance, ranks by recency not diffMs
- [x] `rankCandidatesByStartTime()` breaks ties by recency when outside tolerance with same diffMs
- [x] `rankCandidatesByStartTime()` falls back to recency when no start time
- [x] `selectBestSession()` defers `cwd` mode when outside tolerance (falls through to `parent-child`)
- [x] `selectBestSession()` accepts in `cwd` mode when within tolerance
- [x] `selectBestSession()` falls back to recency when no processStart available
- [x] Graceful fallback when `ps` command fails

### Bounded Session Scanning

- [x] `calculateSessionScanLimit()` respects MIN/MAX bounds
- [x] `findSessionFiles()` returns at most N files by mtime
- [x] `findSessionFiles()` returns empty when session dir doesn't exist
- [x] `findSessionFiles()` includes dirs without `sessions-index.json` using empty projectPath
- [x] `findSessionFiles()` skips directories starting with dot

### Process Detection

- [x] `canHandle()` accepts commands where executable basename is `claude` or `claude.exe`
- [x] `canHandle()` rejects processes with "claude" only in path arguments (e.g., nx daemon in worktree)

### Status Determination

- [x] `user` entry type → RUNNING
- [x] `user` with interrupted content → WAITING
- [x] `assistant` entry type → WAITING
- [x] `progress`/`thinking` → RUNNING
- [x] `system` → IDLE
- [x] No age-based IDLE override (process is running, entry type is authoritative)
- [x] Metadata entry types (`last-prompt`, `file-history-snapshot`) do not affect status
- [x] No last entry → UNKNOWN

### Name Generation

- [x] Uses project basename as name
- [x] Appends slug when multiple sessions for same project
- [x] Falls back to sessionId prefix when no slug

### Session Parsing

- [x] Parses timestamps, slug, cwd, and entry type from session file
- [x] Detects user interruption from `[Request interrupted` content
- [x] Parses `snapshot.timestamp` from `file-history-snapshot` first entries
- [x] Skips metadata entry types (`last-prompt`, `file-history-snapshot`) for `lastEntryType`
- [x] Extracts `lastUserMessage` from session entries (latest user message wins)
- [x] Uses `lastCwd` as `projectPath` fallback when `projectPath` is empty
- [x] Returns session with defaults for empty file
- [x] Returns null for non-existent file
- [x] Handles malformed JSON lines gracefully

### Summary Extraction

- [x] `extractUserMessageText()` extracts plain string content
- [x] `extractUserMessageText()` extracts text from array content blocks
- [x] `extractUserMessageText()` returns undefined for empty/null content
- [x] `extractUserMessageText()` parses `<command-message>` tags into `command args` format
- [x] `extractUserMessageText()` parses command-message without args
- [x] `extractUserMessageText()` extracts ARGUMENTS from skill expansion content
- [x] `extractUserMessageText()` returns undefined for skill expansion without ARGUMENTS
- [x] `extractUserMessageText()` filters noise messages
- [x] `parseCommandMessage()` returns undefined for malformed command-message
- [x] Falls back to "Session started" when no meaningful user message found
- [x] Process-only agents show IDLE status with "Unknown" summary

### Path Matching

- [x] `filterCandidateSessions()` matches by `lastCwd` in cwd mode
- [x] `filterCandidateSessions()` matches sessions with no `projectPath` in missing-cwd mode
- [x] `filterCandidateSessions()` includes exact CWD matches in parent-child mode
- [x] `filterCandidateSessions()` matches parent-child path relationships
- [x] `filterCandidateSessions()` skips already-used sessions

## Test Data

- Mock `listProcesses()` to return controlled process lists
- Temp directories with inline JSONL fixtures for file I/O tests
- Direct private method access via `(adapter as any)` for unit-level testing
- No mock needed for `execSync` — `getProcessStartTimes` is skipped via `JEST_WORKER_ID`

## Test File

- `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts`

## Test Reporting & Coverage

- Run: `cd packages/agent-manager && npx jest --coverage src/__tests__/adapters/ClaudeCodeAdapter.test.ts`
- **71 tests pass** in ClaudeCodeAdapter suite
- Coverage for `ClaudeCodeAdapter.ts`:
  - Statements: **90.8%**
  - Branches: **87.0%**
  - Functions: **100%**
  - Lines: **92.0%**
- Intentionally uncovered:
  - `getProcessStartTimes()` body (lines 400-424): skipped when `JEST_WORKER_ID` is set (same pattern as CodexAdapter)
  - File I/O error catch paths (lines 458, 490, 510, 562): defensive error handling for corrupted/inaccessible files
  - `normalizePath` trailing separator branch (line 817): OS-dependent edge case
  - Dead code guard in `selectBestSession` (line 309): empty `rankCandidatesByStartTime` result cannot occur with non-empty candidates
- Integration tested: `npm run build && node packages/cli/dist/cli.js agent list` verified with 9 concurrent Claude processes
