---
phase: implementation
title: "Codex Adapter in @ai-devkit/agent-manager - Implementation"
feature: codex-adapter-agent-manager-package
description: Implementation notes for Codex adapter support in package agent manager and CLI integration
---

# Implementation Guide: Codex Adapter in @ai-devkit/agent-manager

## Development Setup

- Use branch/worktree: `feature-codex-adapter-agent-manager-package`
- Install dependencies with `npm ci`
- Validate docs and feature scope with:
  - `npx ai-devkit@latest lint`
  - `npx ai-devkit@latest lint --feature codex-adapter-agent-manager-package`

## Code Structure

- Package adapter implementation:
  - `packages/agent-manager/src/adapters/CodexAdapter.ts`
- Package exports:
  - `packages/agent-manager/src/adapters/index.ts`
  - `packages/agent-manager/src/index.ts`
- CLI wiring:
  - `packages/cli/src/commands/agent.ts`
- Tests:
  - `packages/agent-manager/src/__tests__/adapters/CodexAdapter.test.ts`
  - CLI tests touching adapter registration/open flow

## Implementation Notes

### Core Features
- Implement Codex adapter contract (`type`, `name`, `listRunningAgents`) using existing utilities where possible.
- Normalize Codex metadata into stable `AgentInfo` output.
- Register Codex adapter in command paths that instantiate `AgentManager`.

### Patterns & Best Practices
- Follow `ClaudeCodeAdapter` structure for consistency.
- Keep adapter-specific parsing in adapter module; keep formatting in CLI.
- Fail soft on malformed/partial entries; avoid throwing across adapter boundary.

## Integration Points

- `AgentManager` parallel aggregation behavior
- `TerminalFocusManager` open/focus flow compatibility for Codex command metadata
- CLI list/json output mapping

## Error Handling

- Handle missing/unreadable Codex source data by returning empty results.
- Catch parsing errors per-entry and continue processing valid entries.
- Let manager collect adapter errors without crashing full command.

## Performance Considerations

- Avoid repeated filesystem scans where possible.
- Keep parsing linear to discovered entries.
- Reuse existing async aggregation model.

## Security Notes

- Read only local metadata/process information necessary for agent detection.
- Do not execute arbitrary commands during detection.
