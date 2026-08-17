---
phase: implementation
title: Pi Print Mode Implementation
description: Living implementation record for durable Pi print agents
---

# Pi Print Mode Implementation

## Development Setup

- Worktree: `feature-pi-print-mode` from `origin/main` at `a643f4a`.
- References: merged Claude implementation under `packages/agent-manager/src/print/`; read-only Codex worktree at `../feature-codex-print-mode`.
- Pi ground truth: installed package README, `docs/json.md`, and CLI capability probe.
- Tests run with repository Vitest/Nx scripts; no new dependencies.

## Code Structure

Planned additions are `PiCliProbe.ts`, `PiPrintRunner.ts`, and `PiPrintAgentService.ts` beside the Claude modules. Shared store/types and agent CLI wiring are generalized minimally.

## Implementation Notes

### Core Features

- Pending: provider-discriminated schema-v2 store with legacy reads.
- Pending: strict Pi JSONL runner with late UUID binding and resume args.
- Pending: provider-aware CLI creation/send/list/detail/console wiring.

### Patterns & Best Practices

- Red-green-refactor for each planning task.
- Mock child processes and store boundaries; validate public behavior.
- Preserve Claude defaults for callers that omit provider.

## Integration Points

`agent start` creates through the provider service; `agent send` resolves the persisted record then dispatches by provider; list/detail/console use the shared store union.

## Error Handling

Provider-specific probe/protocol/process errors are sanitized. The service maps identity mismatches to `sessionHealth: mismatch` and other failures to `unknown`, then records completion to release ownership.

## Performance Considerations

Parse stdout incrementally with a 1 MiB line limit. Store only the final bounded result summary.

## Security Notes

No shell, prompt via stdin, canonical cwd, no stderr reflection, UUID validation, ownership-checked session binding, and existing safe-file/run-lock protections.

## Deviations and Follow-ups

None at design completion. This document will be updated after each task with files, evidence, and deviations.
