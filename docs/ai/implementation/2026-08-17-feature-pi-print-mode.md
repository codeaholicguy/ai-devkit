---
phase: implementation
title: Pi Print Mode Implementation
description: Living implementation record for durable Pi print agents
---

# Pi Print Mode Implementation

## Development Setup

- Worktree: `feature-pi-print-mode`, rebased onto the durable-agents architecture on `origin/main`.
- References: merged Claude implementation under `packages/agent-manager/src/durable/`; read-only Codex worktree at `../feature-codex-print-mode`.
- Pi ground truth: installed package README, `docs/json.md`, and CLI capability probe.
- Tests run with repository Vitest/Nx scripts; no new dependencies.

## Code Structure

Pi provider modules live beside the Claude modules under `src/durable/`. Shared changes are limited to the provider union, repository create input, exports, and CLI dispatch.

## Implementation Notes

### Core Features

- Complete: Pi support in the shared SQLite `DurableAgentRepository`; no legacy import or Pi-specific migration is needed.
- Complete: Pi capability probe, bounded JSONL runner, repository-assigned session UUID via `--session-id`, exact resume args, and service state orchestration.
- Complete: provider-aware CLI creation/send dispatch, Pi labels, and shared durable list/detail integration.
- Complete: user-facing creation uses `--mode durable`; the retired `--mode print` spelling is rejected consistently.
- Complete: pure `PiPrintProtocol` helpers make argument, session-identity, and assistant-text mapping independently testable at 100% coverage.

### Patterns & Best Practices

- Red-green-refactor for each planning task.
- Mock child processes and store boundaries; validate public behavior.
- Preserve Claude defaults for callers that omit provider.

## Integration Points

`agent start` creates through the provider service; `agent send` resolves the persisted record then dispatches by provider; list/detail/console use the shared durable repository.

## Error Handling

Provider-specific probe/protocol/process errors are sanitized. The service maps identity mismatches to `sessionHealth: mismatch` and other failures to `unknown`, then records completion to release ownership.

## Performance Considerations

Parse stdout incrementally with a 1 MiB line limit. Store only the final bounded result summary.

## Security Notes

No shell, prompt via stdin, canonical cwd, no stderr reflection, UUID validation, and SQLite CAS run ownership.

## Deviations and Follow-ups

The original file-store generalization was dropped because main now supplies SQLite persistence and CAS concurrency. Pi uses the repository-assigned UUID directly, avoiding late session binding. Provider files are isolated under `src/durable/`; shared edits remain additive.
