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
- [x] `rankCandidatesByStartTime()` falls back to recency when no start time
- [x] `selectBestSession()` defers `cwd` mode when outside tolerance (falls through to `parent-child`)
- [x] Graceful fallback when `ps` command fails

### Bounded Session Scanning

- [x] `calculateSessionScanLimit()` respects MIN/MAX bounds
- [x] `findSessionFiles()` returns at most N files by mtime
- [x] `findSessionFiles()` returns empty when session dir doesn't exist
- [x] `findSessionFiles()` includes dirs without `sessions-index.json` using empty projectPath

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

### Summary Extraction

- [x] Uses `lastUserMessage` from session JSONL as "Working On" text
- [x] Parses `<command-message>` tags into `/command args` format for slash commands
- [x] Extracts ARGUMENTS from skill expansion content ("Base directory for this skill:...")
- [x] Filters noise messages: "[Request interrupted...]", "Tool loaded.", continuation summaries
- [x] Falls back to "Session started" when no meaningful user message found
- [x] Process-only agents show IDLE status with "Unknown" summary

## Test Data

- Mock `listProcesses()` to return controlled process lists
- Mock `fs` operations for session file reads
- Mock `execSync` for `ps` output in start time tests
- Use inline JSONL fixtures for session data

## Test Reporting & Coverage

- Run: `cd packages/agent-manager && npx jest --coverage src/__tests__/adapters/ClaudeCodeAdapter.test.ts`
- Uncoverable: `getProcessStartTimes` body (skipped in JEST_WORKER_ID — same pattern as CodexAdapter)
- All 51 tests pass in ClaudeCodeAdapter suite
- Integration tested: `npm run build && node packages/cli/dist/cli.js agent list` verified with 9 concurrent Claude processes
