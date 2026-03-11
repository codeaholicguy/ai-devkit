---
phase: design
title: "Re-implement Claude Code Adapter - Design"
feature: reimpl-claude-code-adapter
description: Architecture and implementation design for re-implementing ClaudeCodeAdapter using CodexAdapter patterns
---

# Design: Re-implement Claude Code Adapter

## Architecture Overview

```mermaid
graph TD
  User[User runs ai-devkit agent list/open] --> Cmd[packages/cli/src/commands/agent.ts]
  Cmd --> Manager[AgentManager]

  subgraph Pkg[@ai-devkit/agent-manager]
    Manager --> Claude[ClaudeCodeAdapter ← reimplemented]
    Manager --> Codex[CodexAdapter]
    Claude --> Proc[process utils]
    Claude --> File[file utils]
    Claude --> Types[AgentAdapter/AgentInfo/AgentStatus]
    Focus[TerminalFocusManager]
  end

  Cmd --> Focus
  Cmd --> Output[CLI table/json rendering]
```

Responsibilities:
- `ClaudeCodeAdapter`: discover running Claude processes, match with sessions via process start time + CWD, emit `AgentInfo`
- `AgentManager`: aggregate Claude + Codex adapter results (unchanged)
- CLI command: register adapters, display results (unchanged)

## Data Models

- Reuse existing `AgentAdapter`, `AgentInfo`, `AgentStatus`, and `AgentType` models — no changes
- `AgentType` already supports `claude`; adapter emits `type: 'claude'`
- Internal session model (`ClaudeSession`) updated to include `sessionStart` for time-based matching:
  - `sessionId`: from JSONL filename
  - `projectPath`: from `sessions-index.json` → `originalPath`, falls back to `lastCwd` when index missing
  - `lastCwd`: from session JSONL entries
  - `slug`: from session JSONL entries
  - `sessionStart`: from first JSONL entry timestamp (supports both top-level `timestamp` and `snapshot.timestamp` for `file-history-snapshot` entries)
  - `lastActive`: latest timestamp in session
  - `lastEntryType`: type of last non-metadata session entry (excludes `last-prompt`, `file-history-snapshot`; used for status determination)
  - `lastUserMessage`: last meaningful user message from session JSONL (with command parsing and noise filtering)

## API Design

### Package Exports
- No changes to `packages/agent-manager/src/adapters/index.ts`
- No changes to `packages/agent-manager/src/index.ts`
- `ClaudeCodeAdapter` public API remains identical

### CLI Integration
- No changes to `packages/cli/src/commands/agent.ts`

## Component Breakdown

