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

- [ ] Detects Claude processes and returns AgentInfo array
- [ ] Returns empty array when no Claude processes running
- [ ] Matches process to session by exact CWD
- [ ] Matches process to session when session has no CWD (missing-cwd mode)
- [ ] Falls back to any available session when no CWD match
- [ ] Handles process with no matching session (process-only agent)
- [ ] Multiple processes with different CWDs matched correctly
- [ ] Multiple processes with same CWD disambiguated by start time

### Process Start Time Matching

- [ ] `getProcessStartTimes()` parses `ps` output correctly
- [ ] `parseElapsedSeconds()` handles `MM:SS`, `HH:MM:SS`, `D-HH:MM:SS` formats
- [ ] `rankCandidatesByStartTime()` prefers sessions within tolerance window
- [ ] `rankCandidatesByStartTime()` falls back to recency when no start time
- [ ] Graceful fallback when `ps` command fails

### Bounded Session Scanning

- [ ] `calculateSessionScanLimit()` respects MIN/MAX bounds
- [ ] `findSessionFiles()` returns at most N files by mtime
- [ ] Session files from process-start-day window included

### Status Determination

- [ ] `user` entry type → RUNNING
- [ ] `user` with interrupted content → WAITING
- [ ] `assistant` entry type → WAITING
- [ ] `progress`/`thinking` → RUNNING
- [ ] `system` → IDLE
- [ ] Age > 5 minutes → IDLE (overrides entry type)
- [ ] No last entry → UNKNOWN

### Name Generation

- [ ] Uses project basename as name
- [ ] Appends slug when multiple sessions for same project
- [ ] Falls back to sessionId prefix when no slug

### History Summary

- [ ] Reads summary from history.jsonl by sessionId
- [ ] Falls back to default summary when no history match

## Test Data

- Mock `listProcesses()` to return controlled process lists
- Mock `fs` operations for session file reads
- Mock `execSync` for `ps` output in start time tests
- Use inline JSONL fixtures for session and history data

## Test Reporting & Coverage

- Run: `npx jest packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts --coverage`
- Target: 100% line/branch coverage for `ClaudeCodeAdapter.ts`
