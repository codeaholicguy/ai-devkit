---
phase: design
title: "Codex Adapter in @ai-devkit/agent-manager - Design"
feature: codex-adapter-agent-manager-package
description: Architecture and implementation design for introducing Codex adapter support in the shared agent manager package
---

# Design: Codex Adapter for @ai-devkit/agent-manager

## Architecture Overview

```mermaid
graph TD
  User[User runs ai-devkit agent list/open] --> Cmd[packages/cli/src/commands/agent.ts]
  Cmd --> Manager[AgentManager]

  subgraph Pkg[@ai-devkit/agent-manager]
    Manager --> Claude[ClaudeCodeAdapter]
    Manager --> Codex[CodexAdapter]
    Codex --> Proc[process utils]
    Codex --> File[file utils]
    Codex --> Types[AgentAdapter/AgentInfo/AgentStatus]
    Focus[TerminalFocusManager]
  end

  Cmd --> Focus
  Cmd --> Output[CLI table/json rendering]
```

Responsibilities:
- `CodexAdapter`: discover and map running Codex sessions to `AgentInfo`
- `AgentManager`: aggregate Codex + existing adapter results
- CLI command: register adapters, display results, and invoke open/focus behavior

## Data Models

- Reuse existing `AgentAdapter`, `AgentInfo`, `AgentStatus`, and `AgentType` models
- `AgentType` already supports `codex`; adapter emits `type: 'codex'`
- Codex raw metadata (internal to adapter) is normalized into:
  - `id`: deterministic session/process identifier
  - `name`: user-facing label derived from `cwd`; fallback to `codex-<session-id-prefix>` when `cwd` is missing
  - `cwd`: workspace path (if available)
  - `sessionStart`: parsed from `session_meta.timestamp` for process/session time matching
  - `status`: computed from recency/activity metadata using the same threshold values already used by existing adapters
  - `pid`: matched running Codex process id used by terminal focus flow

## API Design

### Package Exports
- Add `CodexAdapter` to:
  - `packages/agent-manager/src/adapters/index.ts`
  - `packages/agent-manager/src/index.ts`

### CLI Integration
- Update `packages/cli/src/commands/agent.ts` to register `CodexAdapter` alongside `ClaudeCodeAdapter`
- Keep display mapping logic in CLI; do not move presentation concerns into package

## Component Breakdown

1. `packages/agent-manager/src/adapters/CodexAdapter.ts`
- Implement adapter contract methods/properties
- Discover Codex sessions from `~/.codex/sessions/YYYY/MM/DD/*.jsonl`
- Map session data to standardized `AgentInfo`

2. `packages/agent-manager/src/__tests__/adapters/CodexAdapter.test.ts`
- Unit tests for detection/parsing/status mapping/error handling

3. `packages/agent-manager/src/adapters/index.ts` and `src/index.ts`
- Export adapter class

4. `packages/cli/src/commands/agent.ts`
- Register Codex adapter in manager setup path(s)

## Design Decisions

- Decision: Implement Codex detection in package, not CLI.
  - Rationale: preserves package as the single source of truth for agent discovery.
- Decision: Reuse existing adapter contract and manager aggregation flow.
  - Rationale: minimizes surface area and regression risk.
- Decision: Keep CLI output semantics unchanged.
  - Rationale: this feature adds detection capability, not UX changes.
- Decision: Parse the first JSON line (`type=session_meta`) as the authoritative session identity/cwd/timestamp source.
  - Rationale: sampled session files consistently include this shape, and it avoids scanning full transcript payloads.
- Decision: Treat running `codex` processes as source-of-truth for list membership.
  - Rationale: session tail events can represent turn completion while process remains active.
- Decision: Match `pid -> session` by closest process start time (`now - etime`) to `session_meta.timestamp` with tolerance.
  - Rationale: improves accuracy when multiple Codex processes share the same project `cwd`.
- Decision: Bound session scanning for performance while including process-start day windows.
  - Rationale: keeps list latency low and still supports long-lived process/session mappings.
- Decision: Keep status-threshold values consistent across adapters.
  - Rationale: preserves cross-agent behavior consistency and avoids adapter-specific drift.
- Decision: Use `codex-<session-id-prefix>` fallback naming when `cwd` is unavailable.
  - Rationale: keeps identifiers deterministic and short while remaining user-readable.

## Non-Functional Requirements

- Performance: `agent list` should remain bounded by existing adapter aggregation patterns.
- Reliability: Codex adapter failures must be isolated (no full-command failure when one adapter errors).
- Maintainability: follow Claude adapter structure to keep adapter implementations consistent.
- Security: only read local metadata/process info already permitted by existing CLI behavior.
