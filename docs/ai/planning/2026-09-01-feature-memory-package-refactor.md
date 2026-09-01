---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [x] Milestone 1: Baseline and domain extraction complete.
- [x] Milestone 2: Repository layer extracted and services own orchestration.
- [x] Milestone 3: Facades preserved, tests migrated, consumer validation green.
- [x] Milestone 4: Test tree mirrors the new source layers.

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Baseline and Compatibility Harness
- [x] Task 1.1: Record fresh baseline for `@ai-devkit/memory` typecheck, lint, tests, and build.
  - Outcome: known-good starting point before moves.
  - Validation: `npm --workspace @ai-devkit/memory run typecheck`, `npm --workspace @ai-devkit/memory run lint`, `npm --workspace @ai-devkit/memory test`, `npm --workspace @ai-devkit/memory run build`.
  - Evidence: all four commands exited 0 on 2026-09-01; memory tests passed with 18 files and 156 tests.
- [x] Task 1.2: Add or identify public compatibility tests for root exports, `./api`, MCP tool names/aliases, and command helpers.
  - Outcome: public contracts are pinned before internal movement.
  - Validation: focused memory API/server tests.
  - Evidence: added `packages/memory/tests/unit/facades/public-api.test.ts`; focused public compatibility/API/server suite passed with 3 files and 8 tests.

### Phase 2: Domain and Semantic Primitive Moves
- [x] Task 2.1: Move knowledge types, errors, normalization, validation, and mapping into `domain/knowledge/`.
  - Outcome: shared domain rules have a single home.
  - Dependencies: Task 1.1.
  - Validation: unit tests for normalizer, validator, mapping, errors; package typecheck.
  - Evidence: moved types/errors/normalization/validation into `domain/knowledge`, added shared mapping, and verified full memory tests/lint/build.
- [x] Task 2.2: Move semantic primitives into `semantic/` while preserving behavior.
  - Outcome: model/cache/embed/vector code is separate from knowledge domain and services.
  - Dependencies: Task 2.1 if shared types move first.
  - Validation: semantic/model/embedder unit tests and semantic integration tests.
  - Evidence: moved config/model/embedder/embedding helpers into `src/semantic`; semantic focused tests, full memory tests, lint, and build passed.

### Phase 3: Repository Extraction
- [x] Task 3.1: Extract knowledge CRUD/list/summary SQL into `repositories/knowledge.repository.ts`.
  - Outcome: `knowledge.service.ts` can orchestrate without inline SQL.
  - Validation: store/update/list/summary integration tests.
  - Evidence: added `repositories/knowledge.repository.ts`; store/update/list/summary focused tests, full memory tests, lint, and build passed.
- [x] Task 3.2: Extract lexical search SQL into `repositories/search.repository.ts`.
  - Outcome: FTS strict/broad/recent query execution is storage-owned.
  - Validation: search unit and integration tests.
  - Evidence: added `repositories/search.repository.ts`; focused search tests, full memory tests, lint, and build passed.
- [x] Task 3.3: Extract semantic row/count/embedding SQL into `repositories/semantic.repository.ts`.
  - Outcome: semantic service no longer reads raw SQL directly.
  - Validation: semantic-search and semantic-storage integration tests.
  - Evidence: added `repositories/semantic.repository.ts`; focused semantic tests, full memory tests, lint, and build passed.

### Phase 4: Service Layer and Facades
- [x] Task 4.1: Rename/refactor handlers into `services/knowledge.service.ts`, `services/search.service.ts`, and `services/semantic.service.ts`.
  - Outcome: business workflows are organized by layer and responsibility.
  - Validation: package test suite.
  - Evidence: removed `src/handlers/*`, added the three service files, verified focused API/search/semantic/store/update tests, then full memory tests/lint/build.
- [x] Task 4.2: Thin `api.ts` into a command facade with shared option mapping and database lifecycle helper.
  - Outcome: public command helpers stay stable while duplicated open/close/options logic shrinks.
  - Validation: memory API integration tests and CLI memory command tests.
  - Evidence: `api.ts` now uses shared database lifecycle and option mapping helpers; memory API/public tests and CLI memory command tests passed.
