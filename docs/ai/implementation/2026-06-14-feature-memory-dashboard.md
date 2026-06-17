---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
- Active worktree: `.worktrees/feature-memory-dashboard`
- Branch: `feature-memory-dashboard`
- Feature docs validated with `npx ai-devkit@latest lint --feature memory-dashboard`.
- Memory package verification uses:
  - `cd packages/memory && npx vitest run tests/integration/list.test.ts --config vitest.config.ts`
  - `cd packages/memory && npx vitest run tests/integration/summary.test.ts --config vitest.config.ts`
  - `cd packages/memory && npm run typecheck`
  - `cd packages/memory && npm test`
- Memory dashboard package verification uses:
  - `cd packages/memory-dashboard && npm test`
  - `cd packages/memory-dashboard && npm run typecheck`
  - `cd packages/memory-dashboard && npm run build`

## Code Structure
### Implemented
- `packages/memory/src/handlers/list.ts`
  - Adds `listKnowledge()` for bounded read-only memory listing.
  - Supports optional text query, scope filter, tag filters, limit, offset, and sort.
- `packages/memory/src/handlers/summary.ts`
  - Adds `getKnowledgeSummary()` for total, scope, tag, and recency counts.
- `packages/memory/src/types/index.ts`
  - Adds `ListKnowledgeInput`, `ListKnowledgeResult`, `ListKnowledgeSort`, and `KnowledgeSummaryResult`.
- `packages/memory/src/api.ts`
  - Exports `listKnowledge`, `getKnowledgeSummary`, `memoryListCommand()`, and `memorySummaryCommand()`.
- `packages/memory/tests/integration/list.test.ts`
  - Covers bounded list output, normalized fields, query filtering, scope filtering, and tag filtering.
- `packages/memory/tests/integration/summary.test.ts`
  - Covers empty summary output plus scope, tag, and recency counts.
- `packages/memory-dashboard`
  - Adds the `@ai-devkit/memory-dashboard` package scaffold, Nx project config, TypeScript/SWC/Vitest config, README, and AI DevKit plugin manifest.
- `packages/memory-dashboard/src/command.ts`
  - Registers `memory-dashboard` with `--host`, `--port`, and `--open`.
  - Resolves the configured memory database path through `runtime.getMemoryDbPath()`.
  - Starts the dashboard server and prints the URL.
- `packages/memory-dashboard/src/standalone.ts`
  - Adds a package-local standalone launcher for dashboard development without installing the plugin into AI DevKit.
  - Resolves the same default/configured memory database path as the plugin runtime.
  - Supports `--host`, `--port`, `--open`, and `--db-path`.
- `packages/memory-dashboard/src/server.ts`
  - Starts a localhost HTTP server.
  - Serves dashboard HTML from `src/ui/dashboard.html` at `/`.
  - Serves static Tailwind CSS and JavaScript assets from `/assets/styles.css` and `/assets/app.js`.
  - Serves the local Cytoscape browser module from `/assets/vendor/cytoscape.esm.min.mjs`.
  - Serves `/favicon.ico` as a no-content response to avoid noisy browser errors.
  - Serves `/api/memory`, `/api/summary`, and `/api/graph`.
  - Returns JSON errors for invalid requests.
- `packages/memory-dashboard/tests/command.test.ts`
  - Covers command option parsing, help output, and runtime memory DB path usage.
- `packages/memory-dashboard/tests/standalone.test.ts`
  - Covers standalone memory DB path resolution, configured relative paths, `--db-path`, and option parsing.
- `packages/memory-dashboard/tests/server.test.ts`
  - Covers HTML serving, static Tailwind/client asset contents, Cytoscape integration markers, favicon behavior, memory list API, summary API, graph API, invalid query handling, missing DB empty responses, and shutdown.
- `packages/memory-dashboard/src/ui/dashboard.html`
  - Contains the split dashboard shell with Tailwind utility classes.
- `packages/memory-dashboard/src/ui/tailwind.css`
  - Contains Tailwind v4 input plus component classes for memory rows, summary cards, detail text, and graph canvas sizing.
- `packages/memory-dashboard/src/ui/app.js`
  - Contains the browser controller for URL state, API loading, list/detail rendering, and Cytoscape graph rendering/interactions.
- `packages/cli/src/__tests__/services/plugin/memory-dashboard-package.test.ts`
  - Covers the concrete plugin package manifest contract.

## Implementation Notes
### Read-Only Memory APIs
- `memoryListCommand()` follows existing command-helper patterns: it opens the configured DB path, delegates to a handler, and closes the singleton database connection in `finally`.
- `listKnowledge()` keeps filtering in SQLite. It uses FTS when a text query is present, exact scope matching after `normalizeScope()`, and normalized tag filters.
- List limits are clamped between `1` and `200`; offset is clamped to a non-negative bounded value.
- `getKnowledgeSummary()` returns deterministic scope and tag ordering so dashboard facets and tests are stable.
- Recency buckets are fixed as `today`, `week`, `month`, and `older`.

