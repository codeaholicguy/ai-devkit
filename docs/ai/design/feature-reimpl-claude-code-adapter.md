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
  - `sessionStart`: earliest timestamp in session (first entry or file creation)
  - `lastActive`: latest timestamp in session
  - `lastEntryType`: type of last session entry (for status determination)
  - `summary`: from `history.jsonl` lookup (simple, not indexed)

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
     - `findSessionFiles()`: bounded file discovery with recent + process-day windows
     - `readSession()`: parse single session (meta + last entry + timestamps)
     - `selectBestSession()`: filter + rank candidates by start time
     - `filterCandidateSessions()`: mode-based filtering (`cwd` / `missing-cwd` / `parent-child`)
     - `isClaudeExecutable()`: precise executable detection (basename check, not substring)
     - `isChildPath()`: parent-child path relationship check
     - `rankCandidatesByStartTime()`: tolerance-based ranking
     - `assignSessionsForMode()`: orchestrate matching per mode
     - `addMappedSessionAgent()` / `addProcessOnlyAgent()`: tracking helpers
     - `determineStatus()`: status from entry type + recency
     - `generateAgentName()`: project basename + disambiguation

   - Claude-specific adaptations (differs from Codex):
     - Session discovery: walk `~/.claude/projects/*/` reading `*.jsonl` files. Uses `sessions-index.json` for `originalPath` when available, falls back to `lastCwd` from session content when index is missing (common in practice)
     - Bounded scanning: collect all `*.jsonl` files with mtime, sort by mtime descending, take top N. No process-day window (Claude sessions aren't organized by date — mtime-based cutoff is sufficient since we already stat files during discovery).
     - `sessionStart`: parsed from first JSONL entry timestamp (not `session_meta` type)
     - Summary: lookup from `~/.claude/history.jsonl` by sessionId (simple scan, no complex indexing)
     - Status: map Claude entry types (`user`, `assistant`, `progress`, `thinking`, `system`) to `AgentStatus`
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
- Decision: Replace `cwd` → `history` → `project-parent` flow with `cwd` → `missing-cwd` → `parent-child`.
  - Rationale: simpler, consistent with CodexAdapter. `parent-child` mode matches sessions where process CWD is a parent or child of session project path, avoiding the greedy matching of `any` mode which caused cross-project session stealing.
- Decision: Use precise executable detection (`isClaudeExecutable`) instead of substring matching.
  - Rationale: `command.includes('claude')` falsely matched processes whose path arguments contained "claude" (e.g., nx daemon in a worktree named `feature-reimpl-claude-code-adapter`). Checking the basename of the first command word (`claude` or `claude.exe`) matches CodexAdapter's `isCodexExecutable` pattern.
- Decision: Make `sessions-index.json` optional, fall back to `lastCwd` from session content.
  - Rationale: most Claude project directories lack `sessions-index.json` in practice, causing entire projects to be skipped during session discovery. Using `lastCwd` from the JSONL entries provides a reliable fallback.
- Decision: Keep history.jsonl summary lookup simple (scan last N entries, match by sessionId).
  - Rationale: avoids complex indexing; keeps it simple at first per user request.
- Decision: Keep status-threshold values consistent across adapters (5-minute IDLE).
  - Rationale: preserves cross-agent behavior consistency.
- Decision: Keep matching orchestration in explicit phases with extracted helper methods and PID/session tracking sets.
  - Rationale: mirrors CodexAdapter structure for maintainability.
- Decision: Use mtime-based bounded scanning without process-day window.
  - Rationale: Claude sessions use project-based directories (not date-based like Codex), so date-window lookup isn't cheap. Mtime-based top-N is sufficient and simpler.

## Non-Functional Requirements

- Performance: bounded session scanning ensures `agent list` latency stays predictable.
- Reliability: adapter failures remain isolated (AgentManager catches per-adapter errors).
- Maintainability: structural alignment with CodexAdapter means one pattern to understand.
- Security: only reads local metadata/process info already permitted by existing CLI behavior.
