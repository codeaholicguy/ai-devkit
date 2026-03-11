---
phase: planning
title: "Re-implement Claude Code Adapter - Planning"
feature: reimpl-claude-code-adapter
description: Task breakdown for re-implementing ClaudeCodeAdapter
---

# Planning: Re-implement Claude Code Adapter

## Milestones

- [x] Milestone 1: Core rewrite — adapter compiles and passes existing tests
- [x] Milestone 2: Process start time matching — improved accuracy
- [x] Milestone 3: Bounded scanning + test coverage — performance + quality

## Task Breakdown

### Phase 1: Core Structural Rewrite

- [x] Task 1.1: Restructure `ClaudeCodeAdapter` internal session model
  - Add `sessionStart`, `lastEntryType`, `summary` fields to `ClaudeSession`
  - Remove `lastEntry` (replace with `lastEntryType`)
  - Keep `slug` field (Claude-specific)
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [x] Task 1.2: Extract `listClaudeProcesses()` helper
  - Mirror CodexAdapter's `listCodexProcesses()` pattern
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [x] Task 1.3: Rewrite `readSessions()` with bounded scanning
  - Implement `calculateSessionScanLimit()` with same constants as CodexAdapter
  - Implement `findSessionFiles()` adapted for Claude's `~/.claude/projects/*/` structure
  - Collect all `*.jsonl` with mtime, sort descending, take top N (no process-day window — mtime sufficient for project-based dirs)
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [x] Task 1.4: Rewrite `readSession()` for single session parsing
  - Parse first entry for `sessionStart` timestamp (including `snapshot.timestamp` for `file-history-snapshot` entries)
  - Read all lines for `lastEntryType`, `lastActive`, `lastCwd`, `slug` (skip metadata entry types)
  - Extract `lastUserMessage` from session JSONL with command parsing and noise filtering
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [x] Task 1.5: Rewrite matching flow to `cwd` → `missing-cwd` → `parent-child`
  - Implement `assignSessionsForMode()`, `filterCandidateSessions()`, `addMappedSessionAgent()`, `addProcessOnlyAgent()`
  - Remove `assignHistoryEntriesForExactProcessCwd()` and old `project-parent` mode
  - `parent-child` mode matches when process CWD equals, is parent, or child of session path (avoids greedy `any` mode)
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [x] Task 1.6: Rewrite `determineStatus()` and `generateAgentName()`
  - Status: same logic but using `lastEntryType` string instead of `lastEntry` object
  - Name: keep slug-based disambiguation
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

### Phase 2: Process Start Time Matching

- [x] Task 2.1: Implement `getProcessStartTimes()`
  - Use `ps -o pid=,etime=` to get elapsed time, calculate start time
  - Implement `parseElapsedSeconds()` helper
  - Skip in test environment (`JEST_WORKER_ID`)
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [x] Task 2.2: Implement `rankCandidatesByStartTime()`
  - Tolerance-based ranking matching CodexAdapter pattern
  - Use same `PROCESS_SESSION_TIME_TOLERANCE_MS` constant
  - Integrate into `selectBestSession()`
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

- [x] Task 2.3: Wire process start times into `detectAgents()` and `assignSessionsForMode()`
  - Pass `processStartByPid` through matching pipeline
  - Files: `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`

### Phase 3: Tests + Cleanup

- [x] Task 3.1: Update existing unit tests for new internal structure
  - Update mocking to match new method signatures
  - Keep all behavioral assertions
  - Files: `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts`

- [x] Task 3.2: Add tests for process start time matching
  - Test `getProcessStartTimes()`, `parseElapsedSeconds()`, `rankCandidatesByStartTime()`
  - Test multi-process same-CWD disambiguation
  - Files: `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts`

- [x] Task 3.3: Add tests for bounded session scanning
  - Test `calculateSessionScanLimit()`, `findSessionFiles()`
  - Verify scan limits are respected
  - Files: `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts`

