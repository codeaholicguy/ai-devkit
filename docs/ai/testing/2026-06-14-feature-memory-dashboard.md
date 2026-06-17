---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
- Unit test coverage target: 100% of new memory read helpers and dashboard server route logic.
- Integration coverage: plugin command registration, local server startup, API responses from a fixture memory database.
- Browser smoke coverage: dashboard renders the desktop workbench, filters, grouping, paginated records, detail panel, and graph from seeded data.
- Manual coverage: accessibility, desktop layout, graph controls, and command help output.

## Unit Tests

### Memory Read APIs
- [x] List returns memory items with id, title, content, tags, scope, createdAt, and updatedAt.
- [x] List supports query search without breaking existing search ranking behavior.
- [x] List filters by scope.
- [x] List filters by one or more tags.
- [x] List enforces limit and offset bounds.
- [x] Summary counts items by scope.
- [x] Summary counts items by tag.
- [x] Summary counts items by recency bucket.
- [x] Empty database returns empty item, facet, and graph-ready results.

### Dashboard Server
- [x] Server binds to `127.0.0.1` by default.
- [x] `GET /` serves dashboard HTML.
- [x] `GET /api/memory` returns filtered list results.
- [x] `GET /api/summary` returns scope, tag, and recency counts.
- [x] `GET /api/graph` returns memory, tag, and scope nodes with edges.
- [x] Invalid query parameters return a clear error response.
- [x] Server shutdown closes resources.
- [x] Missing memory database path returns empty memory, summary, and graph payloads.

### Plugin Command
- [x] Package manifest declares `memory-dashboard` with a JavaScript entrypoint.
- [x] `register(command, runtime)` wires options and action without conflicting with built-ins.
- [x] Command uses `runtime.getMemoryDbPath()` rather than hard-coding `~/.ai-devkit/memory.db`.
- [x] `--host`, `--port`, and `--open` are parsed correctly.
- [x] `memory-dashboard --help` includes host, port, and open options.
- [x] Package-local `npm run dev:standalone -- --help` launches the standalone entrypoint without requiring plugin installation.

### Client UI
- [x] Initial load renders summary stats and memory rows.
- [x] Search input updates the memory list.
- [x] Scope filter updates the memory list.
- [x] Tag filter updates the memory list.
- [x] Grouping by scope, tag, and recency produces stable sections.
- [x] Selecting a memory item shows full details.
- [x] Graph renders nodes and edges from API data through Cytoscape canvas output.
- [x] Graph Fit, Zoom In, Zoom Out, and Layout controls run without console errors or warnings.
- [x] Selecting a memory row synchronizes the graph header, detail panel, selected row state, and selected-neighborhood graph refocus.
- [x] Selecting a graph memory node renders that memory detail, including when the node is not on the current list page.
- [x] List pagination limits visible rows to 4 and persists page state in the URL.
- [x] Empty state is visible and does not overlap controls.

## Integration Tests
- [x] Start the dashboard server with a temporary seeded SQLite memory database.
- [x] Fetch `/api/memory` and verify seeded records are returned.
- [x] Fetch `/api/summary` and verify scope/tag counts.
- [x] Fetch `/api/graph` and verify item/tag/scope relationships.
- [x] Register the plugin command with a Commander instance and verify `memory-dashboard --help` output.

## End-to-End Tests
- [x] Launch dashboard against a fixture database.
- [x] Load the dashboard in Playwright.
- [x] Search for a seeded memory title and verify the list narrows.
- [x] Filter by tag and verify only matching seeded records remain.
- [x] Switch grouping mode and verify group headers render.
- [x] Verify graph canvas contains non-empty rendered nodes.
- [x] Verify desktop Cytoscape graph layout fits the graph viewport and supports zoom controls.
- [x] Verify paginated list navigation advances records without requiring list scrolling.
- [x] Verify desktop first fold contains search/filter controls, records rail, graph, and selected memory detail.

## Test Data
- Fixture memory database with at least:
  - one `global` memory
  - one `project:<name>` memory
  - one `repo:<org/repo>` memory
  - overlapping tags across multiple records
  - records with different created/updated timestamps for recency grouping
- Empty database fixture.
- Invalid query parameter cases for API error behavior.

## Test Reporting & Coverage
- [x] Run package-level tests for `@ai-devkit/memory`.
- [x] Run package-level tests for `@ai-devkit/memory-dashboard`.
- [x] Run `npx ai-devkit@latest lint --feature memory-dashboard` before leaving lifecycle phases.
- [x] Run the relevant package build/test targets once implementation exists.
- [x] Run package build after Tailwind/Cytoscape changes and verify generated `dist/ui` assets.

## Manual Testing
- [ ] Run `ai-devkit memory-dashboard --help`.
- [x] Run `npm run dev:standalone -- --help` from `packages/memory-dashboard`.
- [ ] Run dashboard with the default memory DB path.
- [ ] Run dashboard with an empty or missing memory DB path.
- [x] Verify the dashboard is usable in the desktop viewport targeted by this plugin.
- [x] Verify interactive graph Fit/Zoom/Layout controls and list-to-graph selection refocus.
- [ ] Verify keyboard focus reaches search, filters, memory rows, and graph controls.
- [x] Verify no text overlaps in the dashboard layout.

## Performance Testing
- [ ] Seed at least 1,000 memory items and confirm the initial list remains responsive.
- [ ] Confirm API default limits prevent loading the full database into the browser.
- [x] Confirm graph rendering remains bounded by the 250-item default graph limit.

## Phase 8 Test Execution
- `npx ai-devkit@latest lint --feature memory-dashboard` validated the feature docs and worktree state before test reconciliation.
- `packages/memory-dashboard/tests/server.test.ts` now covers the split HTML/Tailwind/JS assets, paginated API responses, missing database handling, favicon behavior, graph node payloads for selected memory detail, and the 250-item graph default.
- `packages/memory-dashboard/tests/command.test.ts` covers plugin command registration, host/port/open options, browser-open success/failure handling, runtime memory DB path resolution, and help output.
- `packages/memory-dashboard/tests/standalone.test.ts` covers package-local standalone path resolution, `--db-path`, and option parsing.
- `packages/memory/tests/integration/list.test.ts` and `packages/memory/tests/integration/summary.test.ts` cover the read-only memory APIs used by the dashboard.
- Current automated dashboard package result: 3 test files, 22 tests.
- Current dashboard coverage result: statements 90.47%, branches 84.68%, functions 83.72%, lines 90.47%; coverage thresholds pass.
- Remaining manual checks before release: run the installed plugin command help, run against the default real memory DB path, run against an empty/missing DB from the browser, and verify keyboard focus through controls and rows.

## Bug Tracking
- Track implementation issues in the feature planning document.
- Any regression in existing `memory search/store/update` behavior blocks release.
