---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
feature: agent-manager-package
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

The current agent-management logic is implemented directly in the CLI package (`packages/cli/src/lib/AgentManager.ts` and related modules). This couples domain behavior to CLI delivery details and makes extension harder.

- **Core problem**: Agent management is not isolated as a reusable package boundary.
- **Who is affected**: CLI maintainers and contributors adding new agent integrations.
- **Current workaround**: Add integration logic directly in CLI internals, increasing coupling and change blast radius.

## Goals & Objectives
**What do we want to achieve?**

### Primary Goals
1. Create a new dedicated package for agent management (workspace package under `packages/`).
2. Move `packages/cli/src/lib/AgentManager.ts` and related domain modules into the new package.
3. Expose a stable API that CLI can consume, following the same package pattern used by `packages/memory`.
4. Preserve existing CLI behavior while reducing CLI package responsibility.

### Secondary Goals
1. Establish extension points so future agent integrations can be added in the new package without touching CLI command wiring.
2. Improve testability by separating orchestration/domain logic from command/output layers.
3. Keep package boundaries explicit (public API vs internal implementation).

### Non-Goals (Out of Scope)
1. Reworking CLI UX or output format for `agent` commands.
2. Introducing new user-facing agent features unrelated to extraction.
3. Refactoring unrelated CLI command modules.

## User Stories & Use Cases
**How will users interact with the solution?**

### Primary User Stories
- As a CLI maintainer, I want agent-management logic in its own package so that I can evolve integrations without CLI-internal rewrites.
- As a contributor adding a new integration, I want to implement it inside the agent-manager package so that CLI only calls a stable API.
- As a CLI user, I want `ai-devkit agent ...` behavior to remain unchanged after the extraction.

### Key Use Cases
1. CLI command imports `@ai-devkit/agent-manager` and calls package API methods instead of local `lib/AgentManager` internals.
2. New integration adapter is added in the agent-manager package and registered through package-level composition.
3. Existing tests continue to pass with package-level test coverage for migrated domain logic.

### Edge Cases
- Broken imports after file move (path aliases/workspace config updates required).
- Circular dependency risk between CLI and agent-manager package.
- Behavior drift if status detection or sorting logic changes during extraction.

## Success Criteria
**How will we know when we're done?**

### Measurable Outcomes
1. CLI no longer imports `packages/cli/src/lib/AgentManager.ts` directly.
2. Agent management code lives in a dedicated package with clear public exports.
3. Existing `agent` command behavior remains functionally equivalent.

### Acceptance Criteria
- [ ] New package scaffolded with structure consistent with `packages/memory` (project config, TypeScript config, tests, build/lint targets).
- [ ] `AgentManager` and related domain modules are moved from CLI to the new package.
- [ ] New package exports a public API consumed by CLI.
- [ ] CLI `agent` command compiles and works using package API.
- [ ] Existing relevant tests pass and new/updated tests cover package extraction paths.
- [ ] No direct CLI dependency on package-internal implementation files.

### Performance/Quality Criteria
- `ai-devkit agent list` p95 latency regression must be <= 10% versus pre-extraction baseline measured on the same machine/session set.
- Type safety and lint checks pass for both package and CLI.

## Constraints & Assumptions
**What limitations do we need to work within?**

### Technical Constraints
- Must remain in existing Nx/npm workspace structure.
- Must follow patterns used by `packages/memory` for package setup and exports.
- Existing command contracts should remain backward compatible.

### Business Constraints
- Keep migration incremental and low-risk; avoid broad unrelated refactors.

### Assumptions
- “Related things” includes adapter interfaces/types and orchestration modules required by `AgentManager`.
- CLI remains the delivery layer; new package remains framework-agnostic domain/service layer.

## Questions & Open Items
**What do we still need to clarify?**

### Resolved
- Feature intent: separate reusable agent-manager package with CLI-facing API.
- Architecture direction: follow memory package setup as baseline.
- Package name convention: use `@ai-devkit/agent-manager` (consistent with `@ai-devkit/memory`).
- v1 API scope: keep minimal parity with existing CLI use cases only.
- Terminal focus boundary: keep terminal-focus logic in CLI for now.

### Open Questions
1. Should `agent open` resolution helper APIs (name matching/ambiguity handling) stay in CLI or move into package in a future phase?
