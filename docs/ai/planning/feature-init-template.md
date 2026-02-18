---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [x] Milestone 1: Template requirements + schema/design approved
- [x] Milestone 2: `init --template` core flow implemented
- [x] Milestone 3: Skill auto-install integration + tests/documentation complete

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Audit current `init` flow and identify integration point for `--template`
- [x] Task 1.2: Define template schema for `environments`, `skills`, and `phases`
- [x] Task 1.3: Add template loader/parser with path + format handling
- [x] Task 1.4: Add validation and user-friendly error formatting

### Phase 2: Core Features
- [x] Task 2.1: Add `--template <path>` CLI option to `init`
- [x] Task 2.2: Implement template-driven value resolution into init config
- [x] Task 2.3: Add fallback prompts for missing required values
- [x] Task 2.4: Add execution summary output for applied template fields

### Phase 3: Integration & Polish
- [x] Task 3.1: Implement skill-install bridge that invokes existing `skill add` logic
- [x] Task 3.2: Add handling for duplicate/already-installed skills
- [x] Task 3.3: Implement continue-on-error/fail-fast policy based on decided behavior
- [x] Task 3.4: Update CLI help/docs with template examples

### Phase 4: Validation
- [x] Task 4.1: Unit tests for parser/validator/config resolver
- [x] Task 4.2: Integration tests for `init --template` end-to-end flow
- [x] Task 4.3: Integration tests for skill install success/failure matrix
- [x] Task 4.4: Regression tests for existing interactive init behavior

## Dependencies
**What needs to happen in what order?**

- Task dependencies and blockers
  - Schema and validation must land before template-driven apply logic.
  - Skill bridge implementation depends on stable callable interface from existing skill-add module.
  - Error/report format should be agreed before writing integration tests.
- External dependencies (APIs, services, etc.)
  - Potential registry/network dependency via skill install path.
- Team/resource dependencies
  - CLI maintainer for `init` command.
  - Reviewer familiar with skill installation internals.

## Timeline & Estimates
**When will things be done?**

- Estimated effort per task/phase
  - Phase 1: 0.5-1 day
  - Phase 2: 1-1.5 days
  - Phase 3: 0.5-1 day
  - Phase 4: 1 day
- Target dates for milestones
  - Milestone 1: Day 1
  - Milestone 2: Day 2
  - Milestone 3: Day 3
- Buffer for unknowns
  - +20% for schema evolution and skill-install edge cases

## Risks & Mitigation
**What could go wrong?**

- Technical risks
  - Skill-add integration may not expose reusable programmatic interface.
  - Template schema ambiguity could produce inconsistent behavior.
- Resource risks
  - Limited test fixtures for different skill registry/availability states.
- Dependency risks
  - Registry/network instability during skill installation tests.
- Mitigation strategies
  - Introduce thin adapter around skill-install logic with explicit contract.
  - Lock schema with versioned docs and validation tests.
  - Use mockable installation layer for deterministic tests.

## Resources Needed
**What do we need to succeed?**

- Team members and roles
  - CLI implementer and reviewer.
- Tools and services
  - Existing TypeScript test runner and mocking utilities.
- Infrastructure
  - CI job for integration tests covering template mode.
- Documentation/knowledge
  - Existing init/skill command architecture references.

## Progress Summary

Feature implementation is complete for template-driven init, including YAML/JSON parsing, relative/absolute template path resolution, template-based environments/phases resolution, and skill auto-install via existing skill-add logic. Duplicate `registry+skill` entries are skipped with warnings, and per-skill failures continue with warning output while preserving exit code `0`. Validation coverage includes parser/validator unit tests and command-level behavior tests for template flow, failure matrix, and interactive regression.

## Next Focus

- Confirm desired behavior for future lock/manifest output (currently out of scope).
- Run full workspace test/lint pipelines before release cut.
- Proceed to implementation check and final code review.
