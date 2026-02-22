---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
feature: agent-manager-package
---

# System Design & Architecture

## Architecture Overview
**What is the high-level system structure?**

```mermaid
graph TD
  CLI[packages/cli agent command] --> API[@ai-devkit/agent-manager public API]
  API --> Manager[AgentManager service]
  Manager --> Registry[Adapter registry/composition]
  Registry --> Claude[ClaudeCodeAdapter]
  Registry --> Future[Future adapters]

  Claude --> Proc[Process discovery]
  Claude --> State[Agent session/state readers]
  Manager --> Focus[Terminal focus service (boundary decision)]

  CLI --> UI[terminal-ui formatting]
  API --> Types[Shared types/contracts]
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| `@ai-devkit/agent-manager` public API | Stable entrypoints for CLI and future consumers |
| `AgentManager` | Orchestrates adapters, aggregates/sorts results, exposes use cases |
| Adapter interfaces | Defines contract for integrations |
| Built-in adapters (migrated) | Existing Claude Code integration logic |
| CLI command layer | Parses flags, invokes package API, renders output |

### Technology Stack Choices
- TypeScript + Nx package conventions aligned with `packages/memory`.
- Keep domain logic framework-agnostic; no command framework dependencies inside package.
- Reuse current Node APIs and utilities used by existing agent-management logic.

## Data Models
**What data do we need to manage?**

### Core Entities
- `AgentInfo`: normalized agent data for listing/opening behavior.
- `AgentStatus`: canonical status enum/union.
- `AgentAdapter`: integration contract for discovery and metadata extraction.
- `AgentManagerOptions`: composition/configuration input (adapters, feature flags, environment concerns).

### Data Flow
1. CLI calls package API (`createAgentManager` / `listAgents` / `resolveAgent`, etc.).
2. `AgentManager` invokes registered adapters.
3. Adapters collect process/session data from external systems.
4. Manager normalizes/sorts results and returns typed response to CLI.
5. CLI maps response to terminal output or JSON.

## API Design
**How do components communicate?**

### Public API (Package)
Proposed v1 minimal parity API:

```ts
export interface AgentManagerApi {
  listAgents(): Promise<AgentInfo[]>;
  resolveAgent(input: string, agents: AgentInfo[]): AgentInfo | null;
}

export function createAgentManager(options?: AgentManagerOptions): AgentManagerApi;
export * from './types';
```

### Internal Interfaces
- `AgentAdapter` remains internal or selectively exported for extension.
- Internal modules are not imported by CLI directly.
- Index exports define supported extension surface.

### CLI Integration Contract
- CLI imports from package root only (e.g., `@ai-devkit/agent-manager`).
- No relative imports into package internals.

## Component Breakdown
**What are the major building blocks?**

### New Package Structure (target)

```text
packages/agent-manager/
  src/
    index.ts           # Public exports
    api.ts             # API factory + surface
    manager/           # AgentManager orchestration
    adapters/          # Adapter contracts + implementations
    types/             # Shared contracts
    utils/             # Shared helpers used by migrated logic
  tests/
    unit/
    integration/
  project.json
  package.json
  tsconfig.json
  jest.config.js
```

### Migration Map
- Move `packages/cli/src/lib/AgentManager.ts` -> `packages/agent-manager/src/manager/`.
- Move related adapter/types/utils required by manager into package.
- Keep CLI-specific command parsing and output formatting in `packages/cli`.

## Design Decisions
**Why did we choose this approach?**

1. **Package extraction over in-place refactor**
   - Creates clear ownership boundary and reduces long-term CLI coupling.
2. **Memory package parity**
   - Reuses proven repo conventions (targets, exports, tests, packaging).
3. **Public API-first boundary**
   - Prevents future direct internal imports and supports scalable integrations.
4. **Behavior-preserving migration**
   - Reduces rollout risk by keeping CLI contract stable.

### Alternatives Considered
- Keep logic in CLI with module cleanup: rejected, still couples domain to delivery layer.
- Create plugin system immediately: rejected for scope; can evolve after extraction.

## Non-Functional Requirements
**How should the system perform?**

### Performance
- No significant latency regression for existing `agent` commands.

### Scalability
- New integrations should be added in package adapter layer without CLI internals changes.

### Reliability
- Extraction must preserve current behavior and error handling semantics.

### Security
- Maintain existing data-access patterns; do not expand permissions during migration.
