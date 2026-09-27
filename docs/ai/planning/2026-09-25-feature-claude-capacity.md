---
phase: planning
title: Claude Capacity Implementation Plan
description: Ordered implementation and verification tasks for Claude subscription capacity
---

# Claude Capacity Implementation Plan

## Milestones

- [x] Milestone 1: Provider contract is specified by failing fixture-based tests.
- [x] Milestone 2: Claude provider and public agent-manager integration pass focused tests.
- [x] Milestone 3: CLI integration, documentation, and full validation pass.

## Task Breakdown

### Phase 1: Provider contract and fixtures

- [x] Task 1.1: Add obviously fake credential, complete usage, partial usage, and malformed usage fixtures.
  - Outcome: tests never depend on live credentials or endpoints.
  - Dependencies: approved requirements/design.
  - Validation: fixtures parse only through test code and contain no real-looking account data.
  - Scenarios: all Test Data items.
- [x] Task 1.2: Add failing credential-resolution tests for environment precedence, default/custom profile paths, missing/malformed auth, and expiry.
  - Outcome: read-only credential contract is executable.
  - Dependencies: Task 1.1 credential fixture.
  - Validation: focused Vitest run fails for missing implementation rather than test setup.
  - Scenarios: Credential resolution checklist.
- [x] Task 1.3: Add failing parser/request tests for all usage mappings, partial/malformed payloads, exact headers, timeout, sanitized status/network failures, and Retry-After forms.
  - Outcome: API and normalization contracts are executable before production code.
  - Dependencies: Task 1.1 usage fixtures.
  - Validation: focused Vitest run demonstrates red state.
  - Scenarios: Usage parsing and HTTP probing checklists.

### Phase 2: Agent-manager implementation

- [x] Task 2.1: Implement `capacity/claude.ts` credential resolution and parsing with injected boundaries.
  - Outcome: environment/profile credentials resolve without writes; default-profile macOS users additionally receive bounded Keychain fallback.
  - Dependencies: Task 1.2.
  - Validation: credential tests pass.
- [x] Task 2.2: Implement usage normalization for core, model, scoped, and extra-usage windows.
  - Outcome: endpoint data maps into unchanged capacity contracts without token-total inference.
  - Dependencies: Task 1.3.
  - Validation: parser tests pass, including partial fixtures.
- [x] Task 2.3: Implement the bounded request and safe HTTP/error mapping.
  - Outcome: exact request contract and sanitized errors for 401/403/429/other/network/malformed JSON.
  - Dependencies: Tasks 2.1-2.2.
  - Validation: HTTP tests pass and assert no fake secret/body leakage.
- [x] Task 2.4: Export `getClaudeCapacityReport` and verify its injected clock/report integration.
  - Outcome: agent-manager exposes the third capacity provider without a registry.
  - Dependencies: Tasks 2.1-2.3.
  - Validation: index integration and full agent-manager suites pass.

### Phase 3: CLI integration and lifecycle evidence

- [x] Task 3.1: Add Claude to supported provider selection and the existing direct reader.
  - Outcome: explicit and default commands include Claude while preserving de-duplication and aliases.
  - Dependencies: Task 2.4.
  - Validation: CLI selection and failure-behavior tests pass.
- [x] Task 3.2: Add the Anthropic display label and mocked report rendering coverage.
  - Outcome: text and JSON use the existing renderer without a Claude-specific presentation path.
  - Dependencies: Task 3.1.
  - Validation: renderer tests pass.
- [x] Task 3.3: Reconcile implementation/testing documents and checklist status.
  - Outcome: lifecycle docs describe actual code, deviations, and fresh evidence.
  - Dependencies: all implementation tasks.
  - Validation: feature lint and `git diff --check` pass.
- [x] Task 3.4: Run focused tests, build, full repository tests, and final review.
  - Outcome: implementation is evidence-backed and ready for user inspection.
  - Dependencies: Tasks 3.1-3.3.
  - Validation: commands listed in the testing strategy complete successfully.

## Dependencies

- Tasks execute in numeric order; CLI integration depends on the public agent-manager export.
- No external account, real credential, live network, Claude subprocess, migration, or new package dependency is required for implementation and tests. Keychain behavior is exercised only through an injected fake reader.
- Existing `CapacityReport`, `CapacityWindow`, renderer, and multi-provider failure behavior are load-bearing contracts and must remain backward compatible.

## Timeline & Estimates

- Provider tests and fixtures: small.
- Provider implementation: medium, with the largest risk in partial payload and error semantics.
- CLI integration: small.
- Full validation and review: medium because the monorepo suite must run.

Work proceeds continuously in this lifecycle run; estimates communicate relative complexity rather than delivery dates.

## Risks & Mitigation

- Anthropic payload drift: parse untrusted values conservatively and retain valid partial data.
- Secret leakage: never include auth input or response bodies in errors; assert this with fake sentinel values.
- Profile mismatch: derive one credential path from the injected environment and never use the global Keychain fallback for a custom `CLAUDE_CONFIG_DIR`.
- Monetary-unit confusion: convert both returned amounts consistently and label the currency; never map them as tokens.
- Over-generalization: keep all new logic provider-local and add no flag, registry, base class, or fallback without a current caller.
- Regression in default command behavior: update exact provider-set and partial-failure CLI tests.

## Resources Needed

- Existing Node/TypeScript/Vitest workspace only.
- Supplied CodexBar Claude provider as the behavioral reference.
- Existing Codex and z.ai capacity implementations as repository conventions.
- Fixture-based mocks for all external boundaries.

## Progress Summary

All planned provider, CLI, documentation, and validation tasks are complete. The final review found no blocking or important issues. Fresh evidence includes 27 Claude provider tests, 13 capacity CLI tests, and the full 2,307-test repository suite passing. The approved Keychain extension remains provider-local and adds no general abstraction.
