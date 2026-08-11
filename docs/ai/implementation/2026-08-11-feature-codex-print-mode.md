---
phase: implementation
title: Codex Print-Mode Agent Implementation
description: Implementation record, decisions, validation, and deviations
---

# Codex Print-Mode Agent Implementation

## Status

- Current task: Task 3.1, fake-Codex integration fixture.
- Completed: Tasks 1.1–2.3 and lifecycle document initialization.
- Task tracing: unavailable (`unknown command 'task'`).

## Development Setup

- Worktree: `feature-codex-print-mode`.
- Bootstrap: `npm ci` from the repository lockfile.
- Provider validation and tests are non-billable; only the deterministic fake Codex executable is used.

## Code Structure

- `packages/agent-manager/src/print`: shared durable store plus parallel Claude/Codex probe, runner, service, and errors.
- `packages/agent-manager/src/__tests__/print`: unit/service/integration tests.
- `packages/agent-manager/src/__tests__/fixtures/fake-codex.cjs`: executable provider fixture.
- `packages/cli/src/commands/agent.ts` and CLI tests: provider-aware routing/rendering.

## Implementation Notes

This section will be updated after each TDD task with changed files, red/green evidence, decisions, deviations, and edge cases. The load-bearing rule is that Codex's provider-minted UUID is persisted during the active first run before terminal success.

### Tasks 2.1–2.3

- Added provider-specific classified errors and a three-command, non-model Codex capability probe.
- Added safe initial/resume runner argv, process-identity-before-stdin handshake, strict bounded JSONL parsing, immediate async thread binding, ordered assistant messages, and terminal success requirements.
- Added Codex create/send orchestration with provider-aware create, run-token callbacks, mismatch/unknown health classification, and no retry.

TDD red: 14 focused tests failed on absent Codex exports. Green/refactor: those 14 tests passed; the full agent-manager suite passed 27 files/515 tests; typecheck and lint exited 0.

## Integration Points

- The existing print store remains the single durable mapping and exclusion authority.
- CLI start selects probe/service by requested type; send selects by persisted record provider.
- Runner callbacks persist provider process identity before stdin and provider session identity on `thread.started`.

## Error Handling

- `CodexPrintError` classifies unsupported CLI, process, protocol, session mismatch, and missing result failures.
- The service records failures through token-owned completion, mapping well-formed UUID mismatch to `mismatch` and other session/protocol failures to `unknown`.
- There is no retry, replacement session, or fallback to `--last`.

## Performance Considerations

- Each send spawns one process; no idle process or server is retained.
- JSONL line buffering, stderr capture, and stored summaries are bounded.
- Store mutation locks are short-lived; the per-agent lock spans the provider run.

## Security Notes

- Prompt only via stdin after provider identity persistence; `shell: false`; fixed argv.
- Exact canonical cwd; explicit UUID resume; no permission bypass or transcript copying.
- Provider output is untrusted and validated before affecting durable identity or success.

## Validation Evidence

Pending implementation. Fresh command evidence will be recorded during TDD and final gates.