### Plugin Package and Server
- `@ai-devkit/memory-dashboard` follows the existing package conventions: `project.json`, SWC build, declaration-only `tsc`, Vitest, and package-local ESLint config.
- The plugin manifest lives in `package.json` under `aiDevkit.commands` and points at `./dist/command.js`.
- `createMemoryDashboardAction()` is injectable so tests can verify command behavior without leaving a long-running server process.
- `npm run build` now compiles TypeScript, emits declarations, builds Tailwind CSS into `dist/ui/styles.css`, and copies `dashboard.html` and `app.js` into `dist/ui`.
- `npm run dev:standalone` builds the package and runs `node dist/standalone.js`, which is the preferred local development path when the plugin has not been installed into AI DevKit.
- The server binds to the requested host/port and reports the actual assigned port when `--port 0` is used.
- `/api/graph` derives memory, tag, and scope nodes from a bounded filtered result set, defaults to 250 memory items, and emits `has-tag` and `in-scope` edges.
- The dashboard shell uses a desktop workbench layout with top search/scope/tag/group controls, summary stats, a 4-row paginated records rail, and an interactive Cytoscape graph/detail workspace in the first fold.
- The client script keeps search, scope, tag, and group state in URL query parameters through `URLSearchParams` and `history.replaceState`.
- The client fetches summary, list, and graph data after state changes, then re-renders summary cards, facets, grouped records, selected detail, and Cytoscape graph output.
- Cytoscape uses semantic memory/tag/scope node styling, a natural force-directed relationship layout, selected-neighborhood highlighting/refocus, Fit/Zoom/Layout controls, resize-aware fitting, and graph/list selection sync. Graph memory nodes carry the full item payload so selecting an off-page graph memory still renders details.
- The memory list uses `limit`/`offset` pagination with a default page size of 4 records; the current page is reflected in the URL.

## Integration Points
- Dashboard server code should import `memoryListCommand()` and `memorySummaryCommand()` or the lower-level handlers through `@ai-devkit/memory`.
- The command wrappers are the best fit when the dashboard has only a DB path and wants connection cleanup handled by the memory package.
- In this worktree, `npm install --ignore-scripts` was needed to create local workspace links so `@ai-devkit/memory-dashboard` tests resolve the updated local `@ai-devkit/memory` package. `npm rebuild better-sqlite3` was then required because scripts were skipped during install.

## Error Handling
- Invalid list inputs throw the existing `ValidationError`.
- Malformed stored tag JSON maps to an empty tag array rather than breaking dashboard reads.

## Performance Considerations
- List responses are bounded by default and capped at `200`.
- Summary currently reads rows once to count tags and recency buckets. This is acceptable for MVP, but high-volume memory databases may need SQL-side JSON expansion or cached facets later.

## Security Notes
- New APIs are read-only from the dashboard perspective.
- Existing database initialization may create a missing memory DB file before reads, matching the current memory package behavior.

## Phase 7 Implementation Check
- Requirements alignment: the package lives under `packages/memory-dashboard`, declares `@ai-devkit/memory-dashboard`, registers `memory-dashboard`, resolves the memory DB path through runtime/standalone config, launches a localhost dashboard, and remains read-only.
- Design alignment: server-side memory access stays in `@ai-devkit/memory`; the dashboard server exposes `/api/memory`, `/api/summary`, and `/api/graph`; the static Tailwind/Cytoscape UI implements search, scope/tag filters, grouping, 4-row pagination, detail, graph fit/zoom/layout, and selected-neighborhood refocus.
- Verified design deviation: graph memory nodes include an optional `item` payload beyond the original graph shape so selecting an off-page graph memory can render full details without changing the visible list page. The design doc now records this payload.
- Residual implementation concerns: none blocking. Remaining items are release-readiness decisions: publishing cadence, whether browser smoke should become an automated gate, and graph scalability beyond the 250-item default graph cap.

## Phase 9 Review Check
- Final review found and fixed one release-alignment issue: `--open` now attempts to open the printed dashboard URL through a platform browser launcher and warns only when that launch fails.
- API and contract review found no blocking issues: memory dashboard endpoints remain read-only, bind through the requested host/port, use the configured memory DB path, and keep list and graph responses bounded by default.
- Security review found no direct HTML rendering of memory content; the client inserts memory fields with DOM text APIs.
- Remaining non-blocking release checks are manual: installed plugin command help, real default memory DB launch, empty/missing DB browser smoke, and keyboard focus review.

