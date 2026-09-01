---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Active worktree: `.worktrees/feature-memory-package-refactor`.
- Branch: `feature-memory-package-refactor`.
- Bootstrap command: `npm ci`.
- Baseline build command: `npm run build`.
- Primary package: `packages/memory`.
- Downstream consumers to validate: `packages/cli` and `packages/memory-dashboard`.

## Code Structure
**How is the code organized?**

Target source structure:

```text
packages/memory/src/
  index.ts
  api.ts
  server.ts

  database/
    connection.ts
    schema.ts
    migrations/
    index.ts

  repositories/
    knowledge.repository.ts
    search.repository.ts
    semantic.repository.ts

  services/
    config.service.ts
    knowledge.service.ts
    search.service.ts
    semantic.service.ts

  domain/
    knowledge/
      types.ts
      normalize.ts
      validate.ts
      mapping.ts
      ranking.ts
      search-query.ts
      errors.ts

  semantic/
    model.ts
    embedder.ts
    embeddings.ts
```

Target test structure:

```text
packages/memory/tests/
  unit/
    domain/knowledge/
    repositories/
    semantic/
    services/
    facades/
  integration/
    database/
    services/
    facades/
```

Naming conventions:

- Repository files use `<area>.repository.ts`.
- Service files use `<area>.service.ts`.
- Domain files stay noun/verb focused: `types.ts`, `normalize.ts`, `validate.ts`, `mapping.ts`, `errors.ts`.
- Service-level configuration belongs in `services/config.service.ts`; semantic runtime files should only own model/cache/embed/vector behavior.
- Keep ESM `.js` import specifiers in TypeScript source.

Current implementation progress:

- `domain/knowledge/types.ts`, `errors.ts`, `normalize.ts`, and `validate.ts` now own the moved knowledge-domain primitives.
- `domain/knowledge/mapping.ts` centralizes `KnowledgeRow` to `KnowledgeItem` mapping and persisted tag JSON parsing.
- Before the service collapse, list and summary orchestration were updated to reuse domain mapping/parsing instead of carrying local duplicates.
- `services/config.service.ts` now owns service-level memory configuration, including the current semantic enablement flag.
- `semantic/model.ts`, `embedder.ts`, and `embeddings.ts` now own the optional semantic runtime and vector primitives.
- `repositories/knowledge.repository.ts` now owns knowledge insert/update lookup SQL plus list and summary row queries.
- `repositories/search.repository.ts` now owns strict FTS, broad FTS, and recent fallback SQL execution.
- `repositories/semantic.repository.ts` now owns embedding counts, eligible semantic row reads, backfill row reads, and embedding writes.
- `domain/knowledge/search-query.ts` and `ranking.ts` now own pure lexical query tokenization and ranking behavior.
- `services/knowledge.service.ts`, `search.service.ts`, and `semantic.service.ts` now own orchestration previously split across `handlers/*`.
- `api.ts` now preserves the public runtime exports while centralizing database lifecycle and CLI option-to-input mapping.
- `server.ts` now preserves MCP tool definitions and deprecated dotted aliases while delegating execution through a shared dispatch helper.
- The memory test tree now mirrors the new source layers, with facade compatibility tests separated from service workflow tests and repository SQL builder tests separated from domain query normalization tests.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Preserve `storeKnowledge`, `updateKnowledge`, `searchKnowledge`, `listKnowledge`, `getKnowledgeSummary`, and semantic exports by re-exporting from the new service files through `api.ts`.
- Store/update behavior must still validate first, normalize title/scope/tags/content, enforce duplicate title/content-in-scope rules, and wrap unknown storage failures as `StorageError`.
- Update must continue invalidating embeddings when title/content/tags change and no replacement embedding is provided; scope-only update retains embeddings.
- Lexical search must preserve strict FTS, broad fallback for multi-token misses, recent fallback for no searchable tokens, ranking, and limit clamping.
- Semantic search must continue running lexical first, then optional semantic scan/fusion, with lexical fallback for unavailable model/runtime or oversized corpus.

### Patterns & Best Practices
- Separate moves from logic simplification in commits/tasks where possible.
- Put SQL only in repositories.
- Put workflow policy only in services.
- Put pure knowledge rules and DTO mapping in `domain/knowledge`.
- Keep semantic runtime concerns out of `domain/knowledge`.
- Avoid classes unless the existing dependency (`DatabaseConnection`) already uses one or stateful runtime reuse requires it.
- Avoid repository interfaces until a second implementation exists.

