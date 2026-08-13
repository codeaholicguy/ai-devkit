---
phase: planning
title: Project Planning & Task Breakdown
description: TDD plan for the skill add-registry command and config persistence
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Shared mutation rules and project persistence are covered and green.
- [x] Milestone 2: Global persistence is covered, including malformed-config protection.
- [ ] Milestone 3: CLI parsing, scope selection, force handling, opaque URLs, and output are covered and green.
- [ ] Milestone 4: Implementation/design reconciliation, coverage, full regression, and review gates are green.

## Task Breakdown

### Task 1: Shared mutation logic and project setter

- [x] **Red:** Add focused tests for a pure registry-mutation helper and `ConfigManager.addSkillRegistry`: first add, sibling preservation, same-value idempotency/no write, conflict/no write, force replacement, and missing project config.
- [x] **Green:** Implement the helper and project setter using `read → spread-merge → update` while treating URL as opaque.
- [x] **Refactor/validate:** Run the helper and `Config.test.ts` targets plus CLI lint; verify 100% coverage of the helper.
- Outcome: project-scope persistence is safe, merge-preserving, idempotent, and force-aware.
- Dependencies: existing `ConfigManager.update()`, `filterStringRecord`, and CLI error conventions.
- Test scenarios: all `ConfigManager.addSkillRegistry` scenarios and the shared conflict branches in the testing strategy.

### Task 2: Global setter and malformed-config safety

- [x] **Red:** Add tests for missing config creation, sibling/unrelated-field preservation, idempotency/no write, conflict, force, and present malformed JSON.
- [x] **Green:** Implement `GlobalConfigManager.addSkillRegistry` with an existence/read distinction before any write and reuse shared mutation logic.
- [x] **Refactor/validate:** Run `GlobalConfig.test.ts`, CLI lint, and focused coverage.
- Outcome: global persistence creates only when absent and never erases a present unreadable file.
- Dependencies: Task 1 helper, existing `read()`, `exists()`, private `write()`, and global path resolution.
- Test scenarios: all global-manager scenarios and failure-mode no-write checks.

### Task 3: Flat `skill add-registry` command

- [ ] **Red:** Extend command tests for command shape/help, project/default scope, `-g/--global`, `-f/--force`, ID validation, idempotent/success copy, conflict propagation, opaque URL examples, and absence of registry/cache/Git calls.
- [ ] **Green:** Register the new sibling command, reuse `validateRegistryId()`, select the manager, inspect only the target scope for output status, invoke the setter, and report success.
- [ ] **Refactor/validate:** Run command tests, all existing skill command tests, CLI lint, and focused coverage.
- Outcome: users can register any URL verbatim in either scope without network/cache work.
- Dependencies: Tasks 1–2 and existing Commander/UI/error-handler conventions.
- Test scenarios: all command, integration, help, and adjacent-command regression scenarios in the testing strategy.

### Task 4: Documentation and implementation reconciliation

- [ ] Update the implementation guide with actual files, behavior, error handling, and validation evidence.
- [ ] Run lifecycle feature lint and compare code against every requirement/design decision.
- [ ] Mark Tasks 1–3 and their testing checkboxes from fresh evidence; record any deviations or follow-ups.
- Outcome: lifecycle docs accurately describe the merged-ready implementation.
- Dependencies: Tasks 1–3 complete.

### Task 5: Final testing and review

- [ ] Run focused 100% coverage for all new pure logic and record the report.
- [ ] Run full root lint, test, build, feature lint, and CLI help/smoke validation.
- [ ] Perform final code review for correctness, security, compatibility, and scope adherence.
- [ ] Commit final docs/review fixes and prepare the PR body.
- Outcome: no regression and a merged-ready branch/PR.
- Dependencies: Task 4 complete.

## Dependencies & Sequence

Task 1 → Task 2 → Task 3 → Task 4 → Task 5. Phase 6 planning reconciliation runs after each implementation task. There are no external service dependencies: tests mock filesystem/config boundaries, and registration performs no network operation.

## Risks & Mitigation

- **Malformed global overwrite:** check file existence separately and fail if a present file cannot be parsed; assert no `writeJson` call.
- **Conflict logic diverges by scope:** centralize decision/merge behavior in one fully covered pure helper.
- **URL policy accidentally expands:** do not import URL/Git/network utilities; test SSH and arbitrary strings verbatim.
- **Default registry blocks offline add:** do not instantiate or fetch `SkillRegistry`; same-as-default is treated only as a target-scope write.
- **Command regression:** add the command as a flat sibling and run the complete existing skill command suite.
- **Internal workspace resolution:** build workspace packages after clean dependency installation before full tests.
- **External publication restriction:** local commits continue; push/PR require explicit authorization accepted by the environment for the configured GitHub remote.

## Progress Summary

Tasks 1–2 are complete. Project tests are 49/49 green; global tests are 15/15 green; the shared pure mutation helper remains at 100% coverage. The malformed-global test proves a present unreadable file is not written. No scope changes were discovered. The next action is Task 3's failing CLI tests; external push remains restricted pending explicit remote authorization.