## Manual Smoke Workflow
- Build the package with `cd packages/memory-dashboard && npm run build`.
- For local development without plugin installation, run `cd packages/memory-dashboard && npm run dev:standalone`.
- To use a fixture DB, run `cd packages/memory-dashboard && npm run dev:standalone -- --db-path /tmp/memory.db --port 3000`.
- Launch through a plugin runtime or package-local helper with the runtime memory DB path, defaulting to `127.0.0.1` and an available port.
- Confirm `npm run dev:standalone -- --help` exposes `--host`, `--port`, `--db-path`, and `--open`.
- Confirm `memory-dashboard --help` exposes `--host`, `--port`, and `--open` after plugin installation.
- Open the printed local URL and verify summary cards, scope/tag facets, grouped records, detail view, and Cytoscape graph render.
- Click memory rows and graph controls to verify selection highlighting, detail sync, Fit, Zoom In, Zoom Out, and Layout behavior.
- Use Next/Previous pagination to verify list pages advance without list scrolling and preserve page state in the URL.
- Search for a known memory title, select scope and tag filters, switch group modes between scope/tag/recency, and confirm the URL query string tracks state.
- Search for a no-match term to confirm the empty list, neutral detail prompt, and empty graph state.
- Repeat at desktop and narrow mobile widths and check the browser console for errors.