## Integration Points
**How do pieces connect?**

- `index.ts` remains the binary guard and public barrel.
- `api.ts` remains the public command helper facade used by CLI, dashboard, and package consumers.
- `server.ts` remains the public MCP server facade and keeps tool definitions/aliases stable.
- `packages/cli/src/commands/memory.ts` should continue importing from `@ai-devkit/memory`.
- `packages/memory-dashboard/src/server.ts` should continue importing `memoryListCommand`, `memorySummaryCommand`, and `KnowledgeItem` from `@ai-devkit/memory`.
- `database/schema.ts` migration discovery must still work after build when SQL files live in `dist/database/migrations`.

Validation evidence:

- 2026-09-01: Task 2.1 full `@ai-devkit/memory` tests passed with 19 files and 158 tests.
- 2026-09-01: `npm --workspace @ai-devkit/memory run lint` exited 0.
- 2026-09-01: `npm --workspace @ai-devkit/memory run build` exited 0 and SWC compiled 23 files.
- 2026-09-01: Task 2.2 full `@ai-devkit/memory` tests passed with 20 files and 160 tests; lint and build exited 0.
- 2026-09-01: Task 3.1 full `@ai-devkit/memory` tests passed with 20 files and 160 tests; lint and build exited 0.
- 2026-09-01: Task 3.2 full `@ai-devkit/memory` tests passed with 20 files and 160 tests; lint and build exited 0.
- 2026-09-01: Task 3.3 full `@ai-devkit/memory` tests passed with 20 files and 160 tests; lint and build exited 0.
- 2026-09-01: Helper move validation passed for focused search/ranking tests with 3 files and 30 tests; typecheck exited 0.
- 2026-09-01: Task 4.1 full `@ai-devkit/memory` tests passed with 20 files and 160 tests; lint and build exited 0.
- 2026-09-01: Task 4.2 memory API/public compatibility tests passed with 2 files and 3 tests; CLI memory command tests passed with 14 tests.
- 2026-09-01: Task 4.3 server/public/API compatibility tests passed with 3 files and 8 tests.
- 2026-09-01: Task 5.2 memory-dashboard server tests passed with 8 tests.
- 2026-09-01: Final `npm run build` passed for 6 projects: channel-connector, memory-dashboard, agent-manager, task-manager, memory, and cli.
- 2026-09-01: Built package import check confirmed `@ai-devkit/memory` and `@ai-devkit/memory/api` expose the same public runtime keys.
- 2026-09-01: Integration test cleanup removed direct store/update/search implementation clones from store, update, and search integration tests; focused integration tests passed with 3 files and 37 tests.
- 2026-09-01: Test tree restructure validation passed for all moved unit and integration paths with 21 files and 160 tests.

## Error Handling
**How do we handle failures?**

- Keep existing `KnowledgeMemoryError` JSON shape and subclasses.
- Validation failures remain `ValidationError`.
- Duplicate title/content failures remain `DuplicateError` with existing details.
- Missing update target remains `NotFoundError`.
- Unknown store/update database failures remain `StorageError`.
- Semantic search failures return lexical results with `retrievalMode: 'lexical'` and semantic status `unavailable` or `corpus-too-large`.
- Corrupt semantic rows are skipped from semantic candidates while lexical search remains available.

## Performance Considerations
**How do we keep it fast?**

- Do not add extra full-table scans to hot store/search/update paths.
- Preserve SQLite pragmas: WAL, foreign keys, synchronous normal, busy timeout, mmap size.
- Preserve semantic embedder memoization.
- Preserve semantic corpus cap and batched reembed behavior.
- Keep row mapping linear and local; avoid JSON parsing tags more than needed per result row.

## Security Notes
**What security measures are in place?**

- Preserve input validation constraints for title, content, tags, scope, search query, list limits, and offsets.
- Preserve checksum and byte-size verification for semantic model downloads.
- Preserve atomic temp-file write and rename for downloaded model files.
- Do not introduce new network calls.
- Do not log memory content, paths, or raw model data beyond existing behavior.
