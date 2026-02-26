---
phase: requirements
title: "CLI Agent-Manager Package Adoption - Requirements"
feature: agent-manager-package
description: Make CLI consume @ai-devkit/agent-manager and remove duplicated agent-management code from CLI
---

# Requirements: CLI Uses @ai-devkit/agent-manager

## Problem Statement

`packages/agent-manager` exists, but `packages/cli` still uses local agent-management implementations (`AgentManager`, Claude adapter, related types). This duplicates logic across packages and creates drift risk.

Who is affected:
- CLI maintainers who must patch agent behavior in more than one place
- Contributors who are unsure which implementation is source of truth
- Users who can receive inconsistent behavior when package and CLI diverge

## Goals & Objectives

### Primary Goals
- Switch `packages/cli` agent command(s) to import core agent-management logic from `@ai-devkit/agent-manager`
- Remove or retire duplicated CLI agent-management files no longer needed
- Migrate `TerminalFocusManager` usage to `@ai-devkit/agent-manager` and remove CLI duplicate
- Keep current CLI command behavior and output stable for users

### Secondary Goals
- Reduce maintenance surface in `packages/cli/src/lib`
- Make ownership boundary explicit: domain logic in package, presentation in CLI
- Keep test coverage equivalent or better after migration

### Non-Goals
- Adding new agent types or features
- Redesigning `ai-devkit agent` UX
- Large refactors unrelated to agent-management duplication

## User Stories & Use Cases

1. As a CLI maintainer, I want one reusable agent-management implementation so fixes happen once.
2. As a contributor, I want clear imports from `@ai-devkit/agent-manager` so package boundaries are obvious.
3. As an end user, I want `ai-devkit agent list/open` to behave the same after migration.

## Success Criteria

- `packages/cli/src/commands/agent.ts` imports core types/classes from `@ai-devkit/agent-manager`
- `packages/cli/src/commands/agent.ts` imports `TerminalFocusManager` from `@ai-devkit/agent-manager`
- Duplicated CLI files for migrated functionality are removed or converted to thin wrappers
- CLI tests pass with package-based imports
- `npm run lint`, `npm run build`, and relevant tests pass for affected projects
- No functional regression in `agent list`, `agent list --json`, and `agent open`

## Constraints & Assumptions

### Technical Constraints
- Follow existing Nx/workspace conventions
- Preserve Node.js compatibility declared in repo
- Keep output formatting responsibility in CLI layer

### Assumptions
- `@ai-devkit/agent-manager` API is stable enough for CLI adoption
- `TerminalFocusManager` in `@ai-devkit/agent-manager` is the source for CLI terminal focus behavior
- Existing tests can be updated without changing command semantics

## Questions & Open Items

- Resolved: Consume `TerminalFocusManager` from `@ai-devkit/agent-manager` in this phase and remove `packages/cli/src/lib/TerminalFocusManager.ts`.
- Resolved: Use direct import replacement and remove duplicated CLI agent-manager files in the same change (no compatibility wrapper period).
- Resolved: Do not add a lint rule for import enforcement in this feature; keep as team convention.