## Verification Evidence
- Red step for list API: `cd packages/memory && npx vitest run tests/integration/list.test.ts --config vitest.config.ts` failed because `memoryListCommand is not a function`.
- Green step for list API: same command exited `0`, `1 passed`, `2 passed`.
- Red step for summary API: `cd packages/memory && npx vitest run tests/integration/summary.test.ts --config vitest.config.ts` failed because `memorySummaryCommand is not a function`.
- Green step for summary API: same command exited `0`, `1 passed`, `2 passed`.
- Package typecheck: `cd packages/memory && npm run typecheck` exited `0`.
- Package tests: `cd packages/memory && npm test` exited `0`, `10 passed`, `109 passed`.
- CLI memory regression: `cd packages/cli && npx vitest run src/__tests__/commands/memory.test.ts --config vitest.config.ts` exited `0`, `1 passed`, `10 passed`.
- Plugin package manifest red step: `cd packages/cli && npx vitest run src/__tests__/services/plugin/memory-dashboard-package.test.ts --config vitest.config.ts` failed because `packages/memory-dashboard/package.json` did not exist.
- Plugin package manifest green step: same command exited `0`, `1 passed`, `1 passed`.
- Command red step: `cd packages/memory-dashboard && npx vitest run tests/command.test.ts --config vitest.config.ts` failed because `createMemoryDashboardAction is not a function`.
- Command green step: same command exited `0`, `1 passed`, `2 passed`.
- Server red step: `cd packages/memory-dashboard && npx vitest run tests/server.test.ts --config vitest.config.ts` failed because the server was still a stub that did not bind a socket.
- Server green step: same command exited `0`, `1 passed`, `3 passed`.
- Memory dashboard package tests: `cd packages/memory-dashboard && npm test` exited `0`, `2 passed`, `5 passed`.
- Memory dashboard typecheck: `cd packages/memory-dashboard && npm run typecheck` exited `0`.
- Memory dashboard build: `cd packages/memory-dashboard && npm run build` exited `0`, `Successfully compiled: 3 files with swc`.
- Dashboard shell red step: `cd packages/memory-dashboard && npx vitest run tests/server.test.ts --config vitest.config.ts` failed because placeholder HTML did not include required controls.
- Dashboard shell green step: same command exited `0`, `1 passed`, `3 passed`.
- Favicon red step: `cd packages/memory-dashboard && npx vitest run tests/server.test.ts --config vitest.config.ts` failed because `/favicon.ico` returned `404`.
- Favicon green step: same command exited `0`, `1 passed`, `4 passed`.
- Client graph-label red step: `cd packages/memory-dashboard && npx vitest run tests/server.test.ts --config vitest.config.ts` failed because the client asset lacked `truncateGraphLabel()`.
- Client graph-label green step: same command exited `0`, `1 passed`, `4 passed`.
- Browser smoke: launched a built dashboard package against a seeded temporary memory database at `http://127.0.0.1:41739`.
- Browser smoke initial load: Playwright verified summary cards, scope/tag facets, grouped memory rows, detail view, SVG graph nodes/edges, and zero console errors.
- Browser smoke search: entering `alpha` updated the URL to `?query=alpha`, narrowed the list to `Dashboard smoke alpha memory`, updated detail, and reduced graph nodes.
- Browser smoke scope filter: selecting `project:ai-devkit` updated the URL with `scope=project%3Aai-devkit` and kept only matching records.
- Browser smoke tag/grouping: selecting tag `graph` and group `tag` updated the URL to `?tag=graph&group=tag`, rendered `dashboard` and `graph` sections, and showed the beta record in both tag groups.
- Browser smoke recency grouping: selecting group `recency` rendered the `today` section for the seeded record.
- Browser smoke empty state: searching `nomatch-memory-dashboard` rendered the no-results message, neutral detail prompt, and empty graph region without overlap.
- Browser smoke responsive layout: desktop `1440x1000` and mobile `390x844` screenshots showed stacked controls and non-overlapping graph labels; current console errors were `0` in both views.
- Final memory dashboard package tests: `cd packages/memory-dashboard && npm test` exited `0`, `2 passed`, `8 passed`.
- Final memory dashboard typecheck: `cd packages/memory-dashboard && npm run typecheck` exited `0`.
- Final memory dashboard build: `cd packages/memory-dashboard && npm run build` exited `0`, `Successfully compiled: 3 files with swc`.
- Final memory package tests: `cd packages/memory && npm test` exited `0`, `10 passed`, `109 passed`.
- Final CLI plugin manifest test: `cd packages/cli && npx vitest run src/__tests__/services/plugin/memory-dashboard-package.test.ts --config vitest.config.ts` exited `0`, `1 passed`, `1 passed`.
- Feature lint: `npx ai-devkit@latest lint --feature memory-dashboard` exited `0`, all checks passed.
- Command help and missing DB coverage is included in the final memory dashboard package test run.
- Standalone red step: `cd packages/memory-dashboard && npx vitest run tests/standalone.test.ts --config vitest.config.ts` failed because `../src/standalone` did not exist.
- Standalone green step: same command exited `0`, `1 passed`, `4 passed`.
- Standalone script help: `cd packages/memory-dashboard && npm run dev:standalone -- --help` exited `0`, built 4 files, and printed `--host`, `--port`, `--db-path`, and `--open`.
- Standalone launch smoke: `cd packages/memory-dashboard && npm run dev:standalone -- --db-path /tmp/ai-devkit-memory-dashboard-standalone-smoke.db --port 41740` built 4 files and printed `Memory dashboard: http://127.0.0.1:41740`; the smoke server was then stopped.
- Final memory dashboard package tests after standalone launcher: `cd packages/memory-dashboard && npm test` exited `0`, `3 passed`, `12 passed`.
- Final memory dashboard typecheck after standalone launcher: `cd packages/memory-dashboard && npm run typecheck` exited `0`.
- Final memory dashboard build after standalone launcher: `cd packages/memory-dashboard && npm run build` exited `0`, `Successfully compiled: 4 files with swc`.
- Cytoscape/Tailwind red step: `cd packages/memory-dashboard && npx vitest run tests/server.test.ts --config vitest.config.ts` failed because the old embedded SVG HTML lacked `graph-selected-title`, `graph-fit`, and Cytoscape client markers.
- Cytoscape/Tailwind green step: same command exited `0`, `1 passed`, `5 passed`.
- Final memory dashboard package tests after Cytoscape/Tailwind split: `cd packages/memory-dashboard && npm test` exited `0`, `3 passed`, `12 passed`.
- Final memory dashboard typecheck after Cytoscape/Tailwind split: `cd packages/memory-dashboard && npm run typecheck` exited `0`.
- Final memory dashboard build after Cytoscape/Tailwind split: `cd packages/memory-dashboard && npm run build` exited `0`, `Successfully compiled: 5 files with swc`; Tailwind v4.3.1 completed successfully.
- Browser smoke after Cytoscape/Tailwind split: launched `http://127.0.0.1:41741` with three seeded records, verified `#memory-graph` contained three Cytoscape canvases, graph panel measured about `606x620` on desktop, and current console errors/warnings were `0`.
- Browser smoke interaction after Cytoscape/Tailwind split: clicking `Tailwind split frontend memory` updated `#graph-selected-title`, detail title, and selected row state; Fit and Layout buttons ran with `0` console errors/warnings.
- Browser smoke mobile after Cytoscape/Tailwind split: at `390x844`, filters, list, graph controls, graph canvas, and detail stacked cleanly with `0` console errors/warnings.
- Superseded desktop bounded-list smoke: launched `http://127.0.0.1:41742` with 23 seeded records; Playwright verified graph canvas count `3`, graph panel about `606x664`, Zoom In/Zoom Out/Fit/Layout controls present, and `0` console errors/warnings before the records rail changed to all-entry internal scrolling.
- Superseded desktop bounded-list interaction smoke: clicking the old list navigation changed the URL and graph controls ran with `0` console errors/warnings before the records rail changed to all-entry internal scrolling.
- Desktop workbench/refocus smoke: launched `http://127.0.0.1:41744` with 23 seeded records; Playwright verified 4 visible rows, no list scrolling, pagination `1-4 of 23`, summary inline with the H1, graph memory count `23`, selecting an off-page graph memory rendered that memory detail, and current console errors/warnings were `0`.
