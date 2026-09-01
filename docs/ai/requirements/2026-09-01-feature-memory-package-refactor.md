---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

`packages/memory` has grown from a small MCP memory server into a package with multiple public entrypoints, direct CLI/dashboard consumers, SQLite migrations, lexical search, optional semantic embeddings, and a substantial test suite. The current `handlers/` and `services/` split no longer communicates ownership clearly:

- Handlers mix orchestration, validation, SQL, row mapping, storage error handling, and semantic fallback.
- `services/` mixes unrelated concerns: normalization, validation, FTS query builders, ranking, semantic model cache, embedder runtime, and config.
- Store/update duplicate normalization and duplicate-check policy.
- Several modules parse persisted tag JSON independently.
- Tests import internal paths directly, so file moves need a deliberate compatibility and cleanup plan.

The affected users are maintainers and future agents working on memory storage, search, semantic retrieval, dashboard data access, and CLI/MCP integration. The current workaround is to inspect many files before each change and rely on test coverage to catch boundary mistakes.

## Goals & Objectives
**What do we want to achieve?**

- Restructure `packages/memory/src` into a clear layered internal architecture:
  - `database/` for SQLite connection, schema, and migrations.
  - `repositories/` for SQL and persisted-row access.
  - `services/` for business workflows and orchestration.
  - `domain/knowledge/` for knowledge types, validation, normalization, mapping, and errors.
  - `semantic/` for optional model/cache/embed/vector primitives.
- Preserve external backward compatibility for published consumers:
  - Keep package exports `.` and `./api` stable.
  - Keep `src/index.ts`, `src/api.ts`, and `src/server.ts` as public-facing facades.
  - Preserve MCP tool names and deprecated dotted aliases.
  - Preserve CLI command helper names and result/input types.
  - Preserve SQLite schema behavior, migrations, default DB path, and database lifecycle.
- Improve maintainability by reducing mixed concerns and duplicated mapping/normalization/parsing code.
- Rework tests so they validate public and layer boundaries without depending on obsolete folders.
- Execute in small stages, validating after each stage, rather than one large move.

Non-goals:

- No behavioral redesign of memory store/search/update/list/summary.
- No database schema changes beyond moving migration files with identical content.
- No change to ranking formula, semantic RRF behavior, model identity, model cache location, or fail-open semantic fallback.
- No change to CLI UX, MCP protocol behavior, or dashboard API behavior.
- No introduction of abstract repository interfaces until a second implementation exists.
- No cleanup of unrelated packages except required consumer test updates.

## User Stories & Use Cases
**How will users interact with the solution?**

- As a maintainer, I want SQL isolated in repositories so storage changes do not require scanning service and MCP adapter code.
- As a maintainer, I want validation, normalization, and row mapping centralized so store/update/list/search behavior stays consistent.
- As a contributor, I want semantic model/cache/runtime code separate from knowledge-domain rules so optional semantic search can evolve independently.
- As an AI coding agent, I want an obvious dependency direction so future changes can be scoped and verified without repeatedly remapping the package.
- As a CLI/dashboard/MCP consumer, I want the same external API and runtime behavior after the refactor.

Edge cases to preserve:

- Duplicate detection by normalized title and content hash within scope.
- FTS strict search, broad fallback, and recent fallback.
- Scope and context-tag boosting.
- List filters, sorting, limits, offsets, and summary aggregation.
- Semantic corpus cap, corrupt-row skip, dimension checks, unavailable-model fallback, and embedding invalidation on title/content/tag updates.
- Database singleton reset via `closeDatabase()` for tests and command wrappers.
- Migration discovery after build from `dist/database/migrations`.

## Success Criteria
**How will we know when we're done?**

- The final source tree matches the agreed layered direction without obsolete `handlers/` or mixed-purpose `services/` modules.
- Public package exports remain unchanged in `packages/memory/package.json`.
- Public root facades continue exporting the same command helpers, server functions, types, and behavior.
- Internal tests are updated to target the new layer boundaries and avoid stale path assumptions.
- Consumer checks pass for at least:
  - `@ai-devkit/memory`
  - `ai-devkit` memory command tests
  - `@ai-devkit/memory-dashboard` server tests
- Validation commands pass:
  - `npm --workspace @ai-devkit/memory run typecheck`
  - `npm --workspace @ai-devkit/memory run lint`
  - `npm --workspace @ai-devkit/memory test`
  - focused CLI memory command tests
  - focused memory-dashboard tests
  - final workspace build

## Constraints & Assumptions
**What limitations do we need to work within?**

- The package is TypeScript ESM and builds with SWC plus `tsc --emitDeclarationOnly`.
- Source imports must keep NodeNext-compatible `.js` specifiers.
- Migrations must still be copied into `dist/database/` by the package build.
- Existing untracked files in the main worktree are unrelated and must not be touched.
- Refactor work happens on branch/worktree `feature-memory-package-refactor`.
- Behavior changes discovered as useful during refactor are deferred unless required to preserve existing tests.
- The user has explicitly approved continuing through lifecycle phases without stopping for approval, with final review before pushing.

## Questions & Open Items
**What do we still need to clarify?**

- No blocking product questions remain for requirements.
- Open implementation choice: whether to keep temporary compatibility re-exports for old internal test paths during the transition or migrate tests in the same slices. Preferred assumption: migrate tests with each slice and only add re-exports when they reduce risk.
