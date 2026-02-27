---
phase: planning
title: Project Planning & Task Breakdown
description: Implement and validate project/global/default registry precedence
---

# Project Planning & Task Breakdown

## Milestones
- [x] Milestone 1: Define requirements and precedence contract.
- [x] Milestone 2: Implement registry source parsing and merge order.
- [x] Milestone 3: Add automated tests and validate feature docs.

## Task Breakdown
### Phase 1: Requirements & Design
- [x] Task 1.1: Confirm desired precedence (`project > global > default`).
- [x] Task 1.2: Define where project registry mappings are read from.

### Phase 2: Implementation
- [x] Task 2.1: Add `ConfigManager.getSkillRegistries()`.
- [x] Task 2.2: Update `SkillManager.fetchMergedRegistry()` merge order.

### Phase 3: Validation
- [x] Task 3.1: Add/adjust tests for project registry parsing.
- [x] Task 3.2: Add/adjust tests for precedence conflicts.
- [x] Task 3.3: Run focused CLI tests and feature lint.

## Dependencies
- Existing `ConfigManager` and `GlobalConfigManager` APIs.
- Existing `SkillManager` registry merge flow.

## Timeline & Estimates
- Implementation and tests: same working session.
- Validation: focused unit suite execution.

## Risks & Mitigation
- Risk: project config schema ambiguity.
- Mitigation: support both root and nested registry map formats and ignore invalid entries.

## Execution Log
- 2026-02-27: Ran focused tests for `ConfigManager` and `SkillManager` (73 passing).
- 2026-02-27: Ran `npx ai-devkit@latest lint --feature project-skill-registry-priority` (pass).
