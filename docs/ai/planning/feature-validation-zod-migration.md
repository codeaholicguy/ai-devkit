---
phase: planning
title: Validation Migration to Zod - Planning
description: Task plan for migrating custom validators to Zod schemas
---

# Planning: Validation Migration to Zod

## Milestones

- [ ] Milestone 1: Introduce Zod dependency and schema scaffolding
- [ ] Milestone 2: Migrate memory validation paths to Zod
- [ ] Milestone 3: Complete tests and regression verification

## Task Breakdown

### Phase 1: Foundation

- [ ] Task 1.1: Add `zod` dependency to `packages/memory/package.json`
- [ ] Task 1.2: Create/extend validation schema module with shared constraints and helper formatters

### Phase 2: Core Migration

- [ ] Task 2.1: Refactor `validateTitle`, `validateContent`, `validateTags`, `validateScope` to schema-based parsing
- [ ] Task 2.2: Refactor `validateStoreInput` and `validateUpdateInput` to use schema wrappers
- [ ] Task 2.3: Replace inline search input validation in `packages/memory/src/handlers/search.ts` with schema-based validation

### Phase 3: Tests & Validation

- [ ] Task 3.1: Update unit tests for validator behavior parity
- [ ] Task 3.2: Update integration tests for store/update/search invalid input scenarios
- [ ] Task 3.3: Run package and workspace tests; fix regressions

## Dependencies

- Task 1.1 precedes all migration tasks.
- Task 1.2 precedes Tasks 2.1-2.3.
- Tasks 2.1-2.3 should complete before Tasks 3.1-3.3.

## Timeline & Estimates

- Phase 1: 0.5 day
- Phase 2: 1-1.5 days
- Phase 3: 0.5-1 day
- Total estimate: 2-3 days including regression fixes

## Risks & Mitigation

- Risk: Error message text changes may break strict tests.
  - Mitigation: Add error adapter and update tests intentionally where text differences are acceptable.
- Risk: Partial update validation semantics may shift.
  - Mitigation: Keep explicit tests for "at least one field" and optional field validation.
- Risk: Scope creep to all validators in repo.
  - Mitigation: Lock this feature to memory package first; track CLI util migration separately if needed.

## Resources Needed

- Existing memory validation tests as baseline
- Zod documentation for schema composition and custom refinements
- Reviewer pass focused on behavioral parity
