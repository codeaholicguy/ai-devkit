---
phase: implementation
title: Pi Print Mode Implementation
description: Living implementation record for durable Pi print agents
---

# Pi Print Mode Implementation

## Development Setup

- Worktree: `feature-pi-print-mode`, rebased onto the durable-agents architecture on `origin/main`.
- References: merged shared durability implementation under `packages/agent-manager/src/durable/` and provider implementations under `packages/agent-manager/src/providers/{claude,codex}/`.
- Pi ground truth: installed package README, `docs/json.md`, and CLI capability probe.
- Tests run with repository Vitest/Nx scripts; no new dependencies.

## Code Structure

Pi provider modules mirror Claude under `src/providers/pi/durable/`. Shared durability models and SQLite persistence remain under `src/durable/`; shared changes are limited to the provider union, repository create input, exports, and CLI dispatch.

## Implementation Notes

### Core Features

- Complete: Pi support in the shared SQLite `DurableAgentRepository`; migration 004 permits Codex's deferred session binding, while Pi retains a non-null repository-assigned session UUID.
- Complete: Pi capability probe, bounded JSONL runner, repository-assigned session UUID via `--session-id`, exact resume args, and service state orchestration.
- Complete: provider-aware CLI creation/send dispatch, Pi labels, and shared durable list/detail integration.
- Complete: user-facing creation uses `--mode durable`; the retired `--mode print` spelling is rejected consistently.
- Complete: pure `PiPrintProtocol` helpers make argument, session-identity, and assistant-text mapping independently testable at 100% coverage.
- Complete: shared `durable/run.ts` now owns durable resolve, provider validation, run acquisition, execution, and completion ordering for Pi, Claude, and Codex services.
- Complete: wrong-provider service calls fail before acquiring or mutating the target, and a failed successful-completion write is attempted only once.
- Complete: `PiStreamParser` owns bounded JSONL state while the runner focuses on safe process orchestration.

### Patterns & Best Practices

- Red-green-refactor for each planning task.
- Mock child processes and store boundaries; validate public behavior.
- Preserve Claude defaults for callers that omit provider.
- Reuse shared durable sanitization, UUID validation, line buffering, process inspection, and child-close helpers instead of Pi-local copies.

## Integration Points

`agent start` creates through the provider service; `agent send` resolves the persisted record then dispatches by provider; list/detail/console use the shared durable repository.

## Error Handling

Provider-specific probe/protocol/process errors are sanitized. The service maps identity mismatches to `sessionHealth: mismatch` and other failures to `unknown`, then records completion to release ownership.

Successful completion persistence is outside the runner failure handler, so repository completion errors are not reclassified or retried as provider failures.

## Performance Considerations

Parse stdout incrementally with a 1 MiB line limit. Store only the final bounded result summary.

## Security Notes

No shell, prompt via stdin, canonical cwd, no stderr reflection, UUID validation, and SQLite CAS run ownership.

## Deviations and Follow-ups

The original file-store generalization was dropped because main supplies SQLite persistence and CAS concurrency. Unlike Codex, Pi accepts `--session-id`, so it uses a repository-assigned non-null UUID and does not call the Codex-only late-binding method. Pi already exposes the landed repository/probe/runner injection seams. Provider files are isolated under `src/providers/pi/durable/`; shared edits remain additive.

The 2026-08-27 simplification introduced one provider-neutral lifecycle function after three providers demonstrated the same sequence. Protocol parsing, error classification, session binding, and runner construction remain provider-local; no base class or provider plugin framework was added.
