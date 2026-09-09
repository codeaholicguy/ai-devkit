---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Preserve existing behavioral coverage after moving code.
- Keep unit tests focused on helpers and services.
- Run command tests to verify CLI-to-service wiring.
- Run build to verify declaration emit and ESM import paths.

## Unit Tests
**What individual components need testing?**

### Skill Validation / Description
- [x] Skill and registry validation accepts/rejects the same inputs as before.
- [x] Description extraction preserves frontmatter and fallback behavior.

### Registry Source / Registry Discovery
- [x] Local registry source parsing and normalization behavior is preserved.
- [x] Duplicate canonical local folders are still rejected.
- [x] Registry skill discovery, local registry path containment, and metadata limits remain covered by registry tests.

### Skill Services
- [x] Skill installer preserves add/list/remove behavior.
- [x] Skill installer exposes installable skill discovery without owning command prompts.
- [x] Skill installer target resolution remains covered through add/list/remove behavior.
- [x] Skill registry service preserves add/remove registry workflow.
- [x] Skill index service preserves search, rebuild, refresh, stale fallback, and per-registry update behavior.
- [x] Index/update coverage is split from the broader skill service test file.

## Integration Tests
**How do we test component interactions?**

- [x] `commands/skill.ts` calls `SkillService` for skill and registry workflows and owns omitted-skill interactive selection.
- [x] `services/install/install.service.ts` installs configured skills through `SkillService`.
- [x] `services/setup/setup.service.ts` installs built-in skills through the new built-ins/service path.

## End-to-End Tests
**What user flows need validation?**

- [x] Existing automated command/service tests cover the critical CLI flows.
- [x] Manual CLI smoke is optional because behavior is structural and existing tests are broad.

## Test Data
**What data do we use for testing?**

- Existing test fixtures, mocked config managers, mocked filesystem, mocked Git/GitHub helpers, and mocked terminal UI.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Required evidence:
  - `npm --workspace packages/cli test -- skill`: exit 0, 8 files and 175 tests passed.
  - `npm --workspace packages/cli run lint`: exit 0, with one pre-existing warning in `commands/channel.ts`.
  - `npm run build`: exit 0, all 6 workspace projects built.
  - `npm --workspace packages/cli test`: exit 0, 96 files and 1147 tests passed.

## Manual Testing
**What requires human validation?**

- User code review before push.

## Performance Testing
**How do we validate performance?**

- No separate performance testing required. Preserve existing index concurrency and cache behavior.

## Bug Tracking
**How do we manage issues?**

- Any failing validation becomes an implementation task before final review.
