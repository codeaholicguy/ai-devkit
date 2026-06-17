---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
---

# System Design & Architecture

## Architecture Overview

```mermaid
flowchart TD
  User[User] -->|ai-devkit memory-dashboard| Cli[AI DevKit CLI]
  Cli --> PluginLoader[Configured plugin loader]
  PluginLoader --> Manifest[@ai-devkit/memory-dashboard package manifest]
  Manifest --> Command[dist/command.js register()]
  Command --> Runtime[AiDevkitRuntime]
  Runtime -->|getMemoryDbPath| MemoryDb[(SQLite memory.db)]
  Command --> Server[Local dashboard HTTP server]
  Server --> MemoryApi[@ai-devkit/memory read APIs]
  MemoryApi --> MemoryDb
  Browser[Browser UI] -->|localhost HTTP/JSON| Server
  Browser --> List[Memory list and detail]
  Browser --> Facets[Filters and grouping]
  Browser --> Graph[Interactive Cytoscape tag/scope graph]
```

The dashboard is a first-party AI DevKit plugin package. AI DevKit loads its manifest from `package.json`, registers the `memory-dashboard` command, and passes the existing plugin runtime to the command entrypoint. The command starts a localhost-only HTTP server that serves static UI assets and JSON endpoints backed by read-only APIs in `@ai-devkit/memory`.

### Technology Stack
- Node.js HTTP server using the built-in `node:http` module for the MVP.
- TypeScript source compiled to JavaScript before plugin execution.
- Static browser UI built from framework-free HTML, Tailwind-generated CSS, and a JavaScript client module.
- Cytoscape.js for the graph view so the memory graph is interactive, styled independently from data, and visually as important as the list.
- Existing `@ai-devkit/memory` database and query utilities for server-side data access.

## Data Models

### Memory Dashboard Item
```typescript
interface MemoryDashboardItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  scope: string;
  createdAt: string;
  updatedAt: string;
  score?: number;
}
```

### Memory Query
```typescript
interface MemoryDashboardQuery {
  query?: string;
  tags?: string[];
  scope?: string;
  limit?: number;
  offset?: number;
  sort?: 'updated-desc' | 'created-desc' | 'title-asc';
}
```

### Summary and Facets
```typescript
interface MemoryDashboardSummary {
  totalItems: number;
  scopes: Array<{ scope: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  recency: Array<{ bucket: 'today' | 'week' | 'month' | 'older'; count: number }>;
}
```

### Graph
```typescript
interface MemoryGraph {
  nodes: Array<{
    id: string;
    label: string;
    type: 'memory' | 'tag' | 'scope';
    count?: number;
    item?: MemoryDashboardItem;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: 'has-tag' | 'in-scope';
  }>;
}
```

## API Design

### Plugin Command
```bash
ai-devkit memory-dashboard [--host 127.0.0.1] [--port 0] [--open]
```

- `--host` defaults to `127.0.0.1`.
- `--port 0` lets the OS choose a free port by default.
- The command prints the dashboard URL and keeps the server running until interrupted.
- `--open` opts into browser launch. The default is URL-only so headless shells, CI, and agent sessions behave predictably.

### Local HTTP Endpoints
```text
GET /                 -> dashboard HTML
GET /assets/*         -> static JS/CSS/vendor graph assets
GET /api/memory       -> list/search memory items with query parameters
GET /api/summary      -> counts by scope, tag, and recency
GET /api/graph        -> graph nodes and edges
```

`GET /api/memory` accepts `query`, `scope`, repeated `tag`, `limit`, `offset`, and `sort` query parameters. Limits are clamped to a safe maximum. Invalid values return a JSON `400` response.

`GET /api/graph` accepts the same filtering parameters plus an optional `maxItems`. The server derives graph nodes from the bounded filtered item set and aggregates high-cardinality tag or scope nodes with counts where necessary.

### Memory Package Additions
Add read-only helpers to `@ai-devkit/memory` so the dashboard does not duplicate database connection and schema mapping details:

```typescript
interface ListKnowledgeInput {
  query?: string;
  tags?: string[];
  scope?: string;
  limit?: number;
  offset?: number;
  sort?: 'updated-desc' | 'created-desc' | 'title-asc';
}

interface ListKnowledgeResult {
  items: KnowledgeItem[];
  total: number;
}

interface KnowledgeSummaryResult {
  totalItems: number;
  scopes: Array<{ scope: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  recency: Array<{ bucket: string; count: number }>;
}
```

