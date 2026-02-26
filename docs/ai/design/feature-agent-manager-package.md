---
phase: design
title: "CLI Agent-Manager Package Adoption - Design"
feature: agent-manager-package
description: Architecture and migration design for moving CLI agent logic to @ai-devkit/agent-manager
---

# Design: CLI Adoption of @ai-devkit/agent-manager

## Architecture Overview

```mermaid
graph TD
  User[User runs ai-devkit agent] --> Cmd[packages/cli/src/commands/agent.ts]

  subgraph CLI
    Cmd --> UILayer[CLI formatting + table output + command errors]
    Cmd --> DisplayMap[Status/time display mapping]
  end

  subgraph AgentManagerPkg[@ai-devkit/agent-manager]
    AM[AgentManager]
    CCA[ClaudeCodeAdapter]
    TFM[TerminalFocusManager]
    Types[AgentInfo/AgentStatus/AgentType]
    AM --> CCA
    CCA --> Types
  end

  Cmd -->|imports| AM
  Cmd -->|imports| CCA
  Cmd -->|imports| TFM
  Cmd -->|imports| Types
  Cmd -->|uses| DisplayMap
```

Responsibilities:
- `@ai-devkit/agent-manager`: detection, adapter contract, status model, agent resolution, terminal focus mechanics
- CLI: command wiring, display formatting, JSON/table output, user-facing errors, focus-flow orchestration only

## Data Models

Core models consumed from package:
- `AgentInfo`
- `AgentStatus`
- `AgentType`
- `TerminalFocusManager`
- Adapter interface types as needed

CLI-owned view model:
- Derived display fields (color/emoji labels, relative time strings, message formatting)
- Local status metadata map for display labels/colors (replacing direct dependency on legacy CLI `STATUS_CONFIG`)

## API Design

### CLI Imports
- Prefer root exports from `@ai-devkit/agent-manager`
- Keep imports explicit and type-safe in `commands/agent.ts`

### Internal CLI Interface
- Introduce minimal local mappers (if needed) for display-only transformations
- Avoid re-defining package-level domain types in CLI

## Component Breakdown

1. `packages/cli/src/commands/agent.ts`
- Replace local lib imports with package imports
- Keep output behavior unchanged

2. CLI local cleanup
- Remove duplicated files under `packages/cli/src/lib` and `packages/cli/src/__tests__/lib` that are fully migrated, including `lib/TerminalFocusManager.ts`
- Use direct import replacement and delete duplicates in the same change set (no temporary compatibility wrappers)
- Retain only files that are intentionally CLI-specific

3. Tests
- Update tests to validate behavior through CLI command interfaces and remaining unit seams

## Design Decisions

- Decision: package is source of truth for agent detection and status domain model.
  - Rationale: eliminates duplication and drift.
- Decision: package is also source of truth for terminal focus implementation (`TerminalFocusManager`).
  - Rationale: aligns with cleanup goal and removes final duplicated agent-manager file path in CLI.
- Decision: CLI keeps presentation concerns.
  - Rationale: package remains reusable and data-first.
- Decision: cleanup is included in the same feature.
  - Rationale: avoids leaving dead or competing implementations.
- Decision: no lint-rule enforcement is added in this feature for import path policy.
  - Rationale: team prefers convention over additional tooling in this phase.

## Non-Functional Requirements

- Performance: no meaningful regression for `agent list` runtime
- Reliability: migration must preserve existing command behavior and error handling
- Maintainability: eliminate duplicate agent-manager code paths in CLI
- Security: preserve existing process/file handling guarantees; do not widen command-execution surface
