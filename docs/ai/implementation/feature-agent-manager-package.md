---
phase: implementation
title: "CLI Agent-Manager Package Adoption - Implementation Guide"
feature: agent-manager-package
description: Implementation notes for migrating CLI agent logic to @ai-devkit/agent-manager
---

# Implementation Guide: CLI Uses @ai-devkit/agent-manager

## Development Setup

- Use repository root with npm workspaces enabled
- Validate changes with project lint/build/test commands after migration

## Code Structure

- Primary touchpoint: `packages/cli/src/commands/agent.ts`
- Candidate cleanup area: `packages/cli/src/lib/*agent*` and related `src/__tests__/lib/*agent*`
- External dependency source: `packages/agent-manager/src/*`

## Implementation Notes

### Core Features
- Replace local CLI domain imports with `@ai-devkit/agent-manager` imports
- Keep CLI-only formatting and command UX logic local
- Remove duplicate implementations once imports are migrated and verified

### Patterns & Best Practices
- Keep domain logic in package, presentation logic in CLI
- Prefer explicit imports over local re-export indirection
- Delete dead code in same change set to prevent drift

## Integration Points

- CLI command integration with package classes/types
- Workspace dependency metadata between `packages/cli` and `packages/agent-manager`

## Error Handling

- Preserve current user-facing errors/messages in `agent` command flows
- Keep graceful handling for no-agent and lookup/focus failures

## Performance Considerations

- Avoid extra scans/parsing during migration
- Maintain current command runtime profile

## Security Notes

- Reuse package utilities without introducing new shell-eval paths
- Keep terminal focus behavior constrained to existing safe execution patterns

## Implementation Status (February 26, 2026)

- Migrated CLI agent command imports in `packages/cli/src/commands/agent.ts` to `@ai-devkit/agent-manager`:
  - `AgentManager`
  - `ClaudeCodeAdapter`
  - `AgentStatus`
  - `TerminalFocusManager`
  - `AgentInfo` (type)
- Replaced removed legacy display fields with CLI-local presentation mapping:
  - status display (`run`, `wait`, `idle`, `unknown`)
  - relative time formatting for `lastActive`
- Added workspace dependency in `packages/cli/package.json`:
  - `@ai-devkit/agent-manager: 0.1.0`
- Updated shared CLI process utility type import:
  - `packages/cli/src/util/process.ts` now imports `ProcessInfo` from `@ai-devkit/agent-manager`
- Removed duplicated CLI agent-manager source files:
  - `packages/cli/src/lib/AgentManager.ts`
  - `packages/cli/src/lib/TerminalFocusManager.ts`
  - `packages/cli/src/lib/adapters/AgentAdapter.ts`
  - `packages/cli/src/lib/adapters/ClaudeCodeAdapter.ts`
- Removed duplicated CLI tests tied to deleted modules:
  - `packages/cli/src/__tests__/lib/AgentManager.test.ts`
  - `packages/cli/src/__tests__/lib/TerminalFocusManager.test.ts`
  - `packages/cli/src/__tests__/lib/adapters/ClaudeCodeAdapter.test.ts`

## Phase 6 Check Implementation (February 26, 2026)

### Alignment Summary

- Overall status: aligned with requirements and design
- Package ownership migration completed for `AgentManager`, `ClaudeCodeAdapter`, core agent types/status, and `TerminalFocusManager`
- CLI keeps presentation logic locally (status/time formatting, command UX, prompts, output)

### File-by-File Notes

- `packages/cli/src/commands/agent.ts`
  - Uses `@ai-devkit/agent-manager` imports as required
  - Replaces removed package-display fields with local formatter functions
- `packages/cli/package.json`
  - Includes direct dependency on `@ai-devkit/agent-manager`
- `packages/cli/src/util/process.ts`
  - Uses shared `ProcessInfo` type from package
- Removed files under `packages/cli/src/lib/*agent*` and matching tests under `packages/cli/src/__tests__/lib/*agent*`
  - Matches direct-replacement/no-wrapper decision

### Deviations / Concerns

- No requirement/design deviations found.
- Follow-up optimization (non-blocking): optional reduction of expected `console.error` noise in failure-path unit tests.

## Phase 8 Code Review (February 26, 2026)

### Findings

1. No blocking correctness, security, or design-alignment issues found in migrated CLI/package integration paths.
2. Test coverage for changed command path improved via `packages/cli/src/__tests__/commands/agent.test.ts`, but package-level global coverage thresholds remain below 80% due unrelated historical coverage gaps.
3. Non-blocking quality note: expected `console.error` output in negative-path tests can be muted with console spies if cleaner CI logs are preferred.

### Review Verdict

- Ready for commit/PR from a code-review standpoint.
- Remaining items are non-blocking follow-up improvements, not release blockers for this feature scope.
