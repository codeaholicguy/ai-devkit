---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement
AI DevKit memory is currently manageable through CLI commands such as `memory search`, `memory store`, and `memory update`. That works for precise command-line usage, but it is a poor fit for browsing, assessing, grouping, and understanding the shape of accumulated knowledge over time.

Users need a lightweight local web dashboard that can be installed as an AI DevKit plugin package, launched from the AI DevKit CLI, and used to inspect memory records without manually querying SQLite or repeatedly crafting CLI searches.

## Goals & Objectives
### Primary Goals
- Create a new package under `packages/` named `@ai-devkit/memory-dashboard`.
- Ship it as an installable AI DevKit plugin using the existing `package.json` `aiDevkit.commands` contract.
- Add a plugin command named `memory-dashboard` that launches a local web application.
- Provide a minimum read-only dashboard for browsing and assessing memory records.
- Reuse the configured AI DevKit memory database path via the plugin runtime `getMemoryDbPath()`.
- Support search, filtering, grouping, and a basic graph view in the first usable version.

### Secondary Goals
- Keep the first release local-only and dependency-light enough to fit the monorepo's existing Node/Nx package style.
- Provide a concrete first-party plugin package that exercises the plugin foundation with a real user-facing tool.
- Keep the dashboard useful against both an existing populated memory database and a new empty database.

### Non-Goals
- Hosted, multi-user, or remote dashboard deployment.
- Authentication beyond binding to localhost for the local development server.
- Editing, deleting, merging, or bulk importing memories in the first release.
- Replacing the existing memory CLI or MCP server.
- Full semantic clustering, embeddings, or AI-generated summaries.
- Project-local plugin installation behavior beyond the existing global plugin system.

## User Stories & Use Cases
- As an AI DevKit user, I want to run `ai-devkit memory-dashboard` so that I can open a local UI for memory without leaving the AI DevKit toolchain.
- As an AI DevKit user, I want to search memory by text so that I can find relevant records without remembering exact CLI flags.
- As an AI DevKit user, I want to filter by scope and tags so that I can assess project-specific and global knowledge separately.
- As an AI DevKit user, I want to group memories by scope, tag, and recency so that I can spot stale, overloaded, or underused areas.
- As an AI DevKit user, I want to inspect a memory's title, content, tags, scope, and timestamps so that I can judge whether it is still useful.
- As an AI DevKit user, I want a graph view of memory relationships so that I can see connections between scopes, tags, and memory items.
- As a plugin developer, I want this package to follow the existing plugin manifest and runtime contract so that it is a concrete first-party plugin example.

### Minimum Workflows
1. **Install Plugin**
   - User installs the package with `ai-devkit plugin add @ai-devkit/memory-dashboard` once the package is published or otherwise available to npm.
   - AI DevKit validates the package manifest and registers the `memory-dashboard` command.
2. **Launch Dashboard**
   - User runs `ai-devkit memory-dashboard`.
   - The command resolves the configured memory database path from the AI DevKit runtime.
   - The command starts a localhost-only HTTP server and prints the dashboard URL.
   - If `--open` is provided, the command attempts to open the browser when the host environment supports it.
3. **Browse and Assess Memory**
   - Dashboard loads memory summary statistics and a paginated or bounded list.
   - User searches by text, filters by tags/scope, and opens an item detail view.
   - User groups results by scope, tag, or recency.
4. **View Memory Graph**
   - Dashboard shows a basic graph connecting memory items to tag and scope nodes.
   - Selecting a node filters or highlights related memory items.

### Edge Cases
- Memory database path is configured but the file does not exist yet.
- Memory database exists but contains no records.
- Memory database contains many records with high-cardinality tags.
- Memory records have no tags.
- Search query has no matches.
- Configured memory database path is invalid or not readable.
- Requested dashboard port is already in use.
- Browser auto-open is unavailable in the current environment.

## Success Criteria
### Acceptance Criteria
- `packages/memory-dashboard` exists with package name `@ai-devkit/memory-dashboard`.
- The package declares an AI DevKit plugin manifest with a `memory-dashboard` JavaScript entrypoint.
- `ai-devkit memory-dashboard --help` is available after plugin registration.
- The command can launch a localhost dashboard using the memory DB path returned by `runtime.getMemoryDbPath()`.
- The dashboard lists memory items with title, scope, tags, created date, and updated date.
- The dashboard supports text search using the existing memory search behavior or equivalent SQLite FTS query behavior.
- The dashboard supports filtering by scope and tag.
- The dashboard supports grouping by scope, tag, and recency bucket.
- The dashboard renders a basic graph containing memory item, tag, and scope nodes.
- Empty databases and missing memory databases produce a useful empty state instead of a crash.
- The feature is covered by unit tests for data access/filtering/grouping and command registration behavior.
- The feature is covered by at least one integration or browser-level smoke test for dashboard rendering.

### Performance Expectations
- The default memory list response is bounded and does not load the full database for large datasets.
- Search and filter operations are served by database queries or memory-package helpers, not by requiring a full client-side scan.
- The graph view remains usable by limiting or aggregating nodes when tag or memory counts are high.

## Constraints & Assumptions
### Technical Constraints
- The dashboard package must live in `packages/`, matching the user's request and the monorepo workspace configuration.
- The plugin command name must not conflict with built-in commands; `memory-dashboard` satisfies the current plugin command naming rules.
- Plugin entrypoints must be built JavaScript files; the package may be authored in TypeScript but cannot require runtime TypeScript loading.
- The first release treats plugins as trusted local npm code, matching the existing plugin foundation.
- The memory package currently exposes store/search/update command helpers but does not expose a full list/stat/graph API. The dashboard feature may add read-only helper APIs to `@ai-devkit/memory` rather than reading SQLite from UI code directly.

### Assumptions
- The first release is read-only to avoid accidental data loss while the dashboard's information architecture is validated.
- The graph can be derived from existing memory metadata: memory item -> tag and memory item -> scope edges. No new persisted graph schema is required for MVP.
- "Minimum requirement" means a useful local dashboard with core browse/search/filter/group/graph capabilities, not a full memory admin suite.

## Questions & Open Items
### Resolved
- MVP scope is an installable local AI DevKit plugin package, not a built-in core CLI dashboard.
- MVP data access is read-only.
- MVP graph is derived from existing tags and scopes.
- The package lives under `packages/` and uses the existing plugin manifest contract.
- The dashboard launches from `ai-devkit memory-dashboard`.
- The command prints a URL by default and uses `--open` as an opt-in browser launch flag.

### Alternatives Considered
- **Core CLI dashboard**: rejected because the user asked for an installable plugin and the plugin foundation exists.
- **Direct SQLite access only from the dashboard package**: rejected because it duplicates memory internals; add read-only memory APIs where needed.
- **Mutation-first memory manager**: rejected for MVP because browsing and assessment are the minimum useful baseline and mutation needs stronger safety UX.

### Deferred
- Whether the web UI should use a static vanilla frontend or a bundled framework; the requirement is only that it remains local, installable, and maintainable in this monorepo.
- Editing, deleting, merging, and quality scoring memories after the read-only dashboard ships.
