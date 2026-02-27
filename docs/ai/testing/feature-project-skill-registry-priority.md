---
phase: testing
title: Testing Strategy
description: Test precedence and parsing for project/global/default skill registries
---

# Testing Strategy

## Phase 7 Status
- Date: 2026-02-27
- Status: Completed for changed scope
- Notes: Feature-specific tests pass; one unrelated pre-existing workspace test failure remains in full CLI sweep.

## Test Coverage Goals
- Unit coverage for new/changed behavior in `ConfigManager` and `SkillManager`.
- Validate precedence conflict resolution and parser resilience.

## Unit Tests
### ConfigManager
- [x] Reads registry map from root `registries`.
- [x] Falls back to nested `skills.registries` when root map is absent.
- [x] Returns empty map when no valid registry map exists.

### SkillManager
- [x] Uses custom global registry over default (existing behavior retained).
- [x] Uses project registry over global and default on ID collision.

## Integration Tests
- [ ] Optional follow-up: CLI-level `skill add` using fixture `.ai-devkit.json` with project overrides.

## Test Reporting & Coverage
- Focused command executed:
  - `npm run test --workspace=packages/cli -- --runInBand src/__tests__/lib/Config.test.ts src/__tests__/lib/SkillManager.test.ts`
  - Result: 2 suites passed, 73 tests passed, 0 failed.
- Broader regression sweep:
  - `npm run test --workspace=packages/cli -- --runInBand`
  - Result: 25 suites passed, 1 failed.
  - Failure: `src/__tests__/commands/memory.test.ts` (`Cannot find module '@ai-devkit/memory'`), outside this feature's changed files.
- Feature documentation lint:
  - `npx ai-devkit@latest lint --feature project-skill-registry-priority`
  - Result: pass.

## Coverage Gaps
- No known unit-test gaps for changed paths.
- Optional integration follow-up remains open for full CLI fixture validation.