The helper APIs may open the database with normal write capability only to preserve current schema initialization behavior for a missing database file. Dashboard operations themselves must remain read-only: no store, update, delete, merge, or schema-changing dashboard endpoint is exposed.

## Component Breakdown

### `packages/memory-dashboard`
- `package.json` declares package metadata, build scripts, and `aiDevkit.commands`.
- `src/command.ts` exports `register(command, runtime)`.
- `src/server.ts` creates the HTTP server, resolves static assets, serves the local Cytoscape browser module, and wires API routes.
- `src/ui/dashboard.html` contains the dashboard shell and Tailwind utility classes.
- `src/ui/tailwind.css` is the Tailwind input and component layer for graph/list/detail surfaces.
- `src/ui/app.js` owns query/filter/grouping state, list/detail rendering, and Cytoscape graph interactions.

### `packages/memory`
- Add read-only list and summary APIs.
- Keep database access server-side and Node-only.
- Reuse existing database initialization and row mapping conventions.

### Dashboard UI
- Main layout: desktop workbench with top search/filter controls, a 4-row paginated records rail, and a graph/detail workspace visible in the first fold.
- Dense operational UI rather than a marketing landing page.
- Graph view uses existing metadata and does not require persistent graph storage.
- Cytoscape renders memory, tag, and scope nodes with semantic styling, a natural force-directed layout, selected-neighborhood highlighting/refocus, fit, zoom, and layout controls.
- Initial state shows total count, scope/tag facets, recent memory items, and an empty-state message when no records exist.
- Search/filter/grouping state is represented in URL query parameters so refreshes preserve the current view.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Package location | `packages/memory-dashboard` | Matches monorepo workspace and user request. |
| Integration model | AI DevKit plugin command | Uses the existing plugin host instead of hard-coding dashboard into core CLI. |
| Server binding | `127.0.0.1` by default | Keeps memory data local to the user's machine. |
| Data access | Add read-only APIs to `@ai-devkit/memory` | Avoids duplicating SQLite schema knowledge in the dashboard package. |
| MVP permissions | Read-only | Reduces risk while browse/assessment UX is validated. |
| Graph model | Derived item/tag/scope graph | Gives immediate value with current metadata and no schema migration. |
| Browser opening | URL-only by default with `--open` opt-in | Avoids GUI assumptions in terminals, CI, and agent sessions while still supporting local convenience. |
| Frontend stack | Framework-free static UI with Tailwind output | Keeps runtime simple while making the split HTML/CSS/JS assets maintainable. |
| Graph library | Cytoscape.js | Provides graph layouts, styling, selection, gestures, and canvas rendering without maintaining a custom SVG layout. |

### Alternatives Considered
- **Add dashboard to core CLI package**: rejected because the user wants an installable plugin package and plugin foundation now exists.
- **Read SQLite directly from the dashboard package**: rejected because it duplicates memory package internals and makes schema changes harder.
- **Use the existing `memory search` CLI as a subprocess**: rejected because it makes pagination, facets, and graph data awkward and slower.
- **Build edit/delete workflows in MVP**: deferred because data mutation requires stronger confirmation UX and backup behavior.
- **Open browser automatically by default**: rejected because it is brittle in headless shells and less predictable for agents.
- **Use React/Vite for the MVP**: deferred because the initial dashboard can meet the minimum requirement with static HTML, Tailwind output, and simpler packaging.

## Non-Functional Requirements

### Performance
- Default result limit should prevent loading very large memory databases in one response.
- Search and filters should rely on SQLite queries, not client-side scanning after full database load.
- Graph endpoint may cap memory item nodes and aggregate high-cardinality tags if needed.
- API endpoints should keep default responses small enough for responsive local browser rendering.

### Security
- Bind to localhost by default.
- Do not expose the dashboard on external interfaces unless the user explicitly passes a different host.
- Do not log full memory contents unless the user requests debugging.
- Treat memory content as local sensitive developer data.
- Local HTTP responses must use JSON serialization and DOM text insertion patterns that avoid rendering memory content as HTML.

### Reliability
- Missing database files should show an empty dashboard.
- Invalid query parameters should return JSON errors without crashing the server.
- Server shutdown should close database connections cleanly.
- Port conflicts should produce a clear error unless the user leaves `--port 0` enabled.
- Browser launch failures with `--open` should warn and keep the printed URL usable.
