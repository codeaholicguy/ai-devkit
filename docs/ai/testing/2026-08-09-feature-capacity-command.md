---
phase: testing
title: Capacity Command Test Record
description: Coverage and validation for the Codex-only implementation
---

# Capacity Command Test Record

## Agent-manager Capacity Coverage

- [x] Resolve `CODEX_HOME` before the home fallback.
- [x] Normalize API and CLI windows without converting missing values to zero.
- [x] Preserve session, weekly, credit, individual-limit, and additional-window data.
- [x] Prefer PAT, then fresh OAuth, then CLI; fall back on stale credentials, 401s, and request failures.
- [x] Use read-only/untrusted app-server arguments and account-only methods.
- [x] Distinguish logged-out account state and keep unknown/unavailable semantics.
- [x] Prevent token and raw failure leakage.
- [x] Detect Codex configuration and installation independently before probing.
- [x] Build exactly one Codex report (schemaVersion 1) and redact unexpected probe failures.

## CLI Coverage

- [x] Render the JSON report exactly (schemaVersion field included).
- [x] Render human headers, windows, credits, and warnings.
- [x] Accept omitted provider and `codex`, forwarding no cache options.
- [x] Reject non-Codex providers before probing.

## Removed Coverage

Cache freshness/permissions, generic provider detection, parallel/partial multi-provider orchestration, and Claude/Pi/stub tests were removed with their behavior. They provided no unique coverage of the simplified contract.

## Required Fresh Validation

- `npm ci` only if `node_modules` is absent.
- `npm run build` at repository root.
- `npm test --workspace=@ai-devkit/agent-manager`.
- `npm test --workspace=ai-devkit`.
- `npm test` for the complete repository suite.

Final command output and pass/fail counts are recorded in the implementation handoff for this uncommitted worktree change.
