---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Preserve existing `@ai-devkit/memory` behavioral coverage while migrating tests to new layer paths.
- Add compatibility coverage where public exports or facades are at risk.
- Keep focused tests for pure domain/search/semantic primitives.
- Keep integration tests for SQLite behavior, migrations, FTS, store/update/list/summary, and semantic storage/search.
- Integration tests should exercise real services or public command helpers; avoid direct copies of production store/update/search workflows in test-local helpers.
- Keep test directories aligned with the source layers so test ownership follows `domain/knowledge`, `repositories`, `semantic`, `services`, `database`, and `facades`.
- Validate downstream CLI and memory-dashboard consumers before final review.

## Unit Tests
**What individual components need testing?**

### `domain/knowledge`
- [x] Validate title/content/tag/scope rules match current error messages.
- [x] Normalize title/content/tags/scope exactly as before.
- [x] Map persisted rows to `KnowledgeItem` and parse malformed tag JSON safely.
- [x] Preserve `KnowledgeMemoryError.toJSON()` and subclass details.

### `domain/knowledge/search-query` and `repositories/search.repository`
- [x] Normalize search tokens with stopword removal and duplicate removal.
- [x] Build strict, broad, and recent fallback FTS SQL/query objects.
- [x] Rank BM25 rows with tag and scope boosts.

### `semantic`
- [x] Inspect model manifest readiness, missing files, and corrupt files.
- [x] Normalize embeddings and reject invalid vectors.
- [x] Mean-pool ONNX output using the attention mask.
- [x] Serialize/deserialize 384-dimension embeddings.
- [x] Fuse lexical and semantic results with deterministic RRF ordering and optional explanations.

### Facades
- [x] `api.ts` exports all existing command helpers and public types.
- [x] `server.ts` lists the same MCP tools and accepts deprecated dotted aliases.
- [x] `services/config.service.ts` preserves semantic config parsing defaults and enables future service-level config growth.

## Integration Tests
**How do we test component interactions?**

- [x] Store creates rows with normalized fields, JSON tags, content hash, timestamps, FTS synchronization, and duplicate protection.
- [x] Update changes only provided fields, recalculates normalized fields/hashes, detects duplicates, preserves created timestamp, updates updated timestamp, and handles not-found.
- [x] Search covers strict FTS, broad fallback, recent fallback, scope filtering, tag boosting, and limit handling.
- [x] List covers query/scope/tag filters, sorting, limits, offsets, total count, and mapping.
- [x] Summary covers scope counts, tag counts, and recency buckets.
- [x] Database connection covers default/custom path, WAL/busy timeout behavior, migration initialization, reset, and close/reset lifecycle.
- [x] Semantic storage covers migration columns, semantic store/update fallback, embedding invalidation, and scope-only embedding preservation.
- [x] Semantic search covers hybrid retrieval, unavailable model fallback, corrupt-row skip, corpus cap, reembed batching, and deterministic ranking.

## End-to-End Tests
**What user flows need validation?**

- [x] CLI `memory store`, `memory update`, `memory search`, `memory semantic status`, and `memory reembed` continue calling the public memory package helpers correctly.
- [x] Memory dashboard read endpoints continue loading memory items and summaries through `@ai-devkit/memory` public APIs.
- [x] Built package can be imported from `@ai-devkit/memory` and `@ai-devkit/memory/api`.
- [ ] `ai-devkit-memory` binary still starts the MCP server when run directly and does not start when imported.

## Test Data
**What data do we use for testing?**

- Temporary SQLite databases under the OS temp directory.
- Existing deterministic fixed-vector fake embedders for semantic tests.
- Seeded memories covering global/project/repo scopes, overlapping tags, duplicate titles/content, malformed legacy tags, and stale/missing embeddings.
- No real semantic model download in normal tests unless explicitly testing model cache download behavior with mocked fetch.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

Required commands:

- [x] `npm --workspace @ai-devkit/memory run typecheck`
- [x] `npm --workspace @ai-devkit/memory run lint`
- [x] `npm --workspace @ai-devkit/memory test`
- [x] `npm --workspace @ai-devkit/memory run build`
- [x] `npm --workspace ai-devkit test -- src/__tests__/commands/memory.test.ts`
- [x] `npm --workspace @ai-devkit/memory-dashboard test -- tests/server.test.ts`
- [x] `npm run build`

Latest evidence:

- 2026-09-01: `npm --workspace @ai-devkit/memory test -- tests/unit/domain/knowledge tests/unit/repositories tests/unit/services tests/unit/semantic tests/unit/facades tests/integration/database tests/integration/services tests/integration/facades` passed with 21 files and 160 tests after restructuring the test tree to mirror source layers.
- 2026-09-01: `npm --workspace @ai-devkit/memory test` passed with 21 files and 160 tests.
- 2026-09-01: `npm --workspace @ai-devkit/memory run lint` exited 0.
- 2026-09-01: `npm --workspace @ai-devkit/memory run build` exited 0.
- 2026-09-01: `npm --workspace ai-devkit test -- src/__tests__/commands/memory.test.ts` passed with 1 file and 14 tests.
- 2026-09-01: `npm --workspace @ai-devkit/memory-dashboard test -- tests/server.test.ts` passed with 1 file and 8 tests.
- 2026-09-01: `npm run build` passed for all 6 Nx projects.
- 2026-09-01: `node -e` import check for `@ai-devkit/memory` and `@ai-devkit/memory/api` returned matching public runtime keys.
- 2026-09-01: `npm --workspace @ai-devkit/memory test -- tests/integration/services/knowledge-store.test.ts tests/integration/services/knowledge-update.test.ts tests/integration/services/knowledge-search.test.ts` passed with 3 files and 37 tests after replacing direct test-local implementation clones with real service calls.
- 2026-09-01: `rg "storeKnowledgeDirect|updateKnowledgeDirect|searchKnowledgeDirect" packages/memory/tests/integration -n` returned no matches.

Record fresh output and exit codes in this document during Phase 8.

## Manual Testing
**What requires human validation?**

- Final code review of the new tree shape and public compatibility facades before push.
- No UI/browser testing is required for this internal package refactor.

## Performance Testing
**How do we validate performance?**

- No new benchmark requirement for this structural refactor.
- If repository extraction changes search query count or semantic scan behavior, rerun the existing memory benchmark:
  - `npm --workspace @ai-devkit/memory run benchmark`

## Bug Tracking
**How do we manage issues?**

- Track discovered blockers in the `memory-package-refactor` task.
- Add planning tasks for any new compatibility or test gaps discovered during implementation.
- Do not fold unrelated cleanup into this feature.
