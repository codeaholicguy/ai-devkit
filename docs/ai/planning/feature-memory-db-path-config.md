---
phase: planning
title: Project Planning & Task Breakdown
description: Task breakdown for project-configurable memory database paths
---

# Project Planning & Task Breakdown

## Milestones
- [ ] Milestone 1: Project config schema and parsing support `memory.path`
- [ ] Milestone 2: Memory command and server flows consume resolved database path
- [ ] Milestone 3: Tests cover configured path and fallback behavior

## Task Breakdown

### Phase 1: Config Support
- [ ] Task 1.1: Extend `packages/cli/src/types.ts` to type optional `memory.path`
- [ ] Task 1.2: Add `ConfigManager.getMemoryDbPath()` in `packages/cli/src/lib/Config.ts`
- [ ] Task 1.3: Add unit tests for project config parsing, including missing, invalid, absolute, and relative path cases

### Phase 2: Memory Path Wiring
- [ ] Task 2.1: Introduce a shared path-resolution flow that combines project config override with `DEFAULT_DB_PATH`
- [ ] Task 2.2: Update `packages/memory/src/api.ts` and related entry points so store/search/update use the resolved path consistently
- [ ] Task 2.3: Update the memory MCP server startup/tool handling to honor the same project-configured database path

### Phase 3: Verification
- [ ] Task 3.1: Add or update CLI tests covering memory commands with configured `memory.path`
- [ ] Task 3.2: Add or update memory package tests covering fallback to `~/.ai-devkit/memory.db`
- [ ] Task 3.3: Run targeted verification for docs lint and relevant automated tests

## Dependencies
- Task 1.1 precedes Task 1.2 because config typing should match the new parser surface.
- Task 1.2 precedes Task 2.1 and Task 2.2 because runtime resolution depends on the config accessor.
- Task 2.1 should land before Task 2.2 and Task 2.3 so all memory entry points share one resolution rule.
- Verification tasks depend on both config support and runtime wiring being complete.

## Timeline & Estimates
- Phase 1: Small, low-risk change
- Phase 2: Medium effort because path selection currently sits below config loading boundaries
- Phase 3: Small to medium effort depending on current test coverage for memory command setup

## Risks & Mitigation
- Risk: CLI commands honor config but MCP server still uses the default database.
  Mitigation: Define one shared resolver and cover both entry points in tests.
- Risk: Relative paths resolve from process cwd instead of project root.
  Mitigation: Resolve from the config file directory and add explicit unit tests.
- Risk: Invalid config values break existing users.
  Mitigation: Treat invalid values as unset and retain `DEFAULT_DB_PATH`.

## Resources Needed
- Existing config loading utilities in `packages/cli/src/lib/Config.ts`
- Existing database connection behavior in `packages/memory/src/database/connection.ts`
- Existing memory command tests in `packages/cli/src/__tests__/commands/memory.test.ts`
