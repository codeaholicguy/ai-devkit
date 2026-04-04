---
phase: testing
title: Testing Strategy
description: Testing plan for project-configurable memory database paths
---

# Testing Strategy

## Test Coverage Goals
- Cover 100% of new and changed code related to config parsing and path resolution.
- Verify both configured-path and default-path flows.

## Unit Tests
### Config parsing
- [ ] Reads `memory.path` when it is a non-empty string
- [ ] Ignores missing, blank, and non-string `memory.path`
- [ ] Resolves relative `memory.path` from the project config directory

### Memory command resolution
- [ ] `memory store` uses configured path when project config exists
- [ ] `memory search` uses configured path when project config exists
- [ ] `memory update` uses configured path when project config exists
- [ ] Commands fall back to `~/.ai-devkit/memory.db` when no project override exists

## Integration Tests
- [ ] Memory MCP server tool calls use the same resolved path as CLI commands
- [ ] Schema initialization still succeeds when the configured path points to a new file

## End-to-End Tests
- [ ] Manual smoke test with a checked-in `.ai-devkit.json` using a repo-local memory DB

## Test Data
- Temporary project directories with generated `.ai-devkit.json`
- Temporary database file paths for isolated runs

## Test Reporting & Coverage
- Run targeted CLI and memory package tests plus docs lint for this feature

## Manual Testing
- Confirm a repo-local configured DB file is created on first write
- Confirm commands revert to the home-directory database when config is removed

## Performance Testing
- No dedicated performance testing required beyond regression confidence

## Bug Tracking
- Watch for regressions where one memory entry point still opens `~/.ai-devkit/memory.db`
