---
phase: planning
title: Project Planning & Task Breakdown
description: TDD plan for registry update hardening
---

# Project Planning & Task Breakdown

## Milestones

- [ ] Milestone 1: Baseline update contract has direct `SkillRegistry` coverage.
- [ ] Milestone 2: Error and shorthand UX is implemented through red-green-refactor cycles.
- [ ] Milestone 3: Docs, coverage, full gates, and final review are complete.

## Task Breakdown

### Task 1: Dedicated baseline contract tests

- [ ] Create an isolated `SkillRegistry.test.ts` fixture using a temporary cache.
- [ ] Prove no-argument updates all candidates, exact IDs update one, non-Git candidates skip, and summaries count statuses correctly.
- Validation: focused Vitest run and assertions on Git/UI boundary calls.
- Dependencies: existing `SkillRegistry.updateSkills()` behavior.

### Task 2: Helpful not-found errors

- [ ] **Red:** Assert unknown full IDs throw `NotFoundError` with sorted available IDs and perform no pulls.
- [ ] **Green:** Discover candidates before selection and build the improved message.
- [ ] **Refactor:** Remove duplicated selection/error formatting and rerun focused tests.
- Validation: focused test and changed-file coverage.

### Task 3: Owner-less shorthand

- [ ] **Red:** Add unique, ambiguous, and zero-match repository-name scenarios.
- [ ] **Green:** Resolve only a single repo-name match and emit `ui.info`; reuse the not-found path otherwise.
- [ ] **Refactor:** Keep exact/full-ID and no-ID paths explicit and minimal.
- Validation: focused tests prove only the resolved registry pulls and invalid selectors pull none.

### Task 4: Documentation and release note

- [ ] Document no-argument, exact-ID, and unique shorthand examples in CLI docs.
- [ ] Add an unreleased changelog entry without altering released history.
- Validation: docs review and CLI help smoke test.

### Task 5: Lifecycle verification and review

- [ ] Update implementation/testing docs with changed files and fresh evidence.
- [ ] Run `npm ci` and `npm run build` before full gates.
- [ ] Run focused coverage, lifecycle lint, full workspace gates, and final code review.
- [ ] Commit and push each completed phase, rebase on latest `origin/main`, revalidate, and open the requested PR.

## Dependencies and Sequencing

Task 1 establishes the harness. Tasks 2 and 3 follow strict red-green-refactor cycles. Task 4 follows green behavior. Task 5 is last and may send implementation back to Tasks 2-4 if review identifies a blocking gap.

## Risks & Mitigation

- Module-level `SKILL_CACHE_DIR` can leak the real home directory: mock `os.homedir()` before dynamic import and reset modules.
- Filesystem enumeration order can make messages flaky: sort IDs before formatting and asserting.
- Existing `SkillManager` tests may duplicate behavior through mocks: keep new tests on the `SkillRegistry` public API and use real temporary directories.
- Workspace hooks depend on built artifacts: run deterministic install and build before full validation or commits containing implementation.

## Progress Summary

Requirements and design are approved from the explicit brief. Task tracing is unavailable because `npx ai-devkit@latest task ...` reports `unknown command 'task'`. Implementation has not started.