1. `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts` — full rewrite
   - Adopt CodexAdapter's structural patterns:
     - `listClaudeProcesses()`: extract process listing
     - `calculateSessionScanLimit()`: bounded scanning
     - `getProcessStartTimes()`: process elapsed time → start time mapping
     - `findSessionFiles()`: bounded file discovery with breadth-first scanning (one per project, then fill globally by mtime)
     - `readSession()`: parse single session (meta + last entry + timestamps)
     - `selectBestSession()`: filter + rank candidates by start time
     - `filterCandidateSessions()`: mode-based filtering (`cwd` / `missing-cwd` / `parent-child`)
     - `isClaudeExecutable()`: precise executable detection (basename check, not substring)
     - `isChildPath()`: parent-child path relationship check
     - `pathRelated()`: combined equals/parent/child check for path matching
     - `rankCandidatesByStartTime()`: tolerance-based ranking
     - `assignSessionsForMode()`: orchestrate matching per mode (tracking inlined)
     - `extractUserMessageText()`: extract meaningful text from user messages (string or array content)
     - `parseCommandMessage()`: parse `<command-message>` tags into `/command args` format
     - `isNoiseMessage()`: filter out non-meaningful messages (interruptions, tool loads, continuations)
     - `isMetadataEntryType()`: skip metadata entry types (`last-prompt`, `file-history-snapshot`) when tracking `lastEntryType`
     - `determineStatus()`: status from entry type (no age override)
     - `generateAgentName()`: project basename + disambiguation

   - Claude-specific adaptations (differs from Codex):
     - Session discovery: walk `~/.claude/projects/*/` reading `*.jsonl` files. Uses `sessions-index.json` for `originalPath` when available, falls back to `lastCwd` from session content when index is missing (common in practice)
     - Bounded scanning: collect all `*.jsonl` files with mtime, sort by mtime descending, take top N. No process-day window (Claude sessions aren't organized by date — mtime-based cutoff is sufficient since we already stat files during discovery).
     - `sessionStart`: parsed from first JSONL entry — checks `entry.timestamp` then `entry.snapshot.timestamp` (for `file-history-snapshot` entries common in practice)
     - Summary: extracted from last user message in session JSONL (no history.jsonl dependency). Handles `<command-message>` tags for slash commands, filters skill expansions and noise messages
     - Status: map Claude entry types (`user`, `assistant`, `progress`, `thinking`, `system`) to `AgentStatus`. Metadata types (`last-prompt`, `file-history-snapshot`) are excluded. No age-based IDLE override
     - Name: use slug for disambiguation (Claude sessions have slugs)

2. `packages/agent-manager/src/__tests__/adapters/ClaudeCodeAdapter.test.ts` — update tests
   - Adapt mocking to match new internal structure
   - Add tests for process start time matching
   - Add tests for bounded session scanning
   - Keep all existing behavioral assertions

## Design Decisions

- Decision: Rewrite ClaudeCodeAdapter internals, keep public API identical.
  - Rationale: zero impact on consumers; purely structural improvement.
- Decision: Add process start time matching for session pairing.
  - Rationale: improves accuracy when multiple Claude processes share the same CWD, consistent with CodexAdapter.
- Decision: Bound session scanning with MIN/MAX limits.
  - Rationale: keeps latency predictable as history grows, consistent with CodexAdapter.
- Decision: Replace `cwd` → `history` → `project-parent` flow with `cwd` → `missing-cwd` → `parent-child`, with tolerance-gated deferral in early modes.
  - Rationale: simpler, consistent with CodexAdapter. `cwd` and `missing-cwd` modes defer assignment when the best candidate is outside start-time tolerance, allowing `parent-child` mode to find a better match (e.g., worktree sessions). `parent-child` mode matches sessions where process CWD equals, is a parent, or child of session project path — it includes exact CWD as a safety net for deferred matches. This avoids the greedy matching of the original `any` mode which caused cross-project session stealing.
- Decision: Within start-time tolerance, rank by recency (`lastActive`) instead of smallest time difference.
  - Rationale: a 6s vs 45s start-time diff is noise within the 2-minute window. The session with more recent activity is the correct one — prevents stub sessions from beating real work sessions.
- Decision: Use precise executable detection (`isClaudeExecutable`) instead of substring matching.
  - Rationale: `command.includes('claude')` falsely matched processes whose path arguments contained "claude" (e.g., nx daemon in a worktree named `feature-reimpl-claude-code-adapter`). Checking the basename of the first command word (`claude` or `claude.exe`) matches CodexAdapter's `isCodexExecutable` pattern.
- Decision: Make `sessions-index.json` optional, fall back to `lastCwd` from session content.
  - Rationale: most Claude project directories lack `sessions-index.json` in practice, causing entire projects to be skipped during session discovery. Using `lastCwd` from the JSONL entries provides a reliable fallback.
- Decision: Remove history.jsonl dependency, extract summary from session JSONL directly.
  - Rationale: session JSONL already contains the conversation. Extracting the last user message is more reliable than history.jsonl which only covers recent sessions. Includes command tag parsing for slash commands and noise filtering.
- Decision: Process-only agents (no session file) show IDLE status with "Unknown" summary.
  - Rationale: without session data, we can't determine actual status or task. IDLE + Unknown is more honest than RUNNING + "Claude process running".
- Decision: Ensure breadth in bounded scanning — at least one session per project directory.
  - Rationale: projects with many sessions (e.g., ai-devkit with 20+ files) consumed all scan slots, starving other projects. Two-pass scanning (one per project, then fill globally) ensures every project is represented.
- Decision: No age-based IDLE override for process-backed agents.
  - Rationale: every agent in the list is backed by a running process found via `ps`. The session entry type (`user`/`assistant`/`progress`/`system`) is a more accurate status indicator than a time threshold. Removed the 5-minute IDLE override.
- Decision: Keep matching orchestration in explicit phases with extracted helper methods and PID/session tracking sets.
  - Rationale: mirrors CodexAdapter structure for maintainability.
- Decision: Use mtime-based bounded scanning without process-day window.
  - Rationale: Claude sessions use project-based directories (not date-based like Codex), so date-window lookup isn't cheap. Mtime-based top-N is sufficient and simpler.

## Non-Functional Requirements

- Performance: bounded session scanning ensures `agent list` latency stays predictable.
- Reliability: adapter failures remain isolated (AgentManager catches per-adapter errors).
- Maintainability: structural alignment with CodexAdapter means one pattern to understand.
- Security: only reads local metadata/process info already permitted by existing CLI behavior.
