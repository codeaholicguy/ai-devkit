---
phase: implementation
title: Claude Print-Mode Agent Implementation
description: Implementation record, decisions, validation, and deviations
---

# Claude Print-Mode Agent Implementation

## Status

- Current task: 4.4 validation and formal reviews.
- Completed: Tasks 1.1–4.3.
- Task tracing: unavailable (`unknown command 'task'`).

## Changes

### Task 1.1

- Added `packages/agent-manager/src/durable/DurableAgent.ts` with the durable record, state, session health, last-result, active-run, and process-identity contracts.
- Added classified durable-agent/repository/Claude errors that do not carry prompt content.
- Exported the public contracts from `@ai-devkit/agent-manager`.

## TDD Evidence

- Red: `npx vitest run src/__tests__/print/DurableAgent.test.ts` failed because `DurableAgentBusyError` was absent.
- Green/refactor: the same focused test passed (1/1), followed by `npm run typecheck` exit 0.
- Task 1.2 red: three focused store tests failed because `DurableAgentRepository` was absent.
- Task 1.2 green/refactor: all three store tests passed and `npm run typecheck` exited 0.
- Task 1.3 red: two run-ownership tests failed because acquisition/completion methods were absent.
- Task 1.3 green/refactor: all five store tests passed and `npm run typecheck` exited 0.
- Task 2.1 red: two probe tests failed because `ClaudeCliProbe` was absent.
- Task 2.1 green/refactor: both probe tests passed and `npm run typecheck` exited 0.
- Task 2.2 red: runner tests failed because `ClaudePrintRunner` was absent.
- Task 2.2 green/refactor: both runner tests passed; an initial typecheck caught an unsafe spread narrowing, then the full test/typecheck gate passed after correction.
- Tasks 2.3–3.3 used focused service and CLI red/green cycles for create, first/resumed send, list/detail, and direct-send routing.
- Task 4.1 added an executable fake Claude fixture proving no invocation at create, prompt-only stdin, exact first `--session-id`, and exact later `--resume`.
- Task 4.2 red/green hardening covered stale/incomplete locks, cwd replacement, abandoned mutation locks, secret-bearing stderr, and unsupported timeout behavior.

### Task 1.2

- Added a separate versioned `~/.ai-devkit/durable-agents.json` repository.
- Added canonical cwd validation, distinct UUID generation, exact ID/name resolution, duplicate-name rejection, atomic exclusive temp-file replacement, owner-only mode, bounded mutation locking, and symlink rejection.

### Task 1.3

- Added atomic per-agent lock directories, random ownership tokens, owner/provider PID-start fingerprints, fail-fast busy errors, token-checked state changes, and no-signal stale recovery.
- Provider identity can be persisted before prompt delivery, closing the material parent-crash race described by the design.

### Task 2.1

- Added an injectable capability probe that invokes only `claude --version` and `claude --help`, requires the documented print/session/stream flags, and sanitizes bounded diagnostics.

### Task 2.2

- Added exact first/resume argv construction with `shell: false`, prompt-only stdin after durable provider identity, bounded NDJSON parsing, drained-but-undisclosed stderr, tolerant unknown events, strict session verification, and terminal-result plus exit-code success criteria.

### Tasks 2.3–4.3

- Added create/send orchestration with fail-fast ownership and no retries.
- Added the narrow CLI integrations for print start, merged list/detail, and synchronous direct send while leaving interactive defaults and excluded commands unchanged.
- Added a user-facing list mode boundary: live process agents render as `interactive`, while internal print-mode records render as `durable` in both table and JSON output. Internal storage and harness contracts remain `mode: 'print'`.
- Added deterministic unit/integration fixtures that never invoke a real model.
- Added crash recovery for old mutation and incomplete run locks and exact cwd/session binding checks.
- Documented inherited Claude permissions, hooks, MCP/tool side effects, and explicit print-mode timeout rejection.

## Design Alignment

- `AgentInfo` remains unchanged and process-specific.
- Durable-agent identity is a separate durable type.
- No channel, task, receipt, daemon, queue, cancellation, deletion, transcript, or non-Claude provider behavior was added.

## Deviations and Follow-ups

- Claude CLI output details beyond the locally verified 2.1.220 help and captured official documentation remain protected by the startup capability probe and are tracked as compatibility behavior, not hard-coded version assumptions.

## Formal Security Review

- Scope: new durable-agent domain/store/probe/runner/service, direct CLI integrations, fixtures, and documentation. Trust boundaries are CLI caller → local state → ephemeral Claude process → untrusted stream/output; the local OS account is the authorization boundary.
- Remediated `SEC-PRINT-001` (medium, data exposure): provider stderr could contain an echoed prompt or tool secret. The runner now drains stderr but never reflects or persists it; a regression test uses a secret-bearing failure.
- Remediated `SEC-PRINT-002` (medium, availability/business logic): a crash could strand the global mutation lock. Old empty mutation locks are atomically quarantined and removed after a bounded age; live short operations remain protected.
- Remediated `SEC-PRINT-003` (medium, workflow correctness): print `--timeout` was accepted but unenforced. It is now explicitly rejected, because adding termination/cancellation is outside scope.
- Remediated `SEC-PRINT-004` (low, terminal injection): human-rendered provider results now strip OSC and control bytes; JSON output remains structured data.
- Verified controls: prompt only on stdin, `shell: false`, fixed allowlisted argv, canonical cwd binding, exact provider UUID matching, atomic fail-fast run lock, PID/start fingerprints, bounded stream lines, owner-only state files, symlink rejection, no retries, and no permission-bypass flags.
- Dependency audit: 0 critical, 29 high, 11 moderate, and 2 low advisories in the existing workspace dependency graph. No dependency was added by this feature; remediation of repository-wide advisory chains is outside this feature scope.
- Residual risk: Claude still inherits user/project settings, hooks, MCP servers, permissions, and tool side effects. A parent/process crash may leave the provider action outcome unknown; the agent becomes degraded and AI DevKit never retries automatically. Local users who can already modify the same account's state/config remain inside the authorization boundary.

## Validation Evidence

- Agent manager: lint/build passed; 24 files and 497 tests passed; coverage 89.66% statements, 77.98% branches, 96.13% functions, 92.88% lines (new print module: 80.5% statements, 70.08% branches, 95.71% functions, 85.51% lines).
- CLI: lint/build passed with five pre-existing warnings in untouched files; 78 files and 921 tests passed; coverage 70.97% statements, 61.29% branches, 69.58% functions, 72.04% lines.
- Base and feature lifecycle lint passed. The executable fake-provider journey passed without a real or billable Claude prompt.
- Existing agent-manager tests emit process-listener count warnings; no new persistent listeners are registered by the print implementation.
