---
phase: testing
title: Testing Strategy
description: Testing plan for project-configurable memory database paths
---

# Testing Strategy

## Test Coverage Goals
- Cover 100% of new and changed code related to config parsing and path resolution.
- Verify both configured-path and default-path flows.
- Keep standalone `@ai-devkit/memory` server behavior unchanged.

## Unit Tests
### Config parsing
- [x] Reads `memory.path` when it is a non-empty string
- [x] Ignores missing, blank, and non-string `memory.path`
- [x] Resolves relative `memory.path` from the project config directory
  Implemented in `packages/cli/src/__tests__/lib/Config.test.ts`

### Memory command resolution
- [x] `memory store` uses configured path when project config exists
- [x] `memory search` uses configured path when project config exists
- [x] `memory update` uses configured path when project config exists
- [x] Commands fall back to `~/.ai-devkit/memory.db` when no project override exists
  Verified by default `dbPath: undefined` expectations and configured-path expectations in `packages/cli/src/__tests__/commands/memory.test.ts`

## Integration Tests
- [x] Schema initialization succeeds when the configured path points to a new file
- [x] Memory API store/search/update calls use an explicit configured `dbPath`
  Implemented in `packages/memory/tests/integration/api.test.ts`
- [x] Standalone memory MCP server remains out of scope and unchanged
  Covered by design/requirements scope, not by new behavior tests

## End-to-End Tests
- [x] Automated CLI e2e test uses a temp-project `.ai-devkit.json` with repo-local `memory.path`
  Implemented in `e2e/cli.e2e.ts`
- [x] Manual smoke test with a checked-in `.ai-devkit.json` using a repo-local memory DB
  Verified via built CLI store/search run in a temporary project directory with `.ai-devkit.json` pointing to `.ai-devkit/project-memory.db`

## Test Data
- Temporary project directories with generated `.ai-devkit.json`
- Temporary database file paths for isolated runs

## Test Reporting & Coverage
- Ran `npm test -- --runInBand Config.test.ts memory.test.ts` in `packages/cli`
- Ran `npm test -- --runInBand tests/integration/api.test.ts` in `packages/memory`
- Ran `npm run test:e2e -- cli.e2e.ts`
- Ran `npx ai-devkit@latest lint --feature memory-db-path-config`
- Did not run a full coverage report command in this phase; targeted suites were used for feature verification

## Manual Testing
- Confirmed a repo-local configured DB file is created on first write
- Confirmed built CLI search reads back from the configured repo-local DB
- Default fallback is covered by unit tests rather than a separate manual run

## Performance Testing
- No dedicated performance testing required beyond regression confidence

## Bug Tracking
- Watch for regressions where one CLI memory subcommand omits `dbPath` and reverts to `~/.ai-devkit/memory.db`
