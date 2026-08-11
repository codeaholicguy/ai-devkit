---
phase: implementation
title: Codex Print-Mode Agent Implementation
description: Implementation record, decisions, validation, and deviations
---

# Codex Print-Mode Agent Implementation

## Status

- Current task: Task 4.4, publish the reviewed branch and open the PR.
- Completed: Tasks 1.1–4.3.
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

### Tasks 3.1–3.3

- Added an executable fake Codex CLI with deterministic provider-minted UUID, exact resume validation surface, stdin/cwd/argv capture, chunked results, and configurable protocol/process failures.
- Added integration proof that creation remains unbound/non-billable, first send binds, second send explicitly resumes, and post-binding failure retains the UUID.
- Made CLI print startup accept Claude or Codex, select the persisted provider for sends, render `Codex (print)`/`not started`, and derive JSON provider from the record.
- Preserved the common store resolver, exact-ID precedence, cross-mode ambiguity, synchronous timeout behavior, and interactive command paths.

TDD red: Codex fixture execution and two CLI routing tests failed before executable/routing support. Green/refactor: agent-manager passed 28 files/518 tests; CLI passed 79 files/932 tests; both typechecks and lints exited 0 (five existing CLI warnings).

### Tasks 4.1–4.3

- Hardened runner callback/process error classification and probe recognition of the standalone stdin dash token.
- Replaced new version-1 writes with version 2 and added a strict Claude-only version-1 compatibility reader; malformed or version-1 Codex records are rejected.
- Reviewed all changed files against requirements/design and traced CLI/service/store call sites. No blocking security, compatibility, or integration findings remain.

TDD red/green evidence includes the standalone-dash false-positive probe test, child-process error classification test, and explicit version-1-to-version-2 migration test.

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

- Base and feature lifecycle lint: passed.
- Root lint: passed with six existing warnings in unrelated files and no errors.
- Root build: six projects passed.
- Root tests: six projects passed; agent-manager 28 files/527 tests and CLI 79 files/932 tests in their fresh coverage runs.
- Agent-manager coverage: 90.23% statements and 93.4% lines overall; every new Codex module has 100% lines/functions, and `CodexCliProbe` has 100% statements/branches/functions/lines. Runner/service residual branch-only gaps are injected/default process plumbing, not pure parsing logic.
- CLI coverage: 79 files/932 tests; 71.6% statements, 61.67% branches, 69.77% functions, 72.74% lines overall.
- Known test-run warning: pre-existing max-listener warnings in agent-manager tests; no new persistent process listeners were added.
