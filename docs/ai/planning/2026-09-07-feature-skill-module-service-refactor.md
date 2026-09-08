---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [x] Milestone 1: Move skill-domain helpers and service classes under `services/skill`.
- [x] Milestone 2: Replace `SkillManager` imports with `SkillService` and update command/service tests.
- [x] Milestone 3: Run focused skill tests, lint, and build.

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Create `services/skill` folder structure.
- [x] Task 1.2: Move validation, description, built-ins, registry source, and local registry helpers.
- [x] Task 1.3: Move `SkillRegistry`, `SkillIndex`, and installer behavior into service files.

### Phase 2: Core Features
- [x] Task 2.1: Implement `SkillService` as the public boundary.
- [x] Task 2.2: Update `commands/skill.ts`, setup service, install service, and related tests to import `SkillService`.
- [x] Task 2.3: Remove obsolete `lib/SkillManager.ts`, `lib/SkillRegistry.ts`, `lib/SkillIndex.ts`, `lib/BuiltinSkills.ts`, and skill-specific util files.

### Phase 3: Integration & Polish
- [x] Task 3.1: Update test file paths and mocks.
- [x] Task 3.2: Fix lint/type errors from moved imports.
- [x] Task 3.3: Run validation and review the diff.

## Progress Summary

Implementation moved the skill module into the agreed service-layer shape. The command layer now delegates registry workflows through `SkillService`, while registry cache/config behavior lives in `registry/skill-registry.service.ts`, install/list/remove behavior lives in `installer/skill-installer.service.ts`, and index persistence is split into `index/skill-index.repository.ts`.

## Dependencies
**What needs to happen in what order?**

- Move helpers before moving services so imports can be updated in a controlled order.
- Move service classes before command updates.
- Test updates depend on final source paths.

## Timeline & Estimates
**When will things be done?**

- Single-pairing-session refactor.
- Highest risk is test mock churn and ESM import path mistakes.

## Risks & Mitigation
**What could go wrong?**

- Risk: changing behavior while moving code.
  Mitigation: preserve method bodies first, then only make targeted orchestration edits.
- Risk: tests mock removed module paths.
  Mitigation: update mocks to new service paths and run focused tests.
- Risk: index repository split changes persistence behavior.
  Mitigation: keep read/write behavior equivalent and verify with existing skill tests.

## Resources Needed
**What do we need to succeed?**

- Existing Vitest coverage for command, manager, registry, and skill utilities.
- Package scripts: `npm --workspace packages/cli test`, `lint`, and `build`.