- [x] Task 4.3: Thin `server.ts` into an MCP facade that delegates to services while preserving tool definitions and aliases.
  - Outcome: MCP behavior remains stable with less routing complexity.
  - Validation: server unit tests and MCP tool list/call behavior tests.
  - Evidence: `server.ts` now uses shared tool dispatch/response formatting; server/public/API compatibility tests passed.

### Phase 5: Test Cleanup and Consumer Validation
- [x] Task 5.1: Migrate internal test imports from old `handlers/` and `services/` paths to the new layer paths.
  - Outcome: tests document the new architecture instead of relying on compatibility shims.
  - Validation: full `@ai-devkit/memory` test suite.
  - Evidence: test imports now point to `domain/knowledge`, `semantic`, `repositories`, and `services`; full memory tests passed with 21 files and 160 tests after splitting repository query-builder coverage into its own unit test file.
- [x] Task 5.4: Restructure the memory test tree to mirror the new source layers.
  - Outcome: unit tests are grouped under `domain/knowledge`, `repositories`, `semantic`, `services`, and `facades`; integration tests are grouped under `database`, `services`, and `facades`.
  - Validation: full `@ai-devkit/memory` test suite.
  - Evidence: focused moved-path test command passed with 21 files and 160 tests.
- [x] Task 5.2: Run focused downstream consumer checks.
  - Outcome: CLI and dashboard consumers still work through public package APIs.
  - Validation: CLI memory command tests and memory-dashboard server tests.
  - Evidence: `npm --workspace ai-devkit test -- src/__tests__/commands/memory.test.ts` passed with 14 tests; `npm --workspace @ai-devkit/memory-dashboard test -- tests/server.test.ts` passed with 8 tests.
- [x] Task 5.3: Remove obsolete files, temporary re-exports, and stale generated output from the feature diff.
  - Outcome: no duplicate implementation paths remain.
  - Validation: `rg "handlers/|services/normalizer|services/semantic"` confirms no stale imports except intentional docs/history; final build.
  - Evidence: source tree has no `src/handlers` files; old mixed-purpose service files are deleted; `npm run build` passed for all 6 projects.

## Dependencies
**What needs to happen in what order?**

- Baseline compatibility tests must precede broad file moves.
- Domain moves should precede service/repository extraction because most layers depend on shared types/mapping/errors.
- Repository extraction should precede service renaming so service files can be small and policy-focused.
- Consumer checks must run after facades are stable.
- Generated `dist/` should be refreshed only after source structure is final for the slice being validated.

## Timeline & Estimates
**When will things be done?**

- Phase 1: small, one focused pass.
- Phase 2: medium, mostly imports and test updates.
- Phase 3: highest risk because SQL boundaries and row mapping move.
- Phase 4: medium, public compatibility sensitive.
- Phase 5: medium, mostly tests and validation.

## Risks & Mitigation
**What could go wrong?**

- Risk: file moves mask behavioral changes.
  - Mitigation: move in slices and run focused tests after each slice.
- Risk: public exports break while internal tests still pass.
  - Mitigation: add/retain root API compatibility tests before moving internals.
- Risk: repositories become arbitrary buckets.
  - Mitigation: repositories own SQL only; services own orchestration and policy.
- Risk: services become pass-through wrappers.
  - Mitigation: only keep service functions that own validation, normalization, fallback, lifecycle decisions, or result assembly.
- Risk: semantic code leaks into domain.
  - Mitigation: keep model/cache/embedder/vector operations under `semantic/`; only public semantic result types live with knowledge types.
- Risk: changing database lifecycle during refactor causes hidden test failures.
  - Mitigation: preserve the singleton and `closeDatabase()` behavior in this feature.

## Resources Needed
**What do we need to succeed?**

- Existing memory package tests.
- Focused CLI memory command tests.
- Focused memory-dashboard server tests.
- Build/typecheck/lint commands from package manifests.
- Existing design notes for memory FTS, WAL concurrency, dashboard, and semantic search as behavioral references.