- [x] Task 3.4: Verify CLI integration (manual smoke test)
  - Run `agent list` with Claude processes, confirm output matches expectations
  - No code changes expected

## Dependencies

- Task 1.1 → Tasks 1.2–1.6 (session model must be defined first)
- Tasks 1.2–1.6 can be done in any order after 1.1
- Phase 2 depends on Phase 1 completion
- Phase 3 depends on Phase 2 completion

## Progress Summary

All tasks complete. ClaudeCodeAdapter rewritten from 598 to ~800 lines following CodexAdapter patterns. Key changes:
- Added process start time matching (`getProcessStartTimes`, `rankCandidatesByStartTime`)
- Bounded session scanning with breadth guarantee (`findSessionFiles` ensures one session per project dir)
- Restructured matching to `cwd` → `missing-cwd` → `parent-child` phases with tolerance-gated deferral
- Simplified session model: `lastEntryType` + `isInterrupted` + `lastUserMessage`
- Removed history.jsonl dependency — summary extracted from session JSONL `lastUserMessage`
- Smart message extraction: parses `<command-message>` tags, extracts ARGUMENTS from skill expansions, filters noise
- Metadata entry types (`last-prompt`, `file-history-snapshot`) excluded from status tracking
- Process-only agents show IDLE status with "Unknown" summary
- All 71 tests pass in ClaudeCodeAdapter suite, TypeScript compiles clean

Runtime fixes discovered during integration testing:
- **`any` → `parent-child` mode**: `any` mode was too greedy, stealing sessions from unrelated projects
- **`isClaudeExecutable`**: precise basename check instead of `command.includes('claude')`
- **Optional `sessions-index.json`**: falls back to `lastCwd` from session JSONL content
- **Breadth-first scanning**: ensures at least one session per project directory before filling remaining slots
- **Full-file user message scan**: parses all session lines (not just last 100) to find meaningful user messages
- **`file-history-snapshot` timestamp**: first JSONL entry may be `file-history-snapshot` with timestamp nested in `snapshot.timestamp` instead of top-level `timestamp`. Falling back to `lastActive` caused wrong session matching when a stale session's last activity coincided with a new process start
- **No age-based IDLE override**: removed 5-minute IDLE threshold since every listed agent is backed by a running process — entry type is the correct status indicator
- **Metadata entry type filtering**: `last-prompt` and `file-history-snapshot` entries are metadata, not conversation state. Skipping them via `isMetadataEntryType()` prevents them from overwriting `lastEntryType` and causing UNKNOWN status
- **Tolerance-gated CWD matching**: `cwd` and `missing-cwd` modes now defer assignment when the best candidate is outside start-time tolerance. This prevents stale sessions from being matched when a better match exists in `parent-child` mode (e.g., worktree sessions where process CWD is the main repo but session CWD is the worktree)
- **Recency-first ranking within tolerance**: when multiple sessions are within the 2-minute tolerance, sort by `lastActive` (most recent first) instead of smallest `diffMs`. Fixes stub sessions (3 lines) beating real sessions (270+ lines) due to a few seconds' start-time advantage
- **`parent-child` mode includes exact CWD**: expanded to also accept exact CWD matches as a safety net for deferred `cwd` assignments. Old processes whose sessions were created days later get matched correctly

Behavioral changes from original:
- `parent-child`-mode matching replaces `project-parent` and `assignHistoryEntriesForExactProcessCwd`
- Session JSONL provides summaries directly (no history.jsonl dependency)
- Process-only agents show IDLE/Unknown instead of RUNNING/"Claude process running"

## Risks & Mitigation

- **Risk**: Session file format assumptions may differ from edge cases.
  - Mitigation: Keep `readSession()` defensive with try/catch; test with varied fixtures.
- **Risk**: Process start time unavailable on some systems.
  - Mitigation: Graceful fallback to recency-based ranking (same as CodexAdapter).
- **Risk**: Bounded scanning may miss relevant sessions.
  - Mitigation: Breadth-first scanning ensures at least one session per project directory; mtime-based top-N covers most-recently-active sessions.
