---
phase: planning
title: Claude Provider Refactor Plan
description: Ordered behavior-preserving extraction plan for Claude provider code
---

# Claude Provider Refactor Plan

## Milestones

- [x] Milestone 1: Requirements, design, and testing strategy created.
- [x] Milestone 2: Baseline validation recorded before source changes.
- [x] Milestone 3: Claude parser and adapter implementation moved behind compatibility exports.
- [x] Milestone 4: Claude session locator and agent mapper extracted with focused tests.
- [x] Milestone 5: Claude durable implementation moved behind compatibility exports.
- [x] Milestone 6: Final validation, implementation check, testing update, and review complete.

## Task Breakdown

### Phase 1: Baseline and Compatibility Shell

- [x] Task 1.1: Run baseline `agent-manager` test, typecheck, lint, and build commands.
  - Outcome: pre-refactor pass/fail evidence is recorded.
  - Validation: task evidence includes command, exit code, and summary.
  - Testing scenarios: baseline reporting in testing doc.
- [x] Task 1.2: Create `src/providers/claude/` and move `ClaudeSessionParser` behind the old `utils/ClaudeSessionParser.ts` export.
  - Outcome: existing parser tests and imports remain valid.
  - Validation: `ClaudeSessionParser` tests pass.
  - Testing scenarios: parser compatibility.
- [x] Task 1.3: Move `ClaudeCodeAdapter` implementation behind `src/adapters/ClaudeCodeAdapter.ts` compatibility export.
  - Outcome: public and adapter barrel exports remain valid.
  - Validation: `ClaudeCodeAdapter` tests compile and pass.
  - Testing scenarios: adapter export compatibility.

### Phase 2: Provider-Local Extraction

- [x] Task 2.1: Extract Claude session locating/matching logic into `providers/claude/ClaudeSessionLocator.ts`.
  - Outcome: resume matching, PID-file matching, legacy discovery, and historical discovery are isolated from adapter orchestration.
  - Dependencies: Task 1.3.
  - Validation: existing adapter tests pass; add focused locator tests if exposed behavior is easier to assert directly.
  - Testing scenarios: resume direct match, stale PID fallback, missing JSONL fallback, historical discovery.
- [x] Task 2.2: Extract Claude `AgentInfo` mapping into `providers/claude/ClaudeAgentMapper.ts`.
  - Outcome: live status precedence, waiting summary decoration, and process-only fallback are isolated.
  - Dependencies: Task 2.1.
  - Validation: adapter tests pass; focused mapper tests cover status/summary/path behavior.
  - Testing scenarios: mapper unit scenarios.
- [x] Task 2.3: Add provider-local `types.ts` only for shared Claude internal types that are used by more than one provider-local module.
  - Outcome: not needed. Shared internal types stayed local to `ClaudeAgentMapper` and `ClaudeSessionLocator`, avoiding a thin unused file.
  - Dependencies: Task 2.1 or 2.2 if duplication appears.
  - Validation: typecheck.

### Phase 3: Durable Provider Locality

- [x] Task 3.1: Move Claude durable execution files under `providers/claude/durable/` with old `src/durable/*` paths as compatibility exports, if the move is low-risk after Phase 2.
  - Outcome: `ClaudeCliProbe`, `ClaudePrintRunner`, and `ClaudePrintAgentService` are provider-local while public exports remain unchanged.
  - Dependencies: Phase 2 complete and green.
  - Validation: durable print tests pass.
  - Testing scenarios: existing durable tests through compatibility exports.
- [x] Task 3.2: If durable relocation creates disproportionate churn, defer it explicitly in implementation notes and keep the interactive Claude extraction complete.
  - Outcome: durable relocation completed; no deferral was required.
  - Outcome: scope remains safe and documented.
  - Dependencies: Phase 2 outcome.
  - Validation: docs record deferral rationale.

### Phase 4: Final Checks

- [x] Task 4.1: Update implementation and testing docs with changed files, decisions, deviations, and command evidence.
- [x] Task 4.2: Run final package validation: tests, typecheck, lint, build, and feature lint.
- [x] Task 4.3: Run implementation alignment check against requirements/design.
- [x] Task 4.4: Run final review and close task if no blocking findings remain.

## Dependencies

- Existing public exports in `src/index.ts`, `src/adapters/index.ts`, and `src/durable/*` must remain compatible throughout.
- Task 1.1 must complete before source edits.
- Parser and adapter moves should happen before extraction to minimize import churn.
- Durable relocation depends on interactive provider extraction being stable.

## Timeline & Estimates

- Baseline and compatibility shell: small.
- Locator and mapper extraction: medium, highest regression risk because tests currently exercise private adapter behavior indirectly.
- Durable relocation: small to medium, but can be deferred if it adds unrelated blast radius.
- Final validation/review: medium because full `agent-manager` tests and build must run.

## Risks & Mitigation

- **Risk:** Compatibility exports break declaration output or package barrels.
  - Mitigation: run typecheck/build after moves and inspect public exports.
- **Risk:** Private-method tests become brittle after extraction.
  - Mitigation: move assertions to provider-local module tests where behavior is now first-class.
- **Risk:** Locator extraction accidentally changes fallback ordering.
  - Mitigation: preserve existing test coverage and move code mechanically before simplifying.
- **Risk:** Durable relocation pulls in broader repository import churn.
  - Mitigation: keep old durable files as re-exports; defer relocation if it becomes disproportionate.
- **Risk:** Lint rules reject re-export-only compatibility files.
  - Mitigation: use existing barrel export style and validate early.

## Resources Needed

- Existing `agent-manager` Vitest suites.
- Existing Claude adapter/parser/durable fixtures and fake Claude executable.
- `npx ai-devkit@latest lint --feature claude-provider-refactor` for lifecycle validation.
- Task tracing under `claude-provider-refactor`.

## Progress Summary

Implementation completed. Claude interactive detection, parsing, mapping, session locating, and durable print-mode execution now live under `src/providers/claude/` with compatibility re-exports preserving old adapter, utility, and durable paths. The planned `types.ts` file was intentionally skipped because extracted modules did not need a shared provider-local type barrel.
