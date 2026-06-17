---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
- [x] Milestone 1: Read-only memory data APIs
- [x] Milestone 2: Installable dashboard plugin command and local server
- [x] Milestone 3: Dashboard UI for browse, search, filters, grouping, detail, and graph
- [x] Milestone 4: Integration, browser smoke, and release readiness

## Task Breakdown

### Milestone 1: Read-Only Memory Data APIs
- [x] Task 1.1: Add list query types and exported result types to `@ai-devkit/memory`.
  - Outcome: `ListKnowledgeInput`, `ListKnowledgeResult`, `KnowledgeSummaryResult`, and graph-ready item types are available to the dashboard package.
  - Dependencies: Existing `KnowledgeItem`, `KnowledgeRow`, and command API exports.
  - Validation: Typecheck and memory package tests compile against the new exported types.
  - Related tests: Memory Read APIs list and empty database scenarios.
- [x] Task 1.2: Implement bounded `listKnowledge` read helper.
  - Outcome: Server-side memory list API supports optional text query, scope filter, tag filters, limit, offset, and sort.
  - Dependencies: Existing database connection, FTS query builder, row mapping, and schema.
  - Validation: Unit tests cover query, scope, tags, limit/offset, sort, and empty results.
  - Related tests: List returns item fields, query search, scope filter, tag filter, limit/offset.
- [x] Task 1.3: Implement `getKnowledgeSummary` read helper.
  - Outcome: Summary API returns total item count plus scope, tag, and recency buckets.
  - Dependencies: Task 1.1 and existing `knowledge` table shape.
  - Validation: Unit tests cover scope counts, tag counts, recency counts, no-tag rows, and empty database.
  - Related tests: Summary counts by scope, tag, recency bucket.
- [x] Task 1.4: Preserve existing memory command behavior.
  - Outcome: Existing `memory search/store/update` CLI and tests remain unchanged from the user's perspective.
  - Dependencies: Tasks 1.1-1.3.
  - Validation: Existing memory package tests and CLI memory command tests pass.
  - Related tests: Regression of adjacent features.

### Milestone 2: Plugin Package and Local Server
- [x] Task 2.1: Scaffold `packages/memory-dashboard` as `@ai-devkit/memory-dashboard`.
  - Outcome: Package has `package.json`, `project.json`, TypeScript config, build/test scripts, exports, files list, and an `aiDevkit.commands` manifest for `memory-dashboard`.
  - Dependencies: Existing monorepo workspace and plugin manifest contract.
  - Validation: Package builds and plugin manifest validation accepts the generated package after build.
  - Related tests: Package manifest declares `memory-dashboard` with a JavaScript entrypoint.
- [x] Task 2.2: Implement plugin command registration.
  - Outcome: `register(command, runtime)` wires `--host`, `--port`, and `--open`, resolves `runtime.getMemoryDbPath()`, starts the server, and prints the URL.
  - Dependencies: Task 2.1 and existing `AiDevkitRuntime`.
  - Validation: Commander unit tests verify command options, runtime memory path usage, and help output.
  - Related tests: Plugin command option parsing and `memory-dashboard --help`.
- [x] Task 2.3: Implement local HTTP server and routing.
  - Outcome: Server binds to `127.0.0.1` by default, serves static assets, and exposes `/api/memory`, `/api/summary`, and `/api/graph`.
  - Dependencies: Tasks 1.2, 1.3, and 2.2.
  - Validation: Server route unit tests cover success, invalid query parameters, shutdown, and JSON error responses.
  - Related tests: Dashboard Server endpoint scenarios.
- [x] Task 2.4: Implement graph response builder.
  - Outcome: API derives memory, tag, and scope nodes plus `has-tag` and `in-scope` edges from bounded filtered results.
  - Dependencies: Task 2.3 and list API result shape.
  - Validation: Unit tests cover no tags, high-cardinality tag limits, filtered graph results, and empty graph.
  - Related tests: `GET /api/graph` and graph-bound performance scenarios.

