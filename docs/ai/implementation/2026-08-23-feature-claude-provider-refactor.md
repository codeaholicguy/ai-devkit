---
phase: implementation
title: Claude Provider Refactor Implementation Notes
description: Technical notes and evidence for behavior-preserving Claude provider extraction
---

# Claude Provider Refactor Implementation Notes

## Development Setup

- Active worktree: `.worktrees/feature-claude-provider-refactor`
- Branch: `feature-claude-provider-refactor`
- Dependency bootstrap: `npm ci` completed.
- Lifecycle lint: `npx ai-devkit@latest lint --feature claude-provider-refactor` passes.

## Code Structure

Target internal structure:

```text
packages/agent-manager/src/providers/claude/
  ClaudeCodeAdapter.ts
  ClaudeSessionLocator.ts
  ClaudeSessionParser.ts
  ClaudeAgentMapper.ts
  types.ts
  durable/
```

Compatibility paths must remain:

```text
packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts
packages/agent-manager/src/utils/ClaudeSessionParser.ts
packages/agent-manager/src/durable/ClaudeCliProbe.ts
packages/agent-manager/src/durable/ClaudePrintRunner.ts
packages/agent-manager/src/durable/ClaudePrintAgentService.ts
```

## Implementation Notes

### Core Features

- Move files first, then extract logic.
- Keep `ClaudeCodeAdapter` as the public `AgentAdapter` implementation.
- Keep parser behavior unchanged.
- Keep live PID-file status precedence unchanged.
- Keep legacy CWD + birthtime matching fallback unchanged.
- Keep durable Claude print-mode behavior unchanged.

### Patterns & Best Practices

- Use compatibility re-exports instead of deleting old paths.
- Keep provider-local concrete classes small and focused.
- Avoid a generic provider/capability framework in this feature.
- Add comments only where extraction makes responsibility boundaries clearer.
- Prefer existing utilities from `utils/session`, `utils/matching`, and `utils/process`.

## Integration Points

- `src/index.ts` and `src/adapters/index.ts` continue exporting `ClaudeCodeAdapter`.
- `AgentManager` continues working through `AgentAdapter`.
- `ClaudeCodeAdapter` continues using shared process snapshot filtering.
- Durable service continues using `DurableAgentRepository`, `ClaudeCliProbe`, and `ClaudePrintRunner` contracts.

## Error Handling

- PID-file read, malformed JSON, stale metadata, and missing JSONL errors remain swallowed and routed to fallback behavior.
- Session JSONL read errors continue returning `null` or empty conversations as before.
- Durable provider errors and sanitization remain unchanged.

## Performance Considerations

- Live detection must remain process-scoped and avoid scanning all Claude project directories.
- Historical `listSessions()` may continue walking every Claude project directory by design.
- `batchGetSessionFileBirthtimes()` remains the shared stat batching utility for legacy live matching.

## Security Notes

- No new provider command execution behavior is introduced.
- Prompt handling and durable stdin behavior remain unchanged.
- Provider-reported metadata is not promoted to persisted state by this refactor.
- Compatibility wrappers must not duplicate or alter durable persistence behavior.

## Implementation Log

- Baseline validation before source changes:
  - `npm run nx -- test agent-manager` passed with 28 test files and 568 tests.
  - `npm run lint` in `packages/agent-manager` passed.
  - `npm run typecheck` in `packages/agent-manager` passed.
  - `npm run build` in `packages/agent-manager` passed.
- Moved `ClaudeSessionParser` to `packages/agent-manager/src/providers/claude/ClaudeSessionParser.ts`.
  - Kept `packages/agent-manager/src/utils/ClaudeSessionParser.ts` as a compatibility export.
  - Focused parser validation passed with 19 tests.
- Moved `ClaudeCodeAdapter` implementation to `packages/agent-manager/src/providers/claude/ClaudeCodeAdapter.ts`.
  - Kept `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts` as a compatibility export.
  - Focused adapter validation passed with 87 tests.
- Added `packages/agent-manager/src/providers/claude/ClaudeAgentMapper.ts`.
  - Extracted session-backed and process-only `AgentInfo` mapping from the adapter.
  - Added focused mapper tests covering live status precedence, waiting summaries, and process-only fallback.
- Added `packages/agent-manager/src/providers/claude/ClaudeSessionLocator.ts`.
  - Extracted resume matching, PID-file matching, legacy live discovery, project-dir encoding, and historical session discovery from the adapter.
  - Added focused locator test covering resume matching plus live PID status metadata.
  - Kept adapter private compatibility proxies for existing tests that mutate fixture directories.
- Moved Claude durable execution implementations under `packages/agent-manager/src/providers/claude/durable/`.
  - Kept old `packages/agent-manager/src/durable/Claude*.ts` paths as compatibility exports.
  - Claude print-mode focused validation passed with 4 test files and 8 tests.
- Final validation after source changes:
  - `npm run nx -- test agent-manager` passed with 30 test files and 571 tests.
  - `npm run lint` in `packages/agent-manager` passed.
  - `npm run typecheck` in `packages/agent-manager` passed.
  - `npm run build` in `packages/agent-manager` passed.
  - `npx ai-devkit@latest lint --feature claude-provider-refactor` passed.

## Design Deviations

- `providers/claude/types.ts` was not created. The extracted modules did not need a shared provider-local type barrel, and skipping it avoids a thin abstraction.
- Adapter private compatibility proxies remain for `discoverSessions`, `tryPidFileMatching`, and `getProjectDir` because the existing test suite exercises those hooks. They delegate to `ClaudeSessionLocator` and are not public package contracts.
