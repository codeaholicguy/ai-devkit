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
| `readSessions()` (reads all) | `readSessions(limit)` — bounded |
| — | `listClaudeProcesses()` — extracted |
| — | `calculateSessionScanLimit()` — new |
| — | `getProcessStartTimes()` — new |
| — | `findSessionFiles()` — adapted for Claude paths |
| `readSessionLog()` | `readSession()` — single session, returns `ClaudeSession` |
| `readHistory()` + `indexHistoryByProjectPath()` | Removed — summary from `lastUserMessage` in session JSONL |
| — | `extractUserMessageText()` — parse user message with command/noise handling |
| — | `parseCommandMessage()` — extract `/command args` from `<command-message>` tags |
| — | `isNoiseMessage()` — filter interruptions, tool loads, continuations |
| — | `isMetadataEntryType()` — skip `last-prompt`, `file-history-snapshot` for status tracking |
| `selectBestSession()` | `selectBestSession()` — adds start-time ranking |
| — | `filterCandidateSessions()` — extracted |
| — | `rankCandidatesByStartTime()` — new |
| `assignSessionsForMode()` | `assignSessionsForMode()` — same structure, tracking inlined |
| `assignHistoryEntriesForExactProcessCwd()` | Removed — subsumed by `parent-child` mode |
| — | `isClaudeExecutable()` — precise executable basename check |
| — | `isChildPath()` — parent-child path relationship check |
| — | `pathRelated()` — combined equals/parent/child check |
| `mapSessionToAgent()` | `mapSessionToAgent()` — simplified |
| `mapProcessOnlyAgent()` | `mapProcessOnlyAgent()` — simplified, inlined name logic |
| `mapHistoryToAgent()` | Removed — integrated into session mapping |
| `determineStatus()` | `determineStatus()` — uses `lastEntryType` string |
| `generateAgentName()` | `generateAgentName()` — keeps slug disambiguation (session-backed agents only) |

### Claude-Specific Adaptations

1. **Session discovery**: Walk `~/.claude/projects/*/` dirs, collect `*.jsonl` files with mtime. Use `sessions-index.json` for `originalPath` when available; when missing (common in practice), set `projectPath` to empty and derive from `lastCwd` in session content during `readSession()`. Sort by mtime descending, take top N.

2. **Session parsing**: Read entire file. Parse first line for `sessionStart` timestamp (handles both top-level `timestamp` and `snapshot.timestamp` for `file-history-snapshot` entries). Parse all lines for `lastEntryType`, `lastActive`, `lastCwd`, `slug`, `lastUserMessage`.

3. **Summary**: Extracted from `lastUserMessage` in session JSONL. No history.jsonl dependency. Handles: `<command-message>` tags → `/command args`; skill expansions → ARGUMENTS extraction; noise filtering (interruptions, tool loads, continuations). Fallback chain: lastUserMessage → "Session started" (matched sessions) or "Unknown" (process-only).

4. **Status mapping**: `user` (+ interrupted check) → RUNNING/WAITING, `progress`/`thinking` → RUNNING, `assistant` → WAITING, `system` → IDLE. No age-based IDLE override (every listed agent is backed by a running process).

5. **Name generation**: project basename + slug disambiguation (keep existing logic).

6. **Process detection**: `canHandle()` uses `isClaudeExecutable()` which checks `path.basename()` of the first word in the command. Only matches `claude` or `claude.exe`, not processes with "claude" in path arguments (e.g., nx daemon running in a worktree named `feature-reimpl-claude-code-adapter`).

7. **Matching modes**: `cwd` → exact CWD match (with start-time tolerance gate), `missing-cwd` → sessions with no `projectPath` (with tolerance gate), `parent-child` → process CWD equals, is a parent, or is a child of session project/lastCwd path (no tolerance gate — acts as fallback). The `cwd` and `missing-cwd` modes defer assignment when the best candidate is outside start-time tolerance, allowing `parent-child` mode to find a better match (e.g., worktree sessions). The `parent-child` mode replaces the original `any` mode which was too greedy and caused cross-project session stealing.

8. **Start-time ranking refinement**: Within tolerance (rank 0), candidates are sorted by `lastActive` (most recently active first) rather than smallest `diffMs`. The exact time difference within 2 minutes is noise; the session with recent activity is more likely correct. Outside tolerance (rank 1), smallest `diffMs` is used as primary sort.

## Error Handling

- `readSession()`: try/catch per file, skip on error
- `getProcessStartTimes()`: return empty map on failure
- `findSessionFiles()`: return empty array if dirs don't exist
- `sessions-index.json` missing: graceful fallback to empty `projectPath`, filled from `lastCwd`
- All errors logged to `console.error`, never thrown to caller