### Milestone 3: Dashboard UI
- [x] Task 3.1: Build static dashboard shell.
  - Outcome: Framework-free HTML/CSS/TypeScript UI with toolbar, filter panel, memory list/detail area, summary panel, and graph panel.
  - Dependencies: Task 2.3 static asset serving.
  - Validation: Server tests verify shell markup and assets; Playwright smoke confirmed the desktop dashboard renders without text overlap.
  - Related tests: Client initial load, empty state, desktop layout manual testing.
- [x] Task 3.2: Implement client data loading and URL state.
  - Outcome: Client fetches summary, memory list, and graph data; search/filter/grouping state survives refresh through URL query parameters.
  - Dependencies: Tasks 2.3 and 3.1.
  - Validation: Browser smoke covered search, scope filter, tag filter, and URL query state updates.
  - Related tests: Search input, scope filter, tag filter, integration API calls.
- [x] Task 3.3: Implement grouping and detail views.
  - Outcome: User can group by scope, tag, or recency and select an item to inspect full details.
  - Dependencies: Task 3.2.
  - Validation: Browser smoke covers grouping headers and selected item details.
  - Related tests: Grouping by scope/tag/recency and selecting memory item.
- [x] Task 3.4: Implement Cytoscape graph rendering and interactions.
  - Outcome: Graph view renders non-empty item, tag, and scope nodes from API data, with natural force-directed layout, zoom/fit/layout controls, selection highlighting/refocus, and graph memory-node detail rendering.
  - Dependencies: Task 2.4 and 3.2.
  - Validation: Server tests assert graph payload shape and memory item payloads; Playwright smoke verified Cytoscape canvas rendering, graph controls, off-page graph memory selection, and empty graph state for empty data.
  - Related tests: Graph renders nodes and edges from API data.

### Milestone 4: Integration and Release Readiness
- [x] Task 4.1: Add deterministic fixture memory database setup.
  - Outcome: Tests seed temporary memory databases with global/project/repo-style records and overlapping tags through `memoryStoreCommand`; a shared helper was not needed for the MVP test surface.
  - Dependencies: Memory package database helpers and Task 1 APIs.
  - Validation: Memory and dashboard integration tests create populated and empty databases deterministically, clean up SQLite sidecar files, and verify API behavior against seeded data.
  - Related tests: Test Data requirements.
- [x] Task 4.2: Add server integration tests.
  - Outcome: Integration tests start the dashboard server against fixture DBs and verify `/api/memory`, `/api/summary`, and `/api/graph`.
  - Dependencies: Tasks 2.3, 2.4, and 4.1.
  - Validation: Dashboard package integration test target passes.
  - Related tests: Integration Tests section.
- [x] Task 4.3: Add browser smoke coverage.
  - Outcome: Playwright or repo-available browser tooling validates launch, list rendering, search, tag filtering, grouping, and graph rendering.
  - Dependencies: Tasks 3.1-3.4 and 4.1.
  - Validation: Manual Playwright smoke passes locally against a seeded temporary DB; automated browser smoke can be added later if release gating needs it.
  - Related tests: End-to-End Tests section.
- [x] Task 4.4: Run package and feature verification.
  - Outcome: Relevant Nx build/test targets pass for memory, memory-dashboard, and affected CLI/plugin behavior.
  - Dependencies: All implementation tasks.
  - Validation: `npx ai-devkit@latest lint --feature memory-dashboard`, package builds, package tests, and relevant CLI tests pass.
  - Related tests: Test Reporting & Coverage and Manual Testing.
- [x] Task 4.5: Document manual smoke workflow.
  - Outcome: Implementation doc records how to run `ai-devkit memory-dashboard --help`, launch the dashboard, test empty/missing DB behavior, and inspect layout manually.
  - Dependencies: Task 4.4.
  - Validation: Manual checklist is executable and references real commands.
  - Related tests: Manual Testing section.

