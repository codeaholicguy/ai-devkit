---
phase: implementation
title: "Re-implement Claude Code Adapter - Implementation"
feature: reimpl-claude-code-adapter
description: Implementation notes for re-implementing ClaudeCodeAdapter
---

# Implementation Guide: Re-implement Claude Code Adapter

## Development Setup

- Worktree: `.worktrees/feature-reimpl-claude-code-adapter`
- Branch: `feature-reimpl-claude-code-adapter`
- Dependencies: `npm ci` in worktree root

## Code Structure

Single file rewrite:
```
packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts  ← full rewrite
packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts  ← update tests
```

No changes to exports, index files, or CLI command.

## Implementation Notes

### Method Mapping (Current → New)

| Current Method | New Method (CodexAdapter pattern) |
|---|---|
| `detectAgents()` | `detectAgents()` — restructured with 3-phase matching |
| `readSessions()` (reads all) | `readSessions(limit, processStartByPid)` — bounded |
| — | `listClaudeProcesses()` — extracted |
| — | `calculateSessionScanLimit()` — new |
| — | `getProcessStartTimes()` — new |
| — | `findSessionFiles()` — adapted for Claude paths |
| `readSessionLog()` | `readSession()` — single session, returns `ClaudeSession` |
| `readHistory()` + `indexHistoryByProjectPath()` | `readHistory()` — simple scan, no indexing |
| `selectBestSession()` | `selectBestSession()` — adds start-time ranking |
| — | `filterCandidateSessions()` — extracted |
| — | `rankCandidatesByStartTime()` — new |
| `assignSessionsForMode()` | `assignSessionsForMode()` — same structure |
| `assignHistoryEntriesForExactProcessCwd()` | Removed — subsumed by `parent-child` mode |
| — | `isClaudeExecutable()` — precise executable basename check |
| — | `isChildPath()` — parent-child path relationship check |
| `mapSessionToAgent()` | `mapSessionToAgent()` — simplified |
| `mapProcessOnlyAgent()` | `mapProcessOnlyAgent()` — simplified |
| `mapHistoryToAgent()` | Removed — integrated into session mapping |
| `determineStatus()` | `determineStatus()` — uses `lastEntryType` string |
| `generateAgentName()` | `generateAgentName()` — keeps slug disambiguation |

### Claude-Specific Adaptations

1. **Session discovery**: Walk `~/.claude/projects/*/` dirs, collect `*.jsonl` files with mtime. Use `sessions-index.json` for `originalPath` when available; when missing (common in practice), set `projectPath` to empty and derive from `lastCwd` in session content during `readSession()`. Sort by mtime descending, take top N.

2. **Session parsing**: Read first line for `sessionStart` timestamp. Read last 100 lines for `lastEntryType`, `lastActive`, `lastCwd`, `slug`.

3. **Summary**: Read last 100 entries from `~/.claude/history.jsonl`, find matching `sessionId`. No grouping/indexing.

4. **Status mapping**: `user` (+ interrupted check) → RUNNING/WAITING, `progress`/`thinking` → RUNNING, `assistant` → WAITING, `system` → IDLE, idle threshold → IDLE.

5. **Name generation**: project basename + slug disambiguation (keep existing logic).

6. **Process detection**: `canHandle()` uses `isClaudeExecutable()` which checks `path.basename()` of the first word in the command. Only matches `claude` or `claude.exe`, not processes with "claude" in path arguments (e.g., nx daemon running in a worktree named `feature-reimpl-claude-code-adapter`).

7. **Matching modes**: `cwd` → exact CWD match, `missing-cwd` → sessions with no `projectPath`, `parent-child` → process CWD is a parent or child of session project/lastCwd path. The `parent-child` mode replaces the original `any` mode which was too greedy and caused cross-project session stealing.

## Error Handling

- `readSession()`: try/catch per file, skip on error
- `getProcessStartTimes()`: return empty map on failure
- `findSessionFiles()`: return empty array if dirs don't exist
- `sessions-index.json` missing: graceful fallback to empty `projectPath`, filled from `lastCwd`
- All errors logged to `console.error`, never thrown to caller
