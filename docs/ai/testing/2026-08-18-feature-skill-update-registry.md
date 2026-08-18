---
phase: testing
title: Testing Strategy
description: Direct coverage for cached registry update selection and summaries
---

# Testing Strategy

## Test Coverage Goals

- Cover every new selector branch and preserve the existing full-ID/no-ID contract.
- Exercise real temporary cache directory discovery while mocking only Git and terminal boundaries.
- Target 100% coverage of changed `SkillRegistry` selection logic.

## Unit and Integration Tests

### `SkillRegistry.updateSkills`

- [x] No argument updates every cached registry.
- [x] Exact `owner/repo` updates only that registry.
- [x] Unknown full ID throws `NotFoundError` listing sorted available IDs before pulls.
- [x] Unique owner-less repo name resolves, emits `ui.info`, and updates only its full ID.
- [x] Ambiguous owner-less name throws and lists available IDs before pulls.
- [x] Zero-match owner-less name throws and lists available IDs before pulls.
- [x] Non-Git cache directories are skipped without a pull.
- [x] Mixed success, skip, and failure results produce correct totals and per-status counts.
- [x] Missing cache returns an empty summary without updates.

## Test Data and Isolation

- Override `os.homedir()` before importing `SkillRegistry` so its exported cache constant points into a per-test temporary directory.
- Seed `~/.ai-devkit/skills/<owner>/<repo>` directories with `fs-extra`.
- Mock `ensureGitInstalled`, `isGitRepository`, `pullRepository`, and terminal UI methods; do not run Git or network operations.
- Clean the temporary directory and restore mocks/modules after each test.

## Validation

- Focused red/green: `npx vitest run src/__tests__/lib/SkillRegistry.test.ts` from `packages/cli`.
- Focused coverage: `npx vitest run src/__tests__/lib/SkillRegistry.test.ts --coverage --coverage.include=src/lib/SkillRegistry.ts`.
- Required bootstrap before full gates: `npm ci`, then `npm run build` from repository root.
- Full gates: lifecycle lint, workspace lint, tests, and build using repository scripts.
- CLI help smoke test confirms the documented optional registry argument.

## Manual Testing

No live registry pull is required; the orchestrator already verified the baseline exact-ID behavior. Automated tests cover the hardening changes without mutating the user cache.

## Bug Tracking

Any failure that permits an invalid/ambiguous selector to pull a registry is blocking. Cosmetic output differences are blocking when they omit the resolved ID or available IDs required by the contract.

## Results

- Focused test: 9/9 passed after the final missing-cache scenario was added.
- Focused coverage: exit 0; all selector behaviors are covered (whole `SkillRegistry.ts`: 64.42% statements, 62% branches, including unrelated fetch/clone paths).
- Lifecycle lint: base and feature checks passed.
- Workspace lint: all 6 projects passed with warnings only.
- Workspace tests: 1,923 tests passed across 137 files and 6 projects.
- Workspace build: all 6 projects passed after a clean `npm ci`.
- CLI help smoke test: optional `[registry-id]` displayed.