## Dependencies
- Task 1 APIs must land before server endpoints can avoid direct SQLite duplication.
- Package scaffold must land before command registration, server build output, and plugin manifest validation.
- Server endpoints must land before client data loading and graph rendering.
- Fixture helpers should be shared by memory API tests, server integration tests, and browser smoke tests.
- Browser smoke depends on a built or runnable dashboard package.

## Timeline & Estimates
- Milestone 1: medium, because query/filter/summary behavior touches existing memory internals and regression tests.
- Milestone 2: medium, because plugin packaging and long-running local server behavior need careful command tests.
- Milestone 3: medium-large, because the dashboard has several interactive states and responsive layout requirements.
- Milestone 4: medium, because integration and browser smoke tests need deterministic fixture data and process cleanup.

## Risks & Mitigation
| Risk | Impact | Mitigation |
|---|---|---|
| New memory list APIs regress existing search behavior | High | Keep existing search/store/update tests passing and isolate list helpers from command helpers. |
| Dashboard package duplicates memory database internals | Medium | Keep database reads in `@ai-devkit/memory` APIs and import those APIs from the server only. |
| Long-running server command hangs tests | Medium | Expose server creation/start helpers that tests can start and close explicitly. |
| Browser auto-open is brittle in agent/CI sessions | Low | Keep URL-only default and make `--open` opt-in. |
| Large memory databases make graph unusable | Medium | Bound list and graph endpoints; aggregate or cap graph nodes. |
| Static UI grows hard to maintain | Medium | Keep modules separated by API client, state, grouping, graph, and rendering. Revisit framework choice after MVP. |

## Resources Needed
- Existing `@ai-devkit/memory` package APIs, database schema, and test helpers.
- Existing CLI plugin manifest/runtime contract.
- Nx package build/test patterns from existing packages.
- Browser smoke tooling available in the repository or added in a minimal package-local way.
- Manual local browser validation after implementation.

## Coverage Matrix
| Testing scenario | Covered by tasks |
|---|---|
| Memory list fields/query/scope/tag/limit/offset | 1.1, 1.2, 4.4 |
| Summary by scope/tag/recency | 1.3, 4.2 |
| Empty database and missing database | 1.2, 1.3, 2.3, 3.1, 4.1, 4.2 |
| Plugin manifest and command options | 2.1, 2.2, 4.4 |
| Server routes and invalid parameters | 2.3, 4.2 |
| Graph data and graph rendering | 2.4, 3.4, 4.2, 4.3 |
| Search, filters, grouping, detail UI | 3.2, 3.3, 4.3 |
| Desktop layout and no text overlap | 3.1, 4.3, 4.5 |
| Existing memory CLI regression | 1.4, 4.4 |

## Follow-Up Checks
- Confirm whether `packages/memory-dashboard` should be published with the same release cadence as other first-party packages.
- Revisit edit/delete/merge workflows only after the read-only dashboard has passing smoke coverage.
- Revisit React/Vite or another UI framework only if static UI maintenance cost becomes visible during implementation.

## Phase 6 Planning Update
Implementation has completed the MVP task set: read-only memory APIs, plugin package/server, Tailwind static dashboard, Cytoscape graph, paginated records, graph-node detail rendering, package-local standalone dev script, integration tests, browser smoke, and lifecycle lint are in place. The original shared fixture-helper task was reconciled as deterministic inline fixture setup because the current tests can seed and clean temporary databases without introducing a separate abstraction. Current residual risks are release-readiness review items rather than open implementation tasks: confirm package publishing cadence, decide whether automated browser smoke should become a release gate, and review graph scalability beyond the 250-item default graph cap.

## Phase 8 Testing Update
Testing reconciliation is complete for the current MVP scope. The dashboard package now has 22 automated tests across command, standalone, and server behavior, including coverage for plugin options, browser-open success/failure handling, invalid ports, standalone config edge cases, static assets, paginated APIs, missing databases, graph memory payloads, invalid routes, invalid sorts, and the 250-item graph default. Coverage passes the configured threshold with branch coverage at 84.68%. Remaining checks are release/manual items: installed plugin command help, real default memory DB launch, browser launch against an empty or missing DB, and keyboard focus review.
