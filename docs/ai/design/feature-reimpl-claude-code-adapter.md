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
  - `projectPath`: from `sessions-index.json` → `originalPath`
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
     - `filterCandidateSessions()`: mode-based filtering (`cwd` / `missing-cwd` / `any`)
     - `rankCandidatesByStartTime()`: tolerance-based ranking
     - `assignSessionsForMode()`: orchestrate matching per mode
     - `addMappedSessionAgent()` / `addProcessOnlyAgent()`: tracking helpers
     - `determineStatus()`: status from entry type + recency
     - `generateAgentName()`: project basename + disambiguation

   - Claude-specific adaptations (differs from Codex):
     - Session discovery: walk `~/.claude/projects/*/` reading `sessions-index.json` + `*.jsonl` (not date-based dirs)
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
- Decision: Replace `cwd` → `history` → `project-parent` flow with `cwd` → `missing-cwd` → `any`.
  - Rationale: simpler, consistent with CodexAdapter, and `project-parent` behavior is subsumed by start-time ranking in `any` mode.
- Decision: Keep history.jsonl summary lookup simple (scan last N entries, match by sessionId).
  - Rationale: avoids complex indexing; keeps it simple at first per user request.
- Decision: Keep status-threshold values consistent across adapters (5-minute IDLE).
  - Rationale: preserves cross-agent behavior consistency.
- Decision: Keep matching orchestration in explicit phases with extracted helper methods and PID/session tracking sets.
  - Rationale: mirrors CodexAdapter structure for maintainability.

## Non-Functional Requirements

- Performance: bounded session scanning ensures `agent list` latency stays predictable.
- Reliability: adapter failures remain isolated (AgentManager catches per-adapter errors).
- Maintainability: structural alignment with CodexAdapter means one pattern to understand.
- Security: only reads local metadata/process info already permitted by existing CLI behavior.
