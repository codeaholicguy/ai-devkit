---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- 100% branch coverage of `tryPidFileMatching()`
- `detectAgents()` integration paths for direct-match and fallback-only scenarios
- No regression in existing tests

## Unit Tests

### `tryPidFileMatching()`

- [x] PID file present + JSONL exists + `startedAt` within 60 s of `proc.startTime` → process in `direct` with correct `sessionId` and `resolvedCwd`
- [x] PID file present + JSONL missing → process in `fallback`
- [x] PID file present but `startedAt` > 60 s from `proc.startTime` (stale/reused PID) → process in `fallback`
- [x] `startedAt` within 30 s (boundary) → accepted as direct match
- [x] PID file absent for a PID (file not found) → process in `fallback`, no crash
- [x] PID file contains malformed JSON → process in `fallback` (no throw)
- [x] Sessions dir entirely absent (no PID file for any process) → all processes in `fallback`, no crash
- [x] Mixed: 2 PIDs with files, 1 without → correct split across `direct` and `fallback`
- [x] `proc.startTime` is undefined (enrichment failed) → stale-file check skipped, proceed normally

### `detectAgents()` integration

- [x] All direct matches: `discoverSessions` and `matchProcessesToSessions` not called
- [x] Mixed: direct matches merged correctly with legacy matches in final `AgentInfo` list
- [x] Direct match produces `AgentInfo` with correct `sessionId`
- [x] Direct-matched JSONL becomes unreadable after existence check → process falls back to IDLE
- [x] Legacy-matched JSONL becomes unreadable after match → process falls back to IDLE

## Test Data

Real `tmp` directories with JSON/JSONL fixtures. `jest.spyOn` used only for race-condition branches (lines 128, 141).

## Test Reporting & Coverage

Run: `cd packages/agent-manager && npm test -- --coverage --collectCoverageFrom='src/adapters/ClaudeCodeAdapter.ts'`

| Metric | Result |
|--------|--------|
| Statements | 98.73% |
| Branches | 89.79% |
| Functions | 100% |
| Lines | 99.35% |

**Remaining gap — line 314** (`return null` after `allLines.length === 0` in `readSession`): dead code. `''.trim().split('\n')` always returns `['']` (length ≥ 1), so this condition is structurally unreachable. No test can cover it without modifying the source.
